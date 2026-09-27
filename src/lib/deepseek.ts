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
  entry_type:
    | "sale"
    | "expense"
    | "stock_in"
    | "stock_check"
    | "daily_summary"
    | "weekly_summary"
    | "debt"
    | "debt_repayment"
    | "debt_check"
    | "help"
    | "unclear";
  matched_product_id: number | null;
  matched_product_name: string | null;
  is_new_product: boolean;
  new_product_name: string | null;
  quantity: number | null;
  unit: string | null;
  unit_cost: number | null;
  amount: number | null;
  payment_method?: "transfer" | "cash" | "pos" | "other" | null;
  customer_name?: string | null;
  amount_paid?: number | null;
  amount_owed?: number | null;
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
  "entry_type": "sale" | "expense" | "stock_in" | "stock_check" | "daily_summary" | "weekly_summary" | "debt" | "debt_repayment" | "debt_check" | "help" | "unclear",
  "matched_product_id": number | null,
  "matched_product_name": string | null,
  "is_new_product": boolean,
  "new_product_name": string | null,
  "quantity": number | null,
  "unit": string | null,
  "unit_cost": number | null,
  "amount": number | null,
  "payment_method": "transfer" | "cash" | "pos" | "other" | null,
  "customer_name": string | null,
  "amount_paid": number | null,
  "amount_owed": number | null,
  "confidence": number,
  "clarification_needed": string | null
}

Rules:
1. ENTRY TYPES:
   - "sale": A completed sale (e.g. "Sold 3 Bone Straight wig for 100k each", "Sold 2 wigs for 50,000 via OPay transfer", "Sold to Chioma 1 dress 30k cash").
     'amount' is the TOTAL revenue in Naira.
     'customer_name' is the customer/buyer's name if mentioned (e.g. "Sold to Chioma 1 dress 30k" -> customer_name="Chioma", "Sold 1 wig to Sarah for 50k" -> customer_name="Sarah"). If no buyer is mentioned, customer_name=null.
   - "debt": A sale where the customer made a partial payment or bought on credit (e.g. "Sold 1 bone straight 100k to Blessing, she paid 60k balance 40k", "Sold 2 closure to Amaka for 50k on credit", "Gave Tunde 2 items for 30k, paid half 15k").
     'amount' is the TOTAL sale value (e.g. 100000).
     'amount_paid' is what was paid right now (e.g. 60000). If zero paid, amount_paid=0.
     'amount_owed' is the remaining unpaid balance (e.g. 40000).
     'customer_name' is the customer's name (e.g. "Blessing", "Amaka", "Tunde").
   - "debt_repayment": Customer paying back an existing debt or balance (e.g. "Blessing paid her 40k balance", "Amaka paid 20k for the hair she was owing", "Received 15k balance from Tunde").
     'amount' is the amount paid back in Naira.
     'customer_name' is the customer who paid.
   - "debt_check": Inquiries about customer debts/balances (e.g. "Who is owing me?", "Show my debtors", "How much is Blessing owing?", "Check unpaid debts").
     'customer_name' can be set if asking about a specific person.
   - "expense": Operational or business expenses (e.g. "Paid shop rent 50,000", "Fuel 5k cash", "Transport 2000", "Dispatch rider 3k", "Generator fuel 5000").
     For general expenses, set matched_product_id=null, matched_product_name="Shop rent" (or expense title), amount=amount.
   - "stock_in": Adding or restocking inventory (e.g. "I have restocked 2*6 closure 50 pcs at cost price of 20k each", "Restocked 10 Bone Straight").
     'quantity' is the number of units added.
     'unit_cost' is the unit purchase cost in Naira.
     'amount' is total purchase cost.
   - "stock_check": Inquiries about inventory levels (e.g. "How many Bone Straight left?", "Check stock", "How many closure do I have?").
   - "daily_summary": Inquiries about today's sales/profit/closing (e.g. "How much did I sell today?", "Today's summary", "Sales report", "Close today", "Daily closing").
   - "weekly_summary": Inquiries about this week's numbers (e.g. "Weekly sales", "How much this week?", "Weekly report").
   - "help": Greetings or instructions (e.g. "Help", "Hi", "Hello", "How does this work?").
   - "unclear": The intent is ambiguous or missing critical information.

2. PAYMENT METHODS:
   - Only extract 'payment_method' if the merchant EXPLICITLY mentions the payment channel:
     - "transfer": transfer, bank transfer, opay, moniepoint, palmplay, kuda, direct transfer.
     - "cash": cash, raw cash.
     - "pos": pos, card, atm card.
   - If payment method is NOT explicitly stated in the message, set "payment_method": null. NEVER assume, default, or guess "transfer" or any other method.

3. PRODUCT MATCHING:
   - Match existing catalog products (including variants or abbreviations). Set matched_product_id and matched_product_name, and is_new_product=false.
   - If not in catalog, set matched_product_id=null, is_new_product=true, and set new_product_name.

4. NUMBERS AND CURRENCY:
   - Recognize Nigerian abbreviations: 'k' = thousand (20k = 20000, 100k = 100000), 'm' = million (1m = 1000000).
   - All amounts and costs must be plain integers in NGN (Naira).
   - Never guess an amount or quantity that was not stated or clearly implied.

5. CUSTOMER EXTRACTION:
   - ALWAYS extract 'customer_name' whenever a customer, buyer, or person receiving goods or making a payment is mentioned in ANY message.
   - Examples:
     - "Sold 1 wig to Amaka for 80k" -> customer_name="Amaka"
     - "Sold to Sarah 2 bags 30k" -> customer_name="Sarah"
     - "Sold 1 wig 100k to Blessing, paid 60k balance 40k" -> customer_name="Blessing"
     - "Blessing paid 40k balance" -> customer_name="Blessing"
   - Do NOT confuse product names with customer names (e.g. "Bone Straight" is product, "Amaka" is customer).
   - If no customer is mentioned, set customer_name=null.`;
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
        "weekly_summary",
        "debt",
        "debt_repayment",
        "debt_check",
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
