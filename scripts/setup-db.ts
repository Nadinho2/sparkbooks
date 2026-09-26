/**
 * Setup script — applies the migration SQL to your Supabase project.
 *
 * BEFORE running:
 *   1. Fill in .env.local with your Supabase credentials.
 *   2. Get your project ref from the Supabase Dashboard (Settings > General).
 *
 * Usage:
 *   npx tsx scripts/setup-db.ts
 *
 * This script calls the Supabase Platform SQL API.
 * It uses your NEXT_PUBLIC_SUPABASE_URL to derive the project ref,
 * and SUPABASE_SERVICE_ROLE_KEY for authorization.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(): Record<string, string> {
  const envPath = resolve(process.cwd(), ".env.local");
  const raw = readFileSync(envPath, "utf-8");
  const vars: Record<string, string> = {};

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    vars[key] = val;
  }

  return vars;
}

function extractProjectRef(url: string): string {
  // URL format: https://<ref>.supabase.co
  const hostname = new URL(url).hostname;
  const ref = hostname.split(".")[0];
  if (!ref || ref === "https:" || ref === "your-project") {
    throw new Error(
      `Could not extract project ref from NEXT_PUBLIC_SUPABASE_URL="${url}". ` +
        "Please set a real Supabase project URL in .env.local.",
    );
  }
  return ref;
}

async function runSql(
  query: string,
  projectRef: string,
  serviceRoleKey: string,
): Promise<void> {
  const url = `https://api.supabase.com/v1/projects/${projectRef}/sql`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `SQL API returned ${res.status} ${res.statusText}\n${body}\n\n` +
        "If you're getting a 401/403, the Platform SQL API requires a Supabase " +
        "Personal Access Token (not the service_role key). Create one at:\n" +
        "  https://supabase.com/dashboard/account/tokens\n" +
        "Then set it as SUPABASE_ACCESS_TOKEN in .env.local and re-run.",
    );
  }

  console.log("OK — statement executed successfully");
}

async function main() {
  console.log("Loading .env.local …");
  const env = loadEnvFile();

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const accessToken = env.SUPABASE_ACCESS_TOKEN;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local",
    );
    process.exit(1);
  }

  const projectRef = extractProjectRef(supabaseUrl);
  const authKey = accessToken || serviceRoleKey;

  if (!accessToken) {
    console.warn(
      "WARNING: No SUPABASE_ACCESS_TOKEN found — trying service_role key. " +
        "The Platform SQL API may require a Personal Access Token (PAT).",
    );
  }

  console.log(`Project ref: ${projectRef}`);

  // Read and execute migration
  const sqlPath = resolve(process.cwd(), "supabase/all_migrations.sql");
  const sql = readFileSync(sqlPath, "utf-8");

  // Split into individual statements (naive split by semicolons + newlines)
  const statements = sql
    .split(/;\s*\n\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  console.log(`Found ${statements.length} SQL statements. Running …\n`);

  for (const stmt of statements) {
    try {
      await runSql(stmt, projectRef, authKey);
    } catch (err) {
      console.error(
        `\nFAILED to apply migration via API: ${(err as Error).message}\n`,
      );

      console.log(
        "───────── ALTERNATIVE: Run in Supabase SQL Editor ─────────",
      );
      console.log(
        " 1. Go to https://supabase.com/dashboard/project/" + projectRef + "/sql",
      );
      console.log(
        " 2. Paste the contents of supabase/all_migrations.sql",
      );
      console.log(
        " 3. Click 'Run'\n",
      );
      process.exit(1);
    }
  }

  console.log("\nSchema setup complete.");
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
