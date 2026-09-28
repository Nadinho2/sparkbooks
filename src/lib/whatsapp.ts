/**
 * WhatsApp Cloud API helpers.
 */

const API_VERSION = "v22.0";
const FETCH_TIMEOUT_MS = 10_000; // 10s timeout for WhatsApp API calls

/**
 * Normalize a phone number for reliable comparison and WhatsApp Cloud API / wa.me links.
 * Handles Nigerian local numbers automatically:
 * - 08031234567 (11 digits starting with 0) -> 2348031234567
 * - 8031234567 (10 digits starting with 7, 8, 9) -> 2348031234567
 * - +2348031234567 -> 2348031234567
 */
export function normalizePhone(number: string): string {
  if (!number) return "";
  let cleaned = number.replace(/[^\d+]/g, "").trim();

  if (cleaned.startsWith("+")) {
    cleaned = cleaned.substring(1);
  }

  // Handle Nigerian numbers typed with country code + local leading 0: 23408031234567
  if (cleaned.startsWith("2340") && cleaned.length === 14) {
    return "234" + cleaned.substring(4);
  }

  // Standard 11-digit Nigerian local number: e.g. 08031234567, 070..., 090..., 081...
  if (cleaned.startsWith("0") && cleaned.length === 11) {
    return "234" + cleaned.substring(1);
  }

  // 10-digit Nigerian local number without leading zero: e.g. 8031234567, 708..., 901...
  if (/^[789]\d{9}$/.test(cleaned)) {
    return "234" + cleaned;
  }

  return cleaned;
}

export type TemplateParameter = {
  type: string;
  text?: string;
  currency?: { fallback_value: string; code: string; amount_1000: number };
};

export type TemplateComponent = {
  type: string;
  parameters: TemplateParameter[];
};

export interface FallbackTemplateConfig {
  name: string;
  components?: TemplateComponent[];
}

/**
 * Send a free-form text message via WhatsApp Cloud API.
 * If sending fails due to Meta's 24-hour customer service window (error 131047)
 * and a fallbackTemplate is provided, automatically sends the approved template message instead.
 */
export async function sendTextMessage(
  to: string,
  body: string,
  fallbackTemplate?: FallbackTemplateConfig,
): Promise<{ success: boolean; errorCode?: number; error?: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    console.error("WhatsApp: missing ACCESS_TOKEN or PHONE_NUMBER_ID");
    return { success: false, error: "Missing WhatsApp credentials" };
  }

  const url = `https://graph.facebook.com/${API_VERSION}/${phoneNumberId}/messages`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = (await res.json()) as { error?: { code?: number; message?: string } };
      const code = err.error?.code;
      console.warn(`WhatsApp send failed (code ${code}):`, err.error?.message);

      // Error 131047: Outside 24-hour service window -> attempt template fallback
      if (code === 131047 && fallbackTemplate) {
        console.log(`24-hour window expired. Falling back to template: ${fallbackTemplate.name}`);
        await sendTemplateMessage(to, fallbackTemplate.name, fallbackTemplate.components);
        return { success: true };
      }

      return { success: false, errorCode: code, error: err.error?.message };
    }

    return { success: true };
  } catch (e) {
    const errorMsg = (e as Error).message;
    console.error("WhatsApp network/fetch error:", errorMsg);
    return { success: false, error: errorMsg };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Send a template message (works outside the 24h window).
 * Optionally includes template body parameters via `components`.
 */
export async function sendTemplateMessage(
  to: string,
  templateName: string,
  components?: Array<{
    type: string;
    parameters: Array<{
      type: string;
      text?: string;
      currency?: { fallback_value: string; code: string; amount_1000: number };
    }>;
  }>,
): Promise<void> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    console.error("WhatsApp: missing ACCESS_TOKEN or PHONE_NUMBER_ID");
    return;
  }

  const url = `https://graph.facebook.com/${API_VERSION}/${phoneNumberId}/messages`;

  const templatePayload: Record<string, unknown> = {
    name: templateName,
    language: { code: "en" },
  };

  if (components && components.length > 0) {
    templatePayload.components = components;
  }

  const bodyPayload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: templatePayload,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bodyPayload),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.json();
      console.error("WhatsApp template error:", err);
    }
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * The official SparkBooks WhatsApp Business bot number (international format without +).
 */
export const SPARKBOOKS_BOT_PHONE = "2348103253238";

/**
 * Generate a wa.me deep link with a prefilled message containing the business / brand name.
 */
export function getWhatsAppBotUrl(businessName?: string, customText?: string): string {
  const brand = businessName?.trim();
  const text =
    customText ||
    (brand
      ? `Hi SparkBooks! 👋 I'm ready to start bookkeeping for ${brand}.`
      : `Hi SparkBooks! 👋 I'm ready to start bookkeeping.`);
  return `https://wa.me/${SPARKBOOKS_BOT_PHONE}?text=${encodeURIComponent(text)}`;
}

