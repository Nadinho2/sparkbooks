# SparkBooks

AI-powered bookkeeping on WhatsApp. Send sales, expenses, and stock updates as WhatsApp messages — SparkBooks parses them into clean ledgers, tracks inventory, and alerts you before you run out.

## Quick Start

```bash
npm install
cp .env.example .env.local  # then fill in your API keys
npm run dev                  # starts on http://localhost:3000
```

## Tech

Next.js 16 · Clerk auth · Supabase PostgreSQL · DeepSeek AI · OpenAI Whisper · Paystack · Meta WhatsApp Cloud API · Resend email · Vercel hosting

## Full Docs

See [AGENTS.md](./AGENTS.md) for comprehensive project documentation covering:
- Project structure and architecture
- Environment variables
- Database schema
- Key flows (onboarding, WhatsApp processing, team, payments, admin)
- API routes and security
- Vercel deployment checklist
