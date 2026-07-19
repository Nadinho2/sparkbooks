/**
 * WhatsApp Cloud API helpers.
 */

const API_VERSION = "v22.0";
const FETCH_TIMEOUT_MS = 10_000; // 10s timeout for WhatsApp API calls

/**
 * Normalize a phone number for reliable comparison.
 * Strips leading + and any spaces/dashes.
 */
export function normalizePhone(number: string): string {
  return number.replace(/[+\s\-()]/g, "").trim();
}

/**
 * Send a free-form text message via WhatsApp Cloud API.
 * Only valid within the 24-hour customer service window.
 */
export async function sendTextMessage(to: string, body: string): Promise<void> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    console.error("WhatsApp: missing ACCESS_TOKEN or PHONE_NUMBER_ID");
    return;
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
      const err = await res.json();
      console.error("WhatsApp send error:", err);
    }
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
