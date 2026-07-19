import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Refund and Billing Policy – SparkBooks",
  description:
    "How billing, cancellations, downgrades, and refunds work for SparkBooks subscriptions.",
};

export default function RefundPage() {
  return (
    <section className="w-full max-w-3xl mx-auto px-6 pt-16 pb-24 sm:pt-24 sm:pb-32">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink transition-colors mb-8"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10 3L5 8l5 5" />
        </svg>
        Back to home
      </Link>

      <h1 className="font-display text-3xl sm:text-4xl tracking-tight text-ink mb-2">
        Refund and Billing Policy
      </h1>

      <p className="text-sm text-ink-muted mb-12">
        Last Updated: July 18, 2026
      </p>

      <p className="text-ink-muted leading-relaxed mb-10">
        This policy explains how billing, cancellations, downgrades, and refunds
        work for SparkBooks subscriptions, operated by UltimaSpark Agency.
      </p>

      <div className="space-y-10">
        {/* 1. Billing Cycle */}
        <section>
          <h2 className="font-display text-xl text-ink mb-3">
            1. Billing Cycle
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-ink-muted leading-relaxed">
            <li>
              Starter and Pro plan subscriptions are billed monthly through
              Paystack, starting from the date you first subscribe.
            </li>
            <li>
              Your plan automatically renews each month unless you cancel before
              the renewal date.
            </li>
            <li>
              Message limits and usage counters reset at the start of each new
              billing cycle.
            </li>
          </ul>
        </section>

        {/* 2. Cancellations */}
        <section>
          <h2 className="font-display text-xl text-ink mb-3">
            2. Cancellations
          </h2>
          <p className="text-ink-muted leading-relaxed mb-3">
            You may cancel your subscription at any time from Dashboard →
            Billing → &ldquo;Downgrade to Free.&rdquo;
          </p>
          <ul className="list-disc pl-5 space-y-2 text-ink-muted leading-relaxed">
            <li>
              If you cancel, you will retain access to your paid plan&apos;s
              features until the end of your current billing period.
            </li>
            <li>
              Once the billing period ends, your account will automatically move
              to the Free plan, and Free plan limits (30 messages/month, 15
              products) will apply going forward.
            </li>
            <li>
              Your existing data, products, and ledger history are not deleted
              when you downgrade — only your ongoing message and product limits
              change.
            </li>
          </ul>
        </section>

        {/* 3. Refunds */}
        <section>
          <h2 className="font-display text-xl text-ink mb-3">3. Refunds</h2>
          <ul className="list-disc pl-5 space-y-2 text-ink-muted leading-relaxed">
            <li>
              Subscription payments are generally{" "}
              <strong className="text-ink">non-refundable</strong> once a
              billing cycle has started, as you retain full access to the paid
              plan for that period.
            </li>
            <li>
              If you believe you were charged in error (for example, a duplicate
              charge or a charge after a successful cancellation), contact us
              within <strong className="text-ink">7 days</strong> of the charge
              and we will investigate and issue a refund if warranted.
            </li>
            <li>
              We do not offer partial refunds for unused time within a billing
              cycle if you cancel mid-cycle — you retain access through the end
              of the period you already paid for instead.
            </li>
          </ul>
        </section>

        {/* 4. Failed Payments */}
        <section>
          <h2 className="font-display text-xl text-ink mb-3">
            4. Failed Payments
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-ink-muted leading-relaxed">
            <li>
              If a scheduled payment fails, your account will be marked &ldquo;past
              due.&rdquo; We will notify you via WhatsApp.
            </li>
            <li>
              If payment is not resolved, your account will be downgraded to the
              Free plan and paid features will no longer be accessible until you
              resubscribe.
            </li>
            <li>
              No penalty fees are charged for failed payments beyond the
              standard subscription amount.
            </li>
          </ul>
        </section>

        {/* 5. Plan Changes */}
        <section>
          <h2 className="font-display text-xl text-ink mb-3">
            5. Plan Changes
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-ink-muted leading-relaxed">
            <li>
              You may upgrade from Starter to Pro (or vice versa) at any time
              from your Billing dashboard.
            </li>
            <li>
              Upgrades take effect immediately; you will be billed the new
              plan&apos;s rate on your next billing cycle, or immediately if
              required by Paystack&apos;s subscription handling for the upgrade.
            </li>
          </ul>
        </section>

        {/* 6. Contact Us */}
        <section>
          <h2 className="font-display text-xl text-ink mb-3">
            6. Contact Us
          </h2>
          <p className="text-ink-muted leading-relaxed mb-2">
            For billing questions, disputes, or refund requests, contact:
          </p>
          <p className="text-ink leading-relaxed">
            <strong>UltimaSpark Agency</strong>
            <br />
            Email:{" "}
            <a
              href="mailto:ultimasparkbooks@gmail.com"
              className="text-spark hover:underline"
            >
              ultimasparkbooks@gmail.com
            </a>
          </p>
        </section>
      </div>
    </section>
  );
}
