# SparkBooks — Meta WhatsApp Cloud API Setup Guide

This guide walks you step-by-step through setting up the official **Meta WhatsApp Cloud API (v22.0)** for SparkBooks.

---

## Overview

SparkBooks uses the official Meta WhatsApp Cloud API to:
1. **Receive WhatsApp messages & voice notes** via incoming webhook (`POST /api/webhooks/whatsapp`).
2. **Download voice audio** and transcribe via OpenAI Whisper.
3. **Send AI parsing confirmations & stock alerts** via Cloud API text & template messages.

### The 5 Environment Variables You Need

```env
WHATSAPP_ACCESS_TOKEN=EAAG...
WHATSAPP_PHONE_NUMBER_ID=123456789012345
WHATSAPP_BUSINESS_ACCOUNT_ID=987654321098765
WHATSAPP_WEBHOOK_VERIFY_TOKEN=your_custom_secret_token
WHATSAPP_APP_SECRET=a1b2c3d4e5f6...
```

---

## Phase 1: Create Your Meta Developer Account & App

1. Go to **[developers.facebook.com](https://developers.facebook.com)** and log in with your Facebook account.
2. Click **My Apps** in the top-right corner.
3. Click **Create App**:
   - What do you want your app to do? Select **Other**. Click **Next**.
   - Select an app type: Select **Business**. Click **Next**.
   - **App Name**: Enter `SparkBooks` (or your company name).
   - **App Contact Email**: Enter your email.
   - **Business Account**: Select your Meta Business Account (if you don't have one, Meta will prompt you to create one).
   - Click **Create App**.

---

## Phase 2: Add WhatsApp Product & Get Sandbox Credentials

1. In your new App Dashboard, scroll down to the **Add products to your app** section.
2. Find **WhatsApp** and click **Set up**.
3. In the left sidebar, click **WhatsApp** → **API Setup**.
4. You are now on the WhatsApp sandbox page. You will see:
   - **Temporary access token** (valid for 24 hours — fine for initial test).
   - **Phone number ID**: A 15-digit number (e.g., `512345678901234`).
   - **WhatsApp Business Account ID**: A 15-digit number.
   - **From**: A free Meta test number (e.g., `+1 555-025-4583`).

### Send Your First Test Message (Sandbox):
1. In the **To** dropdown, select **Manage phone number list**.
2. Add your personal WhatsApp phone number (with country code, e.g. `2348012345678`).
3. Meta sends an SMS verification code to your phone. Enter the code.
4. Click **Send message**. You should immediately receive a "Hello World" template on your phone!

---

## Phase 3: Create a Permanent Access Token (System User)

> ⚠️ **Important:** The temporary token expires in 24 hours. For SparkBooks to run 24/7, you **must** generate a permanent System User Token.

1. Go to **[business.facebook.com/settings](https://business.facebook.com/settings)** (Meta Business Settings).
2. Ensure you have the correct business account selected in the top-left dropdown.
3. In the left navigation, go to **Users** → **System Users**.
4. Click **Add**:
   - System user name: `sparkbooks-backend`
   - System user role: **Admin**
   - Click **Create system user**.
5. Click **Assign Assets**:
   - Under **Apps**: Select your `SparkBooks` app → enable **Full Control (Manage app)**.
   - Under **WhatsApp Accounts**: Select your WhatsApp account → enable **Full Control (Manage WhatsApp Account)**.
   - Click **Save Changes**.
6. Now click **Generate New Token**:
   - Select your `SparkBooks` app from the dropdown.
   - Token expiration: Select **Never**.
   - Under permissions, check these two required permissions:
     - `whatsapp_business_messaging`
     - `whatsapp_business_management`
   - Click **Generate Token**.
7. **Copy this token immediately** and save it. It will never be shown again!
   - This token is your `WHATSAPP_ACCESS_TOKEN`.

---

## Phase 4: Get Your App Secret

1. Return to **[developers.facebook.com/apps](https://developers.facebook.com/apps)** and select your app.
2. In the left sidebar, go to **App Settings** → **Basic**.
3. Next to **App Secret**, click **Show** (you may be asked to re-enter your Facebook password).
4. Copy the App Secret.
   - This value is your `WHATSAPP_APP_SECRET`.
   - SparkBooks uses this secret to verify the HMAC `X-Hub-Signature-256` signature on every incoming webhook, preventing forged messages.

---

## Phase 5: Configure the Webhook

Meta needs to notify SparkBooks when a user sends a text or voice message.

### 1. Set your Verification Token
Choose any random secure secret string you like. For example:
```env
WHATSAPP_WEBHOOK_VERIFY_TOKEN=sparkbooks_super_secret_wa_token_2026
```
Add this to your `.env.local` (and Vercel environment variables).

### 2. Configure in Meta Developer Portal
1. In your Meta App Dashboard, go to **WhatsApp** → **Configuration** in the left menu.
2. In the **Webhook** section, click **Edit**:
   - **Callback URL**:
     - *For Production (Vercel):* `https://your-domain.com/api/webhooks/whatsapp`
     - *For Local Development:* `https://your-ngrok-subdomain.ngrok-free.app/api/webhooks/whatsapp`
   - **Verify Token**: Enter the exact same string you put in `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
   - Click **Verify and save**.
   *(Meta will send a `GET` request with `hub.challenge` to your server. If your app is running and the token matches, Meta shows a green checkmark!)*

### 3. Subscribe to Webhook Fields
1. Under **Webhook fields**, click **Manage**.
2. Find the row for **`messages`**.
3. Click **Subscribe**.
4. *(Optional)* You can also subscribe to `message_template_status_update`.
5. Click **Done**.

---

## Phase 6: Local Testing with Ngrok

Because Meta requires a public HTTPS URL for webhooks, local development requires a tunnel:

1. Start your SparkBooks dev server:
   ```bash
   cmd /c npm run dev
   ```
2. In another terminal, start ngrok:
   ```bash
   npx ngrok http 3000
   ```
3. Copy the HTTPS Forwarding URL (e.g., `https://abc-123.ngrok-free.app`).
4. In Meta WhatsApp Configuration, set Callback URL to:
   `https://abc-123.ngrok-free.app/api/webhooks/whatsapp`
5. Send a WhatsApp message from your verified phone number to the test number:
   `"Sold 2 bone straight hair for 150000"`
6. Watch your local SparkBooks server log the incoming webhook, extract the sale via DeepSeek AI, and log the ledger entry!

---

## Phase 7: Going to Production with a Real WhatsApp Number

When you are ready to switch from Meta's test sandbox number to your real business WhatsApp number:

### 1. Requirements for the Phone Number
- Must be able to receive an SMS or voice phone call for verification.
- **CRITICAL:** The number **cannot be actively registered on the standard WhatsApp or WhatsApp Business mobile app**.
  - If it is currently on your phone, go to WhatsApp Settings → Account → **Delete My Account**.
  - (The Cloud API replaces the phone app completely — all messages flow through SparkBooks).

### 2. Add Phone Number in Meta
1. In WhatsApp → **API Setup**, scroll to **Step 5: Add a phone number**.
2. Click **Add phone number**.
3. Enter your Business Profile info:
   - Display name (e.g. `SparkBooks Bot` or `Belle Hairs Assistant`)
   - Category (e.g. *Finance*, *Retail*, or *Other*)
   - Description
4. Enter the phone number and choose SMS or Voice call verification.
5. Enter the 6-digit verification code.
6. Once verified, copy the new **Phone Number ID** and update `WHATSAPP_PHONE_NUMBER_ID` in your environment variables.

### 3. Business Verification & Billing
- **Free Tier:** Meta gives every WhatsApp Business Account **1,000 free service conversations every month**.
- Add a credit/debit card in **Meta Business Settings → Payments** so service never interrupts if you exceed the free tier.
- You can complete Meta Business Verification in **Security Center** to unlock unlimited messaging tiers.

---

## Summary Checklist

| Variable | Source | Description |
| :--- | :--- | :--- |
| `WHATSAPP_ACCESS_TOKEN` | Meta Business Settings → System Users | Permanent Admin token (`never` expire) |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta App → WhatsApp → API Setup | 15-digit ID of sender number |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Meta App → WhatsApp → API Setup | 15-digit ID of WhatsApp Business Account |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Created by you | Secret string shared between Meta & `.env.local` |
| `WHATSAPP_APP_SECRET` | Meta App → App Settings → Basic | Used to verify HMAC signature `X-Hub-Signature-256` |
