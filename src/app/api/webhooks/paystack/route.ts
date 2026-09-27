import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendTextMessage } from "@/lib/whatsapp";
import { createHmac } from "crypto";

/**
 * POST /api/webhooks/paystack
 *
 * Listens for Paystack subscription events:
 * - charge.success         → set plan_status=active, update current_period_end
 * - subscription.disable    → set plan_status=cancelled
 * - invoice.payment_failed  → set plan_status=past_due, notify tenant
 */
export async function POST(request: NextRequest) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const signature = request.headers.get("x-paystack-signature");
  const body = await request.text();

  // Verify signature — mandatory, not optional
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  const hash = createHmac("sha512", secret).update(body).digest("hex");
  if (hash !== signature) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = event.event as string;
  const data = event.data;

  if (!eventType || !data) {
    return NextResponse.json({ ok: true });
  }

  const supabase = createAdminClient();

  try {
    switch (eventType) {
      case "charge.success": {
        // Subscription charge succeeded — tenant is in good standing
        const subscriptionCode = data.subscription?.subscription_code;
        const customerCode = data.customer?.customer_code;
        const nextPaymentDate = data.subscription?.next_payment_date;

        if (!subscriptionCode && !customerCode) break;

        // Find tenant by subscription or customer code
        const query = subscriptionCode
          ? supabase
              .from("tenants")
              .select("id, paystack_subscription_id, whatsapp_number, plan_tier")
              .eq("paystack_subscription_id", subscriptionCode)
          : supabase
              .from("tenants")
              .select("id, paystack_customer_id, whatsapp_number, plan_tier")
              .eq("paystack_customer_id", customerCode);

        const { data: tenantData } = await query.single();

        if (tenantData) {
          const update: Record<string, unknown> = {
            plan_status: "active",
          };
          if (nextPaymentDate) {
            update.current_period_end = nextPaymentDate;
          }

          // Sync plan tier from Paystack plan code if present
          const planCode = data.plan?.plan_code || data.subscription?.plan?.plan_code;
          if (planCode) {
            if (process.env.PAYSTACK_PRO_PLAN_CODE && planCode === process.env.PAYSTACK_PRO_PLAN_CODE) {
              update.plan_tier = "pro";
              update.monthly_message_limit = -1;
            } else if (process.env.PAYSTACK_STARTER_PLAN_CODE && planCode === process.env.PAYSTACK_STARTER_PLAN_CODE) {
              update.plan_tier = "starter";
              update.monthly_message_limit = Number(process.env.STARTER_MESSAGE_LIMIT) || 200;
            }
          }

          await supabase
            .from("tenants")
            .update(update)
            .eq("id", tenantData.id);

          // Send celebratory WhatsApp confirmation to the merchant
          if (tenantData.whatsapp_number) {
            const rawTier = (update.plan_tier as string) || tenantData.plan_tier || "SparkBooks";
            const tierLabel = rawTier.charAt(0).toUpperCase() + rawTier.slice(1);
            try {
              await sendTextMessage(
                tenantData.whatsapp_number,
                `🎉 *Subscription Confirmed!*\n\nYour *${tierLabel}* plan is active and ready to use on SparkBooks. Thank you for your payment!`
              );
            } catch (err) {
              console.warn("Could not send WhatsApp subscription confirmation:", err);
            }
          }
        }
        break;
      }

      case "subscription.disable": {
        // Subscription cancelled or disabled — respect current_period_end, don't hard-downgrade
        const subscriptionCode = data.subscription_code || data.code;

        if (!subscriptionCode) break;

        const { data: tenantData } = await supabase
          .from("tenants")
          .select("id, current_period_end, whatsapp_number")
          .eq("paystack_subscription_id", subscriptionCode)
          .single();

        if (tenantData) {
          // Only downgrade if the billing period has actually ended
          const now = new Date();
          const periodEnd = tenantData.current_period_end
            ? new Date(tenantData.current_period_end)
            : null;

          if (periodEnd && periodEnd > now) {
            // Period hasn't ended yet — just mark as cancelled but keep paid access
            await supabase
              .from("tenants")
              .update({
                plan_status: "cancelled",
                // Keep current plan_tier and limits until period_end
              })
              .eq("id", tenantData.id);

            if (tenantData.whatsapp_number) {
              const formattedDate = periodEnd.toLocaleDateString("en-NG", {
                month: "short",
                day: "numeric",
                year: "numeric",
              });
              try {
                await sendTextMessage(
                  tenantData.whatsapp_number,
                  `ℹ️ Your SparkBooks subscription has been cancelled. Your paid benefits remain active until *${formattedDate}*.`
                );
              } catch (err) {
                console.warn("Could not send WhatsApp cancellation notice:", err);
              }
            }
          } else {
            // Period ended or no period_end — downgrade to free now
            await supabase
              .from("tenants")
              .update({
                plan_status: "cancelled",
                plan_tier: "free",
                monthly_message_limit: 30,
                paystack_subscription_id: null,
              })
              .eq("id", tenantData.id);
          }
        }
        break;
      }

      case "invoice.payment_failed": {
        // Payment failed — mark past_due, do NOT cut off access yet
        const subscriptionCode =
          data.subscription?.subscription_code || data.subscription_code;

        if (!subscriptionCode) break;

        const { data: tenantData } = await supabase
          .from("tenants")
          .select("id, whatsapp_number")
          .eq("paystack_subscription_id", subscriptionCode)
          .single();

        if (tenantData) {
          await supabase
            .from("tenants")
            .update({ plan_status: "past_due" })
            .eq("id", tenantData.id);

          // Notify the tenant via WhatsApp
          if (tenantData.whatsapp_number) {
            const appUrl =
              process.env.NEXT_PUBLIC_APP_URL ?? "https://sparkbooks.io";
            try {
              await sendTextMessage(
                tenantData.whatsapp_number,
                `Your SparkBooks ${data.subscription?.plan?.name ?? "subscription"} payment didn't go through. Update your payment method to avoid interruption: ${appUrl}/dashboard/billing`,
              );
            } catch {
              // Template fallback would go here
            }
          }
        }
        break;
      }

      default:
        // Unhandled event — acknowledge
        break;
    }
  } catch (err) {
    console.error("Paystack webhook error:", err);
    // Return 200 anyway so Paystack doesn't retry indefinitely
    return NextResponse.json({ ok: true, error: "Processing error" });
  }

  return NextResponse.json({ ok: true });
}
