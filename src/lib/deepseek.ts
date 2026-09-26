/**
 * DeepSeek message parser — sends a seller's WhatsApp message to DeepSeek
 * with the tenant's product catalog as context and returns structured JSON.
 */

export interface CatalogItem {
  id: number;
  name: string;
  category: string | null;
  unit: string;
  unit_cost: number | null;
}

export interface ParsedEntry {
  entry_type: "sale" | "expense" | "stock_in" | "stock_check" | "daily_summary" | "help" | "unclear";
  matched_product_id: number | null;
  matched_product_name: string | null;
  is_new_product: boolean;
  new_product_name: string | null;
  quantity: number | null;
  unit: string | null;
  unit_cost: number | null;
  amount: number | null;
  confidence: number;
  clarification_needed: string | null;
}

export function buildSystemPrompt(catalog: CatalogItem[]): string {
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

  return `You are an expert AI bookkeeping assistant for a Nigerian small business seller using WhatsApp.
The seller communicates in English, Nigerian Pidgin, or casual business phrasing.
Parse their message into a structured JSON entry.

Current Product Catalog:
${catalogJson}

Return ONLY valid JSON, no preamble, no markdown fences, matching this exact shape:
{
  "entry_type": "sale" | "expense" | "stock_in" | "stock_check" | "daily_summary" | "help" | "unclear",
  "matched_product_id": number | null,
  "matched_product_name": string | null,
  "is_new_product": boolean,
  "new_product_name": string | null,
  "quantity": number | null,
  "unit": string | null,
  "unit_cost": number | null,
  "amount": number | null,
  "confidence": number,
  "clarification_needed": string | null
}

Rules:
1. ENTRY TYPES:
   - "sale": A sale made to a customer (e.g. "Sold 3 Bone Straight wig for 100k each", "Sold 2 wigs for 50,000").
     'amount' is the TOTAL revenue in Naira (e.g. 3 * 100k = 300000).
   - "expense": Operational or business expenses (e.g. "Paid shop rent 50,000", "Fuel 5k", "Transport 2000", "Dispatch rider 3k", "Generator fuel 5000").
     For general expenses not tied to a catalog item, set matched_product_id=null, matched_product_name="Shop rent" (or expense title), amount=amount.
   - "stock_in": Adding or restocking inventory (e.g. "I have restocked 2*6 closure 50 pcs at the cost price of 20k for 1", "Restocked 10 Bone Straight", "Add product Bone Straight qty 20 cost 50000", "Received 15 bundles").
     'quantity' is the number of units added.
     'unit_cost' is the unit purchase cost in Naira if stated (e.g. 20000).
     'amount' is the total purchase cost (e.g. 50 * 20000 = 1000000) if stated or implied.
   - "stock_check": Inquiries about inventory levels (e.g. "How many Bone Straight left?", "Check stock", "Inventory level").
   - "daily_summary": Inquiries about today's sales/profit (e.g. "How much did I sell today?", "Today's summary", "Sales report").
   - "help": Greetings or instructions (e.g. "Help", "Hi", "Hello", "How does this work?").
   - "unclear": The intent is ambiguous or missing critical information.

2. PRODUCT MATCHING:
   - If the message matches an existing catalog product (including close variants or abbreviations), set matched_product_id and matched_product_name, and set is_new_product=false.
   - If the item is NOT in the catalog (e.g. "2*6 closure"), set matched_product_id=null, is_new_product=true, and set new_product_name.

3. NUMBERS AND CURRENCY:
   - Recognize Nigerian abbreviations: 'k' = thousand (20k = 20000, 100k = 100000), 'm' = million (1m = 1000000).
   - All amounts and costs must be plain integers in NGN (Naira).
   - Never guess an amount or quantity that was not stated or clearly implied.`;
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
 * Call DeepSeek to parse a seller's WhatsApp message into a structured entry.
 */
export async function parseMessage(
  message: string,
  catalog: CatalogItem[],
): Promise<ParsedEntry> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const apiUrl =
    process.env.DEEPSEEK_API_URL || "https://api.deepseek.com/v1/chat/completions";
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";

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
        model,
        messages: [
          { role: "system", content: buildSystemPrompt(catalog) },
          { role: "user", content: message },
        ],
        temperature: 0.1,
        max_tokens: 1024,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`DeepSeek API error ${res.status}: ${err}`);
    }

    const data = await res.json();
    const choice = data.choices?.[0]?.message;
    const rawContent = (choice?.content || choice?.reasoning_content || "").trim();
    const json = extractJson(rawContent);

    try {
      const parsed = JSON.parse(json) as ParsedEntry;

      // Validate required fields
      const validTypes = [
        "sale",
        "expense",
        "stock_in",
        "stock_check",
        "daily_summary",
        "help",
        "unclear",
      ];
      if (!validTypes.includes(parsed.entry_type)) {
        parsed.entry_type = "unclear";
      }
      if (typeof parsed.confidence !== "number") {
        parsed.confidence = 0;
      }

      return parsed;
    } catch (e) {
      console.error("DeepSeek JSON parse failed. Raw content:", rawContent, "Cleaned JSON:", json, e);
      return {
        entry_type: "unclear",
        matched_product_id: null,
        matched_product_name: null,
        is_new_product: false,
        new_product_name: null,
        quantity: null,
        unit: null,
        unit_cost: null,
        amount: null,
        confidence: 0,
        clarification_needed: "Sorry, I couldn't understand that. Could you please rephrase?",
      };
    }
  } finally {
    clearTimeout(timeout);
  }
}
