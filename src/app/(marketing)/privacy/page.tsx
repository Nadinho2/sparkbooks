import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy – SparkBooks",
  description:
    "How SparkBooks collects, uses, stores, and protects your information.",
};

export default function PrivacyPage() {
  return (
    <section className="w-full max-w-3xl mx-auto px-6 pt-16 pb-24 sm:pt-24 sm:pb-32">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink transition-colors mb-8"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10 3L5 8l5 5" />
        </svg>
        Back to home
      </Link>

      <h1 className="font-display text-3xl sm:text-4xl tracking-tight text-ink mb-2">
        Privacy Policy
      </h1>

      <p className="text-sm text-ink-muted mb-12">
        Effective Date: July 18, 2026 &nbsp;&middot;&nbsp; Last Updated: July
        18, 2026
      </p>

      <p className="text-ink-muted leading-relaxed mb-10">
        SparkBooks is a product of UltimaSpark Agency
        (&ldquo;UltimaSpark,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or
        &ldquo;our&rdquo;). This Privacy Policy explains how we collect, use,
        store, and protect information when you use SparkBooks, including our
        website, WhatsApp-based bookkeeping service, and dashboard (collectively,
        the &ldquo;Service&rdquo;).
      </p>

      <p className="text-ink-muted leading-relaxed mb-10">
        By using SparkBooks, you agree to the collection and use of information
        as described in this policy.
      </p>

      <div className="space-y-10">
        {/* 1. Information We Collect */}
        <section>
          <h2 className="font-display text-xl text-ink mb-3">
            1. Information We Collect
          </h2>

          <h3 className="text-ink font-medium mb-2">
            1.1 Information You Provide Directly
          </h3>
          <ul className="list-disc pl-5 space-y-2 text-ink-muted leading-relaxed mb-4">
            <li>
              <strong className="text-ink">Business information:</strong>{" "}
              business name, business type, WhatsApp number, provided during
              onboarding
            </li>
            <li>
              <strong className="text-ink">Product and inventory data:</strong>{" "}
              product names, categories, quantities, unit costs, reorder
              thresholds
            </li>
            <li>
              <strong className="text-ink">Financial data:</strong> sales and
              expense entries you send us, either as text or voice messages
            </li>
            <li>
              <strong className="text-ink">Account information:</strong> email
              address and authentication details, managed through our
              authentication provider, Clerk
            </li>
            <li>
              <strong className="text-ink">Billing information:</strong>{" "}
              processed directly by our payment provider, Paystack. We do not
              store your card details on our own servers
            </li>
          </ul>

          <h3 className="text-ink font-medium mb-2">
            1.2 Information Collected Automatically
          </h3>
          <ul className="list-disc pl-5 space-y-2 text-ink-muted leading-relaxed">
            <li>
              <strong className="text-ink">WhatsApp messages:</strong> the
              content of text and voice messages you send to our WhatsApp number
              for the purpose of logging sales, expenses, and stock updates
            </li>
            <li>
              <strong className="text-ink">Voice recordings:</strong> voice
              notes are temporarily stored to allow transcription, then deleted
              from our storage after a limited retention period
            </li>
            <li>
              <strong className="text-ink">Usage data:</strong> message counts,
              feature usage, and timestamps, used to enforce plan limits and
              improve the Service
            </li>
          </ul>
        </section>

        {/* 2. How We Use Your Information */}
        <section>
          <h2 className="font-display text-xl text-ink mb-3">
            2. How We Use Your Information
          </h2>
          <p className="text-ink-muted leading-relaxed mb-3">
            We use the information we collect to:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-ink-muted leading-relaxed mb-3">
            <li>
              Parse your WhatsApp messages into structured ledger entries and
              stock movements
            </li>
            <li>
              Maintain your product catalog and track inventory levels
            </li>
            <li>
              Send you confirmations, clarification requests, and low-stock
              alerts via WhatsApp
            </li>
            <li>Process subscription billing and manage your plan tier</li>
            <li>Provide customer support and respond to inquiries</li>
            <li>Monitor and enforce usage limits associated with your plan</li>
            <li>
              Improve the accuracy of our AI parsing and transcription systems
            </li>
            <li>Comply with legal obligations</li>
          </ul>
          <p className="text-ink-muted leading-relaxed">
            We do not sell your personal or business data to third parties.
          </p>
        </section>

        {/* 3. Third-Party Services */}
        <section>
          <h2 className="font-display text-xl text-ink mb-3">
            3. Third-Party Services We Use
          </h2>
          <p className="text-ink-muted leading-relaxed mb-4">
            To operate SparkBooks, we share limited data with the following
            service providers, each of which processes data under their own
            privacy and security terms:
          </p>

          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-rule text-left text-ink">
                  <th className="pb-2 pr-4 font-medium">Provider</th>
                  <th className="pb-2 pr-4 font-medium">Purpose</th>
                  <th className="pb-2 font-medium">Data Shared</th>
                </tr>
              </thead>
              <tbody className="text-ink-muted">
                {[
                  {
                    provider: "Meta (WhatsApp Cloud API)",
                    purpose: "Sending and receiving WhatsApp messages",
                    data: "Your WhatsApp number, message content",
                  },
                  {
                    provider: "OpenAI",
                    purpose: "Voice note transcription",
                    data: "Audio content of voice messages",
                  },
                  {
                    provider: "DeepSeek",
                    purpose: "Parsing message content into structured entries",
                    data: "Message text, relevant product catalog context",
                  },
                  {
                    provider: "Supabase",
                    purpose: "Database and file storage",
                    data: "All business, product, and message data",
                  },
                  {
                    provider: "Clerk",
                    purpose: "Authentication and account management",
                    data: "Email address, authentication credentials",
                  },
                  {
                    provider: "Paystack",
                    purpose: "Payment processing and subscription billing",
                    data: "Billing details, transaction history",
                  },
                  {
                    provider: "Resend",
                    purpose: "Transactional email (where applicable)",
                    data: "Email address",
                  },
                ].map((row) => (
                  <tr key={row.provider} className="border-b border-rule/40">
                    <td className="py-2.5 pr-4">{row.provider}</td>
                    <td className="py-2.5 pr-4">{row.purpose}</td>
                    <td className="py-2.5">{row.data}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-ink-muted leading-relaxed mt-4">
            We only share the minimum data necessary for each provider to
            perform its function.
          </p>
        </section>

        {/* 4. Data Retention */}
        <section>
          <h2 className="font-display text-xl text-ink mb-3">
            4. Data Retention
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-ink-muted leading-relaxed">
            <li>
              <strong className="text-ink">Voice recordings</strong> are
              retained only long enough to complete transcription, then deleted
              on a routine schedule.
            </li>
            <li>
              <strong className="text-ink">
                Ledger entries, stock movements, and product data
              </strong>{" "}
              are retained for as long as your account remains active, and for a
              reasonable period afterward to comply with accounting and legal
              obligations.
            </li>
            <li>
              <strong className="text-ink">Account information</strong> is
              retained until you request deletion or your account is closed.
            </li>
          </ul>
          <p className="text-ink-muted leading-relaxed mt-3">
            You may request earlier deletion of your data by contacting us (see
            Section 8).
          </p>
        </section>

        {/* 5. Data Security */}
        <section>
          <h2 className="font-display text-xl text-ink mb-3">
            5. Data Security
          </h2>
          <p className="text-ink-muted leading-relaxed">
            We take reasonable technical and organizational measures to protect
            your information, including encrypted data storage, access controls,
            and audit logging for administrative access to tenant data. However,
            no method of transmission or storage is 100% secure, and we cannot
            guarantee absolute security.
          </p>
        </section>

        {/* 6. Your Rights */}
        <section>
          <h2 className="font-display text-xl text-ink mb-3">
            6. Your Rights
          </h2>
          <p className="text-ink-muted leading-relaxed mb-3">
            Depending on your location, you may have the right to:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-ink-muted leading-relaxed mb-3">
            <li>Access the personal data we hold about you</li>
            <li>Request correction of inaccurate data</li>
            <li>Request deletion of your data</li>
            <li>Object to or restrict certain processing</li>
            <li>Request a copy of your data in a portable format</li>
          </ul>
          <p className="text-ink-muted leading-relaxed">
            To exercise any of these rights, contact us using the details in
            Section 8.
          </p>
        </section>

        {/* 7. Children's Privacy */}
        <section>
          <h2 className="font-display text-xl text-ink mb-3">
            7. Children&apos;s Privacy
          </h2>
          <p className="text-ink-muted leading-relaxed">
            SparkBooks is intended for business use by adults operating a
            commercial enterprise. We do not knowingly collect data from
            individuals under 18.
          </p>
        </section>

        {/* 8. Contact Us */}
        <section>
          <h2 className="font-display text-xl text-ink mb-3">
            8. Contact Us
          </h2>
          <p className="text-ink-muted leading-relaxed mb-2">
            For privacy-related questions or requests, contact:
          </p>
          <p className="text-ink leading-relaxed">
            <strong>UltimaSpark Agency</strong>
            <br />
            Email:{" "}
            <a
              href="mailto:ultimasparkbooks@gmail.com"
              className="text-spark hover:underline"
            >
              ultimasparkbooks@gmail.com
            </a>
          </p>
        </section>

        {/* 9. Changes to This Policy */}
        <section>
          <h2 className="font-display text-xl text-ink mb-3">
            9. Changes to This Policy
          </h2>
          <p className="text-ink-muted leading-relaxed">
            We may update this Privacy Policy from time to time. Material
            changes will be communicated via the Service or by email. Continued
            use of SparkBooks after changes take effect constitutes acceptance
            of the updated policy.
          </p>
        </section>
      </div>
    </section>
  );
}
