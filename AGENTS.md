<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# SparkBooks — Project Documentation

AI-powered bookkeeping on WhatsApp. Sellers send sales, expenses, and stock updates as WhatsApp messages. SparkBooks parses them into clean ledgers, tracks inventory, and alerts you before you run out.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Auth | Clerk (server-side `auth()`, metadata roles) |
| Database | Supabase PostgreSQL (service_role for admin ops) |
| AI Parsing | DeepSeek v4 Pro (chat completions) |
| Voice Transcription | OpenAI Whisper (gpt-4o-transcribe) |
| Payments | Paystack (subscriptions + webhooks) |
| WhatsApp API | Meta Cloud API v22.0 |
| Email | Resend (transactional invitations) |
| Hosting | Vercel (cron jobs, edge functions) |

---

## Project Structure

```
src/
├── app/
│   ├── (marketing)/         # Public-facing pages
│   │   ├── page.tsx          # Landing page
│   │   ├── onboarding/       # Business setup wizard
│   │   │   ├── page.tsx       # Client step component
│   │   │   └── actions.ts     # Server actions (tenant creation, products)
│   │   ├── sign-in/          # Clerk sign-in
│   │   ├── sign-up/          # Clerk sign-up
│   │   ├── suspended/        # Suspension notice
│   │   ├── refund/           # Refund policy
│   │   ├── deletion/         # Data deletion page
│   │   ├── terms/            # Terms of service
│   │   └── privacy/          # Privacy policy
│   ├── dashboard/            # Authenticated user dashboard
│   │   ├── layout.tsx         # Dashboard shell (header, nav, footer)
│   │   ├── page.tsx           # Overview / metrics
│   │   ├── messages/          # WhatsApp message thread
│   │   │   ├── page.tsx        # ChatThread + ChatFilters
│   │   │   └── actions.ts      # Server actions (fetch messages, rerun parse)
│   │   ├── products/          # Product catalog
│   │   │   ├── page.tsx        # ProductTable + CategoryManager
│   │   │   └── actions.ts      # CRUD server actions
│   │   ├── categories/        # Category management
│   │   │   └── actions.ts      # create/rename/delete categories
│   │   ├── team/              # Multi-user team (Pro only)
│   │   │   ├── page.tsx        # TeamView
│   │   │   └── actions.ts      # invite/update/remove members
│   │   └── billing/           # Subscription management
│   │       ├── page.tsx        # BillingClient
│   │       └── actions.ts      # start/cancel/manage subscription
│   ├── admin/                # Super-admin panel
│   │   ├── layout.tsx         # Admin sidebar + auth gate
│   │   ├── page.tsx           # Admin dashboard
│   │   ├── tenants/           # Tenant list + detail
│   │   ├── usage/             # Usage analytics
│   │   ├── parsing/           # AI parsing configuration
│   │   ├── billing/           # Billing overview
│   │   └── actions.ts         # Admin server actions (comp, suspend, list)
│   └── api/                  # API routes
│       ├── webhooks/
│       │   ├── whatsapp/route.ts  # Meta webhook (GET verify, POST handler)
│       │   └── paystack/route.ts   # Paystack webhook handler
│       ├── cron/
│       │   ├── reset-usage/route.ts     # Daily message count reset
│       │   └── cleanup-voice/route.ts   # Voice file cleanup
│       ├── debug/
│       │   └── session/route.ts   # Debug: return current session info
│       └── onboarding/
│           └── setup-tenant/route.ts   # Tenant setup endpoint
├── components/
│   ├── ui/                   # Shared UI primitives
│   │   ├── BackButton.tsx
│   │   ├── Header.tsx
│   │   ├── Footer.tsx
│   │   └── SignOutButton.tsx
│   ├── dashboard/            # Dashboard-specific components
│   │   ├── BillingClient.tsx   # Plan cards + billing management
│   │   ├── CategoryManager.tsx # Category CRUD inline component
│   │   ├── ChatFilters.tsx     # Message search/filter bar
│   │   ├── ChatThread.tsx      # Message thread with auto-scroll
│   │   ├── EditProductModal.tsx # Product create/edit modal
│   │   ├── MessageBubble.tsx   # Single message renderer
│   │   ├── ProductTable.tsx    # Product table + mobile card view
│   │   ├── TeamView.tsx        # Team member list + invite form
│   │   └── VoicePlayer.tsx     # Voice note audio player
│   ├── admin/                # Admin panel components
│   │   ├── Sidebar.tsx         # Responsive admin sidebar
│   │   ├── BillingView.tsx     # Billing analytics
│   │   ├── ParsingView.tsx     # Parsing config
│   │   ├── TenantDetail.tsx    # Single tenant detail view
│   │   ├── TenantTable.tsx     # Tenant list table
│   │   └── UsageView.tsx       # Usage stats
│   └── onboarding/           # Onboarding step components
│       ├── BusinessTypeStep.tsx
│       ├── ProductsStep.tsx
│       └── CompletionStep.tsx
├── lib/                     # Shared utilities (server-only unless noted)
│   ├── admin-auth.ts         # requireAdmin(), isAdmin() — server-side gate
│   ├── billing.ts            # Plan limits, validation (safe server + client)
│   ├── billing-server.ts     # Paystack API, DB mutations (server-only)
│   ├── deepseek.ts           # DeepSeek AI parsing
│   ├── email.ts              # Resend transactional email templates
│   ├── stock.ts              # Stock movement + low-stock alert logic
│   ├── supabase/
│   │   └── server.ts          # createAdminClient (service_role)
│   ├── tenant.ts             # Business categories, fuzzy matching
│   ├── tenant-server.ts      # getCurrentTenant(), isTenantOwner()
│   ├── voice.ts              # Voice note download → transcribe → store
│   └── whatsapp.ts           # Send text + template messages via Meta API
└── supabase/
    └── migrations/           # SQL migration files
        ├── 001_initial.sql
        ├── ...
        └── 007_add_tenant_members.sql
```

---

## Environment Variables

Copy `.env.example` → `.env.local` and fill in all values. Required vars:

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=                # e.g. https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=           # Publishable key (client-safe)
SUPABASE_SERVICE_ROLE_KEY=              # Service role key (server-only, bypasses RLS)

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=       # Publishable key
CLERK_SECRET_KEY=                        # Secret key (server-only)

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# DeepSeek
DEEPSEEK_API_KEY=
DEEPSEEK_API_URL=https://api.deepseek.com/v1/chat/completions

# OpenAI (Whisper transcription for voice notes)
OPENAI_API_KEY=

# Meta WhatsApp Cloud API
WHATSAPP_ACCESS_TOKEN=                  # From Meta Developer Dashboard
WHATSAPP_PHONE_NUMBER_ID=               # From Meta → WhatsApp → Settings
WHATSAPP_BUSINESS_ACCOUNT_ID=           # From Meta → Business Settings
WHATSAPP_WEBHOOK_VERIFY_TOKEN=          # Custom random string for webhook
WHATSAPP_APP_SECRET=                    # From Meta → App Settings → Security

# Paystack
PAYSTACK_SECRET_KEY=                    # Secret key (server-only)
PAYSTACK_STARTER_PLAN_CODE=             # Paystack plan code for Starter
PAYSTACK_PRO_PLAN_CODE=                 # Paystack plan code for Pro

# Cron
CRON_SECRET=                            # Random string for cron auth (openssl rand -hex 32)

# Resend
RESEND_API_KEY=                         # For team invitation emails
```

---

## Database Schema

### Core tables

| Table | Purpose |
|-------|--------|
| `tenants` | Business accounts — plan, limits, WhatsApp number, clerk_user_id |
| `products` | Product catalog scoped to tenant, with category_id, quantity, unit_cost |
| `categories` | Product categories scoped to tenant |
| `ledger_entries` | Sales and expense records, linked to product + WhatsApp message |
| `stock_movements` | Stock in/out movements with running balance |
| `whatsapp_messages` | All inbound/outbound WhatsApp messages, with parsing results |
| `tenant_members` | Multi-user team members (Pro plan only) |
| `billing_invoices` | Payment history / invoice records |

### Key columns

- **`tenants`**: `plan_tier` (free/starter/pro), `plan_status` (active/cancelled/past_due), `monthly_message_count`, `monthly_message_limit`, `paystack_subscription_id`, `paystack_customer_id`, `current_period_end`, `is_suspended`
- **`whatsapp_messages`**: `wa_message_id` (unique, idempotency check), `status` (pending_confirmation/matched/failed/unmatched), `sender_member_id` (links to tenant_members), `transcript`, `media_url`, `linked_entry_id`
- **`tenant_members`**: `clerk_user_id`, `invited_email`, `status` (active/pending/removed), `role` (owner/member), `whatsapp_number`

---

## Key Flows

### 1. Onboarding

1. User signs up via Clerk → redirected to `/onboarding`
2. Step 1: Choose business type (Hair/Beauty, Provisions, Fashion)
3. Step 2: Add initial products (or skip for later)
4. Step 3: WhatsApp number setup + completion
5. Server action creates `tenants` row, default categories from business type, initial products

### 2. WhatsApp Message Processing

1. Meta sends webhook to `POST /api/webhooks/whatsapp`
2. **HMAC verification** (`X-Hub-Signature-256`) using `WHATSAPP_APP_SECRET`
3. **Return 200 immediately** — processing happens async
4. Async flow:
   - Idempotency check on `wa_message_id`
   - Resolve tenant by `display_phone_number`
   - Resolve sender member by WhatsApp number (team identification)
   - Plan limit check → block if exceeded
   - Voice notes: download audio → upload to Supabase Storage → transcribe via OpenAI Whisper
   - Text messages: check for pending new-product confirmations
   - Parse with DeepSeek → extract product, quantity, price, entry type
   - High confidence + matched product → create ledger entry + update stock
   - High confidence + new product → ask for confirmation
   - Low confidence → send clarification prompt

### 3. Team / Multi-user (Pro only)

1. Owner invites staff member by email (from `/dashboard/team`)
2. Resend sends branded HTML invitation email with sign-up link
3. Staff signs up with the invited email → Clerk account created
4. `getCurrentTenant()` auto-activates the pending invite on first sign-in
5. Staff gets dashboard access — same tenant, shared WhatsApp number
6. WhatsApp messages are matched to staff members via `sender_member_id`
7. Only the **owner** can invite, update WhatsApp numbers, or remove members
8. All team mutations are gated behind `requireProPlan()` → `isTenantOwner()`

### 4. Payment / Billing

1. User selects plan → `startSubscription()` server action
2. Creates/verifies Paystack customer, creates subscription
3. Returns `authorization_url` — user completes payment on Paystack
4. Paystack webhook `charge.success` → sets `plan_status=active`, updates `current_period_end`
5. `invoice.payment_failed` → sets `plan_status=past_due`, notifies via WhatsApp
6. `subscription.disable` → marks `plan_status=cancelled`, respects `current_period_end`
7. `cancelSubscription()` cancels at Paystack but keeps paid access until period end
8. Daily cron `reset-usage` → resets `monthly_message_count` for all tenants

### 5. Admin Panel

- Access requires Clerk `publicMetadata.role === "admin"` (set manually in Clerk Dashboard)
- Server-side gate: `requireAdmin()` redirects non-admins
- Pages: Tenant list/detail, usage analytics, parsing config, billing overview
- Admin can: suspend tenants, grant complimentary access, view all data

---

## API Routes

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/webhooks/whatsapp` | GET | Token | Webhook verification (Meta) |
| `/api/webhooks/whatsapp` | POST | HMAC | Inbound message processing |
| `/api/webhooks/paystack` | POST | HMAC | Subscription event handling |
| `/api/cron/reset-usage` | GET | CRON_SECRET | Daily message count reset |
| `/api/cron/cleanup-voice` | GET | CRON_SECRET | Voice file cleanup |
| `/api/debug/session` | GET | Admin role | Debug: current auth session (admin only) |

---

## Security

| Feature | Implementation |
|--------|---------------|
| WhatsApp HMAC | `X-Hub-Signature-256` verified with `WHATSAPP_APP_SECRET` |
| Paystack HMAC | `x-paystack-signature` verified with `PAYSTACK_SECRET_KEY` |
| Cron auth | `CRON_SECRET` mandatory via Bearer token or `?token=` query param |
| Tenant isolation | Every server action uses `getCurrentTenantId()` → `.eq("tenant_id", tenantId)` |
| Team owner gate | `isTenantOwner()` check before member mutations |
| Pro plan gate | `requireProPlan()` before team feature access |
| Admin gate | `requireAdmin()` server-side redirect for all admin pages |
| Idempotency | WhatsApp webhook checks `wa_message_id` before processing |
| Fetch timeouts | All external API calls use `AbortController` (15-20s timeout) |
| Async processing | WhatsApp webhook returns 200 before AI processing begins |
| RLS | Supabase tables have RLS policies (bypassed by service_role client in server code) |

---

## Deployment Checklist

1. **Apply DB migrations** — run all SQL in `supabase/migrations/` via Supabase SQL Editor
2. **Create DB function**: `increment_message_count(tenant_id BIGINT)` for atomic message counting
3. **Set all env vars** in Vercel (see `.env.example`)
4. **Configure Meta webhook** callback URL → `https://your-domain.com/api/webhooks/whatsapp`
5. **Configure Paystack webhook** → `https://your-domain.com/api/webhooks/paystack`
6. **Set up Vercel cron jobs**:
   - `/api/cron/reset-usage` → daily at midnight
   - `/api/cron/cleanup-voice` → daily at 3 AM
   - Pass `CRON_SECRET` via query param: `?token=YOUR_CRON_SECRET`
7. **Verify Resend domain** — `noreply@sparkbooks.com` must be a verified sending domain
8. **Add `WHATSAPP_APP_SECRET`** from Meta Developer Dashboard → App Settings → Security
9. **Run `npm run build`** — should pass with 0 errors

---

## Development

```bash
npm run dev        # Start dev server (Turbopack)
npm run build      # Production build
npm run lint       # ESLint
```

The dev server runs on `http://localhost:3000`. WhatsApp webhooks will only work in production (Meta requires HTTPS). For local testing, use a tool like ngrok to expose your local server.
