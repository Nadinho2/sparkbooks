/**
 * DeepSeek message parser — sends a seller's WhatsApp message to DeepSeek
 * with the tenant's product catalog as context and returns structured JSON.
 */

interface CatalogItem {
  id: number;
  name: string;
  category: string | null;
  unit: string;
  unit_cost: number | null;
}

interface ParsedEntry {
  entry_type: "sale" | "expense" | "stock_in" | "unclear";
  matched_product_id: number | null;
  matched_product_name: string | null;
  is_new_product: boolean;
  new_product_name: string | null;
  quantity: number | null;
  unit: string | null;
  amount: number | null;
  confidence: number;
  clarification_needed: string | null;
}

function buildSystemPrompt(catalog: CatalogItem[]): string {
  const catalogJson = JSON.stringify(
    catalog.map((c) => ({
      id: c.id,
      name: c.name,
      category: c.category ?? "Uncategorized",
      unit: c.unit,
      unit_cost: c.unit_cost,
    })),
    null,
    2,
  );

  return `You are a bookkeeping assistant for a Nigerian small business seller. The seller communicates in a mix of English, Pidgin, and local phrasing. Parse their message into a structured JSON entry. Here is their current product catalog: ${catalogJson}.

Return ONLY valid JSON, no preamble, no markdown fences, in this shape:
{
  "entry_type": "sale" | "expense" | "stock_in" | "unclear",
  "matched_product_id": number | null,
  "matched_product_name": string | null,
  "is_new_product": boolean,
  "new_product_name": string | null,
  "quantity": number | null,
  "unit": string | null,
  "amount": number | null,
  "confidence": number (0 to 1),
  "clarification_needed": string | null
}

Rules:
- If the message clearly matches an existing product, set matched_product_id and is_new_product=false.
- If no reasonable match exists, set is_new_product=true and propose new_product_name.
- If amount, quantity, or intent is ambiguous, set entry_type to 'unclear' and confidence below 0.6, and fill clarification_needed with a short question to send back to the seller.
- Never guess a price or quantity that was not stated or clearly implied.`;
}

/**
 * Extract JSON from a potentially messy LLM response.
 */
function extractJson(raw: string): string {
  // Strip markdown fences if present
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  // Find first { and last }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return cleaned.slice(start, end + 1);
  }
  return cleaned;
}

/**
 * Call DeepSeek to parse a seller's message into a structured entry.
 */
export async function parseMessage(
  message: string,
  catalog: CatalogItem[],
): Promise<ParsedEntry> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const apiUrl =
    process.env.DEEPSEEK_API_URL || "https://api.deepseek.com/v1/chat/completions";

  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not set");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-v4-pro",
        messages: [
          { role: "system", content: buildSystemPrompt(catalog) },
          { role: "user", content: message },
        ],
        temperature: 0.1,
        max_tokens: 512,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`DeepSeek API error ${res.status}: ${err}`);
    }

    const data = await res.json();
    const rawContent = data.choices?.[0]?.message?.content ?? "";
    const json = extractJson(rawContent);

    try {
      const parsed = JSON.parse(json) as ParsedEntry;

      // Validate required fields
      if (
        !["sale", "expense", "stock_in", "unclear"].includes(parsed.entry_type)
      ) {
        parsed.entry_type = "unclear";
      }
      if (typeof parsed.confidence !== "number") {
        parsed.confidence = 0;
      }

      return parsed;
    } catch {
      // If JSON parsing fails, return unclear
      return {
        entry_type: "unclear",
        matched_product_id: null,
        matched_product_name: null,
        is_new_product: false,
        new_product_name: null,
        quantity: null,
        unit: null,
        amount: null,
        confidence: 0,
        clarification_needed: "Sorry, I couldn't understand that. Can you rephrase?",
      };
    }
  } finally {
    clearTimeout(timeout);
  }
}
