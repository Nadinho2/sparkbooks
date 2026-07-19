# SparkBooks — Complete Project Documentation

> **Version:** 0.1.0  
> **Stack:** Next.js 16 + React 19 + TypeScript + Supabase + Clerk + Tailwind CSS 4  
> **Last Updated:** 2026-07-18

---

## Table of Contents

1. [Overview](#1-overview)
2. [Dependency Map](#2-dependency-map)
3. [Database Schema](#3-database-schema)
4. [Route Map](#4-route-map)
5. [User Journey](#5-user-journey)
6. [Admin Journey](#6-admin-journey)
7. [Server Actions Inventory](#7-server-actions-inventory)
8. [Components Inventory](#8-components-inventory)
9. [Core Libraries](#9-core-libraries)
10. [Auth Architecture](#10-auth-architecture)
11. [Environment Variables Checklist](#11-environment-variables-checklist)
12. [File Structure](#12-file-structure)
13. [What's Missing](#13-whats-missing)
14. [Deployment Checklist](#14-deployment-checklist)

---

## 1. Overview

SparkBooks is a SaaS bookkeeping and inventory management platform for Nigerian SME sellers. Users interact entirely through WhatsApp — they send text or voice messages describing sales, expenses, or stock changes. AI (DeepSeek + OpenAI Whisper) parses these into structured ledger entries and stock movements. The app offers a freemium subscription model with Paystack billing.

### External API Dependencies

| Service | Purpose | Env Vars |
|---|---|---|
| Supabase | Database, Storage (voice files), RPC functions | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| Clerk | User auth, session management, admin role via `publicMetadata.role` | `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` |
| DeepSeek | NLP message parsing (chat completions API) | `DEEPSEEK_API_KEY` |
| OpenAI | Voice transcription (`gpt-4o-transcribe`) | `OPENAI_API_KEY` |
| WhatsApp Cloud API | Inbound webhook, outbound text/template messages | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` |
| Paystack | Subscription billing, payment processing, webhooks | `PAYSTACK_SECRET_KEY`, `PAYSTACK_STARTER_PLAN_CODE`, `PAYSTACK_PRO_PLAN_CODE` |
| Resend | Email (API key configured, not yet wired into app flows) | `RESEND_API_KEY` |

---

## 2. Dependency Map

| Package | Version | Duty |
|---|---|---|
| `next` | 16.2.10 | Full-stack React framework (App Router) |
| `react` / `react-dom` | 19.2.4 | UI rendering |
| `@clerk/nextjs` | ^7.5.20 | Authentication (sign-in, sign-up, session management, role metadata) |
| `@supabase/supabase-js` | ^2.110.7 | PostgreSQL client (service_role and anon) |
| `@supabase/ssr` | ^0.12.3 | Server-side Supabase cookie management |
| `date-fns` | ^4.4.0 | Date formatting (billing renewal dates, message timestamps) |
| `papaparse` | ^5.5.4 | CSV parsing (onboarding bulk product upload) |
| `xlsx` | ^0.18.5 | Excel parsing (onboarding bulk product upload) |
| `resend` | ^6.17.2 | Email delivery (available, not yet wired into UI flows) |
| `zod` | ^4.4.3 | Schema validation (installed, used minimally) |
| `tailwindcss` | ^4 | Utility-first CSS |
| `typescript` | ^5 | Type safety |

---

## 3. Database Schema

### Migration History

| Migration | Purpose |
|---|---|
| `001_setup_schema.sql` | Core schema: tenants, categories, products, whatsapp_messages, stock_movements, ledger_entries. Enums, indexes, triggers, RLS policies |
| `002_add_clerk_user_id.sql` | Links Clerk auth to tenant records via `tenants.clerk_user_id` |
| `003_add_deleted_at.sql` | Soft-delete for products (`products.deleted_at`) |
| `004_add_low_stock_alert.sql` | Low-stock alert dedup via `products.last_low_stock_alert_at` |
| `005_add_billing.sql` | Plan enums, billing columns on tenants, `increment_message_count` and `reset_billing_cycle` RPCs |
| `006_add_admin_audit.sql` | `admin_audit_log` table, `is_comped`, `is_suspended` flags, `get_tenant_product_counts` RPC |

### Tables

| Table | Purpose | Key Columns |
|---|---|---|
| `tenants` | Business accounts — one per Clerk user | `clerk_user_id`, `plan_tier`, `plan_status`, `paystack_*`, `is_suspended`, `is_comped`, `monthly_message_count`, `monthly_message_limit`, `current_period_end` |
| `categories` | Product categories per tenant | `tenant_id`, `name` (unique per tenant) |
| `products` | Product catalog with stock levels | `tenant_id`, `quantity`, `unit_cost`, `reorder_threshold`, `deleted_at`, `last_low_stock_alert_at` |
| `whatsapp_messages` | All WhatsApp conversations | `wa_message_id` (unique), `status`, `raw_text`, `transcript`, `media_url`, `failure_reason`, `linked_entry_id` |
| `stock_movements` | Audit trail for every quantity change | `change_qty`, `type`, `source`, `linked_message_id` |
| `ledger_entries` | Sales and expense records | `type` (sale/expense), `amount`, `product_id`, `confidence_score` |
| `admin_audit_log` | Tracks every admin access to tenant data | `admin_user_id`, `tenant_id`, `action` |

### RPC Functions

| Function | Purpose |
|---|---|
| `increment_message_count(tenant_id)` | Atomic counter increment for usage tracking |
| `reset_billing_cycle()` | Resets `monthly_message_count` and advances `current_period_end` for expired paid tenants |
| `get_tenant_product_counts()` | Returns non-deleted product count per tenant (admin dashboard) |

### Plan Tiers

| Tier | Price | Messages/Month | Products | CSV Upload | Low-Stock Alerts |
|---|---|---|---|---|---|
| Free | N0 | 30 | 15 | No | No |
| Starter | N3,500 | 200 | Unlimited | Yes | Yes |
| Pro | N5,000 | Unlimited | Unlimited | Yes | Yes |

---

## 4. Route Map

### Public Routes (no auth required)

| Route | Method | Purpose |
|---|---|---|
| `/` | GET | Landing page — hero, how-it-works, features, pricing |
| `/sign-in/*` | GET | Clerk sign-in |
| `/sign-up/*` | GET | Clerk sign-up |
| `/onboarding` | GET | Business setup (layout-level auth check redirects to sign-in if unauthenticated) |
| `/suspended` | GET | Suspended account notice page |
| `/api/webhooks/whatsapp` | GET | Meta webhook verification (`hub.verify_token`) |
| `/api/webhooks/whatsapp` | POST | WhatsApp inbound messages |
| `/api/webhooks/paystack` | POST | Paystack subscription events (HMAC-SHA512 verified) |
| `/api/cron/cleanup-voice` | GET | Delete old voice files (requires `CRON_SECRET`) |
| `/api/cron/reset-usage` | GET | Reset monthly message counts (requires `CRON_SECRET`) |

### Protected Routes (require Clerk auth)

| Route | Additional Guard | Purpose |
|---|---|---|
| `/dashboard` | `getCurrentTenant()` — redirects to onboarding if no tenant, to `/suspended` if suspended | Redirects to `/dashboard/products` |
| `/dashboard/products` | `getCurrentTenant()` | Product catalog table, add/edit/delete |
| `/dashboard/messages` | `getCurrentTenant()` | WhatsApp conversation history |
| `/dashboard/billing` | `getCurrentTenant()` | Plan management, upgrade/downgrade, payment history |
| `/admin` | `requireAdmin()` | Redirects to `/admin/tenants` |
| `/admin/tenants` | `requireAdmin()` | All tenants table with search/filter |
| `/admin/tenants/[id]` | `requireAdmin()` | Single tenant detail (products, messages, ledger) |
| `/admin/usage` | `requireAdmin()` | Usage metrics and cost estimates |
| `/admin/parsing` | `requireAdmin()` | Failed/unmatched messages for manual review |
| `/admin/billing` | `requireAdmin()` | Billing status across all tenants |

### API Routes (protected by middleware)

| Route | Method | Purpose |
|---|---|---|
| `/api/onboarding/setup-tenant` | POST | Create tenant + seed categories + set Clerk metadata |
| `/api/products/check-duplicate` | POST | Fuzzy duplicate product check |
| `/api/messages/signed-url` | GET | Generate signed URL for voice file playback |

---

## 5. User Journey

### Landing → Sign-up → Onboarding → Dashboard

```
Landing Page (/)
  |
  +-- Click CTA ("Start free" / "Start free trial") --> /onboarding
  |     |
  |     +-- Step 1: BusinessTypeStep
  |     |     - Business name, type (hair/beauty, provisions, fashion), WhatsApp number
  |     |     - Creates tenant row + seeds categories + sets Clerk metadata
  |     |
  |     +-- Step 2: ProductsStep
  |     |     - Add initial products (single item or CSV/Excel bulk upload)
  |     |     - Fuzzy duplicate detection + plan limit enforcement
  |     |
  |     +-- Step 3: CompletionStep
  |           - Success screen, shows WhatsApp number and product count
  |           - "Go to Dashboard" button
  |
  +-- Dashboard (/dashboard/products)
        |
        +-- Products tab: view catalog, add/edit/soft-delete, manage categories
        +-- Messages tab: WhatsApp conversation thread with filters
        +-- Billing tab: plan cards, usage bar, upgrade to Paystack, payment history
        +-- Settings tab: links back to /onboarding for editing business details
```

### WhatsApp Message → Parsed Entry Flow

```
Seller sends WhatsApp message
         |
         v
Meta webhook --> POST /api/webhooks/whatsapp
         |
         +-- 1. Idempotency check (duplicate wa_message_id --> skip)
         +-- 2. Tenant lookup (phone number matching)
         +-- 3. Suspension check (drop if suspended)
         +-- 4. Plan limit check (block + template message if exceeded)
         +-- 5a. Voice: download --> upload to Supabase Storage --> OpenAI Whisper --> transcript
         +-- 5b. Text: use raw text directly
         |
         +-- 6. Check for pending confirmation (new-product yes/no reply)
         |     |
         |     +-- Affirmative: create product in catalog, resolve both messages
         |     +-- Negative: skip, resolve both messages
         |     +-- Neither: continue to full parse
         |
         +-- 7. Insert whatsapp_messages row (status: pending_confirmation)
         +-- 8. Fetch product catalog
         +-- 9. DeepSeek parse (with catalog context)
         +-- 10. Increment message count
         |
         +-- 11a. High confidence + new product
         |     - Store pending context in failure_reason as JSON
         |     - Ask seller "add to catalog? Reply yes or no"
         |     - Next message handled by step 6 above
         |
         +-- 11b. High confidence + matched product
         |     - Create ledger_entry (if sale/expense)
         |     - updateProductStock() --> stock_movements row + low-stock alert
         |     - Update message to status: matched
         |     - Send confirmation reply via WhatsApp
         |
         +-- 11c. Low confidence or unclear
               - Send clarification question or template fallback
               - Leave status as pending_confirmation
```

### Billing Flow

```
Free tier (default for all new tenants)
  |
  +-- Dashboard --> Billing --> click "Upgrade to Starter/Pro"
  |     |
  |     +-- Create Paystack customer (if new)
  |     +-- Create Paystack subscription --> get authorization URL
  |     +-- Enable subscription (starts charging)
  |     +-- Update tenant: plan_tier, plan_status=active, monthly_message_limit
  |     +-- Open Paystack payment page in new tab
  |
  +-- Paystack webhook: charge.success
  |     - plan_status = active
  |     - Update current_period_end
  |
  +-- Paystack webhook: invoice.payment_failed
  |     - plan_status = past_due
  |     - Send WhatsApp alert to tenant
  |
  +-- Paystack webhook: subscription.disable
        |
        +-- If billing period hasn't ended: mark cancelled, keep paid access
        +-- If billing period ended: downgrade to free immediately

Cancel/Downgrade:
  |
  +-- Dashboard --> Billing --> click "Downgrade to Free"
        |
        +-- Fetch subscription --> get email_token
        +-- Call Paystack disable API with real token
        +-- Set plan_tier=free, clear subscription IDs

Monthly Reset (cron):
  |
  +-- Paid tenants: reset when current_period_end has passed
  +-- Free tenants: reset on the 1st of each calendar month
```

---

## 6. Admin Journey

```
/admin (requireAdmin gate -- Clerk publicMetadata.role === "admin")
  |
  +-- Tenants (/admin/tenants)
  |     - All-tenants table: business name, plan, usage, product count
  |     - Suspend / Reactivate (logs to admin_audit_log)
  |     - Click tenant --> detail page (/admin/tenants/[id])
  |           - Products, messages, ledger entries
  |           - Change plan tier manually
  |           - Extend billing period
  |           - All actions logged to admin_audit_log
  |
  +-- Usage (/admin/usage)
  |     - Summary cards: tenants by tier, daily/monthly messages, revenue, estimated cost
  |     - Per-tenant usage rows with Whisper + DeepSeek cost estimates
  |
  +-- Parsing (/admin/parsing)
  |     - List of failed/unmatched messages across all tenants
  |     - AdminReRunParse: re-process a message through DeepSeek
  |           - Creates ledger entries
  |           - Updates stock
  |           - Sends WhatsApp confirmation
  |
  +-- Billing (/admin/billing)
        - All-tenants billing overview
        - Plan, status, comp flag, subscription IDs, period end
```

---

## 7. Server Actions Inventory

### Dashboard Actions

| File | Actions | Purpose |
|---|---|---|
| `products/actions.ts` | `createProduct`, `updateProduct`, `softDeleteProduct` | CRUD with tenantId derived server-side, fuzzy duplicate checks, plan limit enforcement, stock_movements audit |
| `messages/actions.ts` | `fetchMessages`, `fetchLinkedEntries` | Cursor-paginated WhatsApp history with status/search/date filters, linked ledger + stock movements |
| `categories/actions.ts` | `createCategory`, `renameCategory`, `deleteCategory` | CRUD with auto-create "Uncategorized" fallback on delete |
| `billing/actions.ts` | `getBillingState`, `startSubscription`, `cancelSubscription`, `getPaymentHistory` | Plan state, Paystack subscription lifecycle, transaction history |

### Admin Actions

| File | Actions | Purpose |
|---|---|---|
| `admin/actions.ts` | `fetchAllTenants`, `fetchTenantDetail`, `suspendTenant`, `adminSetPlanTier`, `adminExtendPeriod`, `adminSetComp`, `fetchUsageSummary`, `fetchUsageRows`, `fetchParsingIssues`, `adminReRunParse`, `fetchAdminBilling` | All admin operations with `requireAdmin()` gate + audit logging |

### Onboarding Actions

| File | Actions | Purpose |
|---|---|---|
| `onboarding/actions.ts` | `getExistingTenant`, `updateTenant`, `setupTenant`, `createProducts` | Tenant creation/update, category seeding, product seeding with duplicate checking |

---

## 8. Components Inventory

| Category | Component | Role |
|---|---|---|
| **Marketing** | `Header`, `Footer` | Global nav/footer on landing and auth pages |
| **Onboarding** | `BusinessTypeStep` | Business name, type (hair/beauty, provisions, fashion), WhatsApp number form |
| | `ProductsStep` | Single-item add + CSV/Excel bulk upload with column mapping, preview, validation |
| | `CompletionStep` | Success screen with WhatsApp number, product count, CTA to dashboard |
| **Dashboard** | `ProductTable` | Sortable product catalog with low-stock indicators and total value |
| | `EditProductModal` | Modal for editing product fields including quantity adjustment |
| | `ChatThread` | WhatsApp-style conversation view with infinite scroll |
| | `ChatFilters` | Status, search, and date range filters for messages |
| | `MessageBubble` | Single message display with linked entries and voice playback |
| | `VoicePlayer` | Audio player for voice notes |
| | `CategoryManager` | Inline category create/rename/delete |
| | `BillingClient` | Plan comparison cards, usage progress bar, payment history |
| **Admin** | `TenantTable` | All-tenants sortable table with search |
| | `TenantDetail` | Single tenant full detail with products, messages, ledger |
| | `UsageView` | Usage dashboard with summary cards and per-tenant rows |
| | `ParsingView` | Failed/unmatched messages list with re-run button |
| | `BillingView` | All-tenants billing overview with comp/suspend toggles |
| **Shared** | `MetricCard` | Reusable stat card |
| | `LedgerRow` | Ledger entry display |
| | `VoiceNoteParsing` | Voice note processing status display |

---

## 9. Core Libraries (`src/lib/`)

| File | Purpose | Client/Server |
|---|---|---|
| `billing.ts` | Plan tier types, limits definitions (free/starter/pro), `canProcessMessage()`, `planLimitExceededMessage()` | Both |
| `billing-server.ts` | Supabase-dependent: Paystack API helpers (customer, subscription, transactions), `getTenantBilling()`, `incrementMessageCount()`, `checkProductLimit()` | Server only |
| `whatsapp.ts` | `sendTextMessage()`, `sendTemplateMessage()` (with optional body parameters) via WhatsApp Cloud API v22.0, `normalizePhone()` | Server only |
| `voice.ts` | Voice pipeline: Meta download → Supabase Storage upload → OpenAI Whisper transcription | Server only |
| `deepseek.ts` | Message parsing: builds system prompt with product catalog, calls DeepSeek chat API, returns structured `ParsedEntry` | Server only |
| `stock.ts` | `updateProductStock()` — single mutation point for `products.quantity`. Writes stock_movements audit row, fires low-stock alert | Server only |
| `tenant.ts` | `BUSINESS_CATEGORIES` map, `findFuzzyMatches()` — Jaccard word-level similarity | Both |
| `tenant-server.ts` | `getCurrentTenant()` — auth gate + tenant lookup + suspension check. `getCurrentTenantId()` — used by actions for server-side tenant derivation | Server only |
| `admin-auth.ts` | `requireAdmin()` — Clerk role check gate. `isAdmin()` — boolean check without redirect | Server only |
| `format.ts` | `formatNaira()` — centralized Naira formatter | Both |
| `constants.ts` | `OPENAI_TRANSCRIPTION_MODEL` — single source of truth | Server only |
| `supabase/server.ts` | `createServerSupabaseClient()` (anon key, RLS-respecting), `createAdminClient()` (service_role, bypasses RLS) | Server only |
| `supabase/client.ts` | Browser Supabase client (anon key) | Client only |

---

## 10. Auth Architecture

```
+-----------------------------------------------------------+
| Middleware (src/proxy.ts)                                   |
| clerkMiddleware + createRouteMatcher                        |
|                                                             |
| PUBLIC ROUTES:                                              |
|   /, /sign-in/*, /sign-up/*, /onboarding, /suspended,      |
|   /api/webhooks/*, /api/cron/*                              |
|                                                             |
| PROTECTED ROUTES (everything else):                         |
|   auth.protect() - redirects to Clerk sign-in               |
+-----------------------------------------------------------+
                          |
            +-------------+-------------+
            |                           |
            v                           v
    Dashboard Layout              Admin Layout
    getCurrentTenant()            requireAdmin()
    |                             |
    +-- auth() check              +-- auth() check
    +-- tenant lookup             +-- publicMetadata.role
    +-- suspension check               === "admin"
    +-- redirect if needed
```

### Suspension Enforcement

- **WhatsApp webhook**: Drops messages from suspended tenants (step 2a)
- **Dashboard**: `getCurrentTenant()` now checks `is_suspended` and redirects to `/suspended`
- **Admin**: Can suspend/reactivate via `suspendTenant()`, logged to `admin_audit_log`

### RLS Status

RLS is defined on all 7 tables using `app.current_tenant_id` session variable, but is **bypassed** because all data access uses `createAdminClient()` (service_role key). Tenant isolation is enforced at the application layer via `.eq("tenant_id", tenantId)` in every query. Server actions derive `tenantId` server-side to prevent cross-tenant access.

---

## 11. Environment Variables Checklist

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://crleirobtdnzkfyzhkho.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/onboarding
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# DeepSeek
DEEPSEEK_API_KEY=...
DEEPSEEK_API_URL=https://api.deepseek.com/v1/chat/completions

# OpenAI (gpt-4o-transcribe for voice notes)
OPENAI_API_KEY=...

# Meta WhatsApp Cloud API
WHATSAPP_ACCESS_TOKEN=...         # REQUIRED: Get from Meta Business
WHATSAPP_PHONE_NUMBER_ID=...      # REQUIRED: Get from Meta Business
WHATSAPP_BUSINESS_ACCOUNT_ID=...   # REQUIRED: Get from Meta Business
WHATSAPP_WEBHOOK_VERIFY_TOKEN=...  # REQUIRED: Pick a random string, use same in Meta dashboard

# Paystack
PAYSTACK_SECRET_KEY=...            # REQUIRED: Get from Paystack dashboard
PAYSTACK_PUBLIC_KEY=...            # REQUIRED: Get from Paystack dashboard
PAYSTACK_STARTER_PLAN_CODE=...     # REQUIRED: Create plan in Paystack dashboard
PAYSTACK_PRO_PLAN_CODE=...         # REQUIRED: Create plan in Paystack dashboard

# Cron
CRON_SECRET=...                   # REQUIRED: Pick a random string for cron endpoint auth

# Resend (email - future feature, key is optional for now)
RESEND_API_KEY=...

# Plan limits (optional overrides)
# FREE_MESSAGE_LIMIT=30
# FREE_MAX_PRODUCTS=15
# STARTER_MESSAGE_LIMIT=200
```

---

## 12. File Structure

```
src/
  app/
    (marketing)/
      onboarding/           # 3-step business setup wizard
        actions.ts          # setupTenant, updateTenant, createProducts
        layout.tsx          # Auth guard - redirects to /sign-in
        page.tsx            # Orchestrates 3 steps
      sign-in/[[...sign-in]]/page.tsx    # Clerk sign-in
      sign-up/[[...sign-up]]/page.tsx    # Clerk sign-up
      suspended/page.tsx    # Suspended account notice
      layout.tsx            # Public layout (Header + Footer)
      page.tsx              # Landing page (hero, features, pricing)
    admin/
      tenants/page.tsx      # All tenants table
      tenants/[id]/page.tsx # Single tenant detail
      usage/page.tsx        # Usage metrics dashboard
      parsing/page.tsx      # Failed message review
      billing/page.tsx      # Billing overview
      actions.ts            # All admin server actions + audit logging
      layout.tsx            # Admin sidebar layout + requireAdmin gate
      page.tsx              # Redirect to /admin/tenants
    api/
      cron/
        cleanup-voice/route.ts    # Delete old voice files (CRON_SECRET auth)
        reset-usage/route.ts      # Reset monthly counts (CRON_SECRET auth)
      webhooks/
        whatsapp/route.ts         # WhatsApp inbound + Meta verification
        paystack/route.ts         # Paystack subscription events
      onboarding/setup-tenant/route.ts   # Tenant creation API
      messages/signed-url/route.ts       # Voice file signed URL
      products/check-duplicate/route.ts  # Fuzzy duplicate check
    dashboard/
      products/page.tsx   # Product catalog table
      products/actions.ts # createProduct, updateProduct, softDeleteProduct
      messages/page.tsx   # WhatsApp conversation history
      messages/actions.ts # fetchMessages, fetchLinkedEntries
      billing/page.tsx    # Plan management + payment history
      billing/actions.ts  # getBillingState, startSubscription, cancelSubscription
      categories/actions.ts  # createCategory, renameCategory, deleteCategory
      layout.tsx          # Dashboard shell (header + nav + getCurrentTenant)
      page.tsx            # Redirect to /dashboard/products
    layout.tsx             # Root layout (ClerkProvider)
    globals.css            # Tailwind + custom tokens
  components/
    admin/                 # Admin-specific UI components
      BillingView.tsx, ParsingView.tsx, TenantDetail.tsx,
      TenantTable.tsx, UsageView.tsx
    dashboard/             # Dashboard UI components
      BillingClient.tsx, CategoryManager.tsx, ChatFilters.tsx,
      ChatThread.tsx, EditProductModal.tsx, MessageBubble.tsx,
      ProductTable.tsx, VoicePlayer.tsx
    onboarding/            # Onboarding step components
      BusinessTypeStep.tsx, CompletionStep.tsx, ProductsStep.tsx
    ui/                    # Shared UI components
      Footer.tsx, Header.tsx
    LedgerRow.tsx, MetricCard.tsx, VoiceNoteParsing.tsx
  lib/
    billing.ts             # Plan types, limits, canProcessMessage (client+server)
    billing-server.ts      # Paystack API, tenant billing queries (server-only)
    whatsapp.ts            # WhatsApp Cloud API send helpers
    voice.ts               # Voice pipeline: Meta download → storage → Whisper
    deepseek.ts            # DeepSeek message parsing
    stock.ts               # updateProductStock + low-stock alert logic
    tenant.ts              # Business categories, fuzzy matching
    tenant-server.ts       # getCurrentTenant, getCurrentTenantId
    admin-auth.ts          # requireAdmin (role check gate)
    format.ts              # formatNaira
    constants.ts           # OpenAI model constant
    utils.ts               # Duplicate formatNaira (legacy)
    supabase/
      server.ts            # Admin client (service_role) + SSR client (anon)
      client.ts            # Browser client (anon)
  proxy.ts                 # Clerk middleware (auth.protect + public routes)
supabase/
  migrations/
    001_setup_schema.sql       # Core schema
    002_add_clerk_user_id.sql  # Clerk linking
    003_add_deleted_at.sql     # Soft delete
    004_add_low_stock_alert.sql# Alert dedup
    005_add_billing.sql        # Billing columns + RPCs
    006_add_admin_audit.sql    # Admin audit + comp/suspend flags
```

---

## 13. What's Missing

### Features Not Yet Built

| Item | Priority | Detail |
|---|---|---|
| Email integration (Resend) | Low | API key configured but no email templates or triggers wired |
| Dedicated Settings page | Low | "Settings" nav link goes to `/onboarding` wizard instead of a proper settings page |
| Weekly WhatsApp summaries | Medium | Mentioned as feature but no cron/scheduler exists to generate reports |
| Admin role setup documentation | Low | Admins created manually via Clerk Dashboard → Users → Metadata `{ role: "admin" }` |
| `zod` schema validation | Low | Installed but not used for input validation anywhere |
| Live Paystack keys | **Prod** | Currently using test keys — switch before launch |
| WhatsApp webhook verify token | **Prod** | Empty — set before Meta can verify the webhook |
| WhatsApp templates approval | **Prod** | Templates `plan_limit_exceeded` and `entry_unclear_fallback` must be created in Meta Business Manager |

### Known Limitations

| Limitation | Detail |
|---|---|
| Phone lookup loads all tenants | `findTenantByPhone` has no DB-level filter — degrades with scale |
| No uniqueness on `whatsapp_number` | Multiple tenants could register with same number |
| RLS defined but bypassed | All queries use service_role — application-level isolation only |
| Date drift in billing cycle | `+ INTERVAL '1 month'` causes drift (Jan 31 → Feb 28 → Mar 28) |
| No rate limiting on webhook | Burst WhatsApp messages could spike API costs |
| No upper bound on parsed amounts | Hallucinated values would be written to ledger |
| N+1 queries in admin usage | `fetchUsageRows` does 2 queries per tenant |
| Re-run parse may not notify user | Low-confidence admin re-runs are silent — no WhatsApp confirmation sent |

---

## 14. Deployment Checklist

- [ ] Set `WHATSAPP_WEBHOOK_VERIFY_TOKEN` and configure in Meta Developer dashboard
- [ ] Set `CRON_SECRET` for cron endpoint authentication
- [ ] Create WhatsApp templates (`plan_limit_exceeded`, `entry_unclear_fallback`) in Meta Business Manager
- [ ] Create Paystack subscription plans:
  - Starter: N3,500/month (200 messages, unlimited products)
  - Pro: N5,000/month (unlimited messages, unlimited products)
- [ ] Populate `PAYSTACK_STARTER_PLAN_CODE` and `PAYSTACK_PRO_PLAN_CODE`
- [ ] Switch Paystack from test keys (`sk_test_`) to live keys (`sk_live_`)
- [ ] Set `NEXT_PUBLIC_APP_URL` to production domain
- [ ] Configure Clerk production instance
- [ ] Set admin user: Clerk Dashboard → Users → [user] → Metadata → `{ "role": "admin" }`
- [ ] Set up cron jobs (Vercel Cron, GitHub Actions, or external scheduler):
  - `GET https://your-domain.com/api/cron/cleanup-voice?token=CRON_SECRET` — daily
  - `GET https://your-domain.com/api/cron/reset-usage?token=CRON_SECRET` — daily
- [ ] Configure Paystack webhook: dashboard → `https://your-domain.com/api/webhooks/paystack`
- [ ] Configure WhatsApp webhook: Meta dashboard → `https://your-domain.com/api/webhooks/whatsapp`
- [ ] Run `npm run build` and verify zero errors
- [ ] Run database migrations against production Supabase instance
