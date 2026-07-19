import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Data Deletion Instructions – SparkBooks",
  description:
    "How to request deletion of your personal and business data from SparkBooks.",
};

export default function DeletionPage() {
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
        Data Deletion Instructions
      </h1>

      <p className="text-sm text-ink-muted mb-12">
        Last Updated: July 18, 2026
      </p>

      <p className="text-ink-muted leading-relaxed mb-10">
        SparkBooks, operated by UltimaSpark Agency, respects your right to
        control your personal and business data. This page explains how you can
        request the deletion of your data from our systems.
      </p>

      <div className="space-y-10">
        {/* What Data We Delete */}
        <section>
          <h2 className="font-display text-xl text-ink mb-3">
            What Data We Delete
          </h2>
          <p className="text-ink-muted leading-relaxed mb-3">
            Upon a verified deletion request, we will permanently delete:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-ink-muted leading-relaxed">
            <li>Your business/tenant account and profile information</li>
            <li>Your product catalog and inventory records</li>
            <li>
              Your WhatsApp message history and any stored voice recordings
            </li>
            <li>Your ledger entries (sales and expense records)</li>
            <li>
              Your billing and subscription records, except where retention is
              legally required (see below)
            </li>
            <li>Your authentication account with our identity provider, Clerk</li>
          </ul>
        </section>

        {/* How to Request Deletion */}
        <section>
          <h2 className="font-display text-xl text-ink mb-3">
            How to Request Deletion
          </h2>
          <p className="text-ink-muted leading-relaxed mb-3">
            You can request deletion of your data through either of the
            following methods:
          </p>

          <div className="mb-4">
            <p className="text-ink font-medium mb-1">
              Option 1: In-App Request
            </p>
            <p className="text-ink-muted leading-relaxed">
              Go to Dashboard → Settings and select &ldquo;Request Account
              Deletion,&rdquo; or contact our support team directly through the
              dashboard.
            </p>
          </div>

          <div>
            <p className="text-ink font-medium mb-1">
              Option 2: Email Request
            </p>
            <p className="text-ink-muted leading-relaxed mb-2">
              Send an email to{" "}
              <a
                href="mailto:ultimasparkbooks@gmail.com"
                className="text-spark hover:underline"
              >
                ultimasparkbooks@gmail.com
              </a>{" "}
              with the subject line &ldquo;Data Deletion Request,&rdquo;
              including:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-ink-muted leading-relaxed">
              <li>
                The business name associated with your SparkBooks account
              </li>
              <li>The WhatsApp number registered to your account</li>
              <li>The email address used to sign in</li>
            </ul>
          </div>

          <p className="text-ink-muted leading-relaxed mt-3">
            We will verify your identity before processing the request to
            protect against unauthorized deletion attempts.
          </p>
        </section>

        {/* Processing Time */}
        <section>
          <h2 className="font-display text-xl text-ink mb-3">
            Processing Time
          </h2>
          <p className="text-ink-muted leading-relaxed">
            We will process verified deletion requests within{" "}
            <strong className="text-ink">30 days</strong>. You will receive a
            confirmation email once deletion is complete.
          </p>
        </section>

        {/* Legal and Financial Record Exceptions */}
        <section>
          <h2 className="font-display text-xl text-ink mb-3">
            Legal and Financial Record Exceptions
          </h2>
          <p className="text-ink-muted leading-relaxed">
            In limited cases, we may be required to retain certain transaction
            and billing records (such as payment history) for a legally mandated
            period, even after a deletion request, to comply with tax,
            accounting, or anti-fraud regulations. Where this applies, we will
            delete all data not subject to such requirements and inform you of
            what is retained and why.
          </p>
        </section>

        {/* Deletion via Meta / WhatsApp */}
        <section>
          <h2 className="font-display text-xl text-ink mb-3">
            Deletion via Meta / WhatsApp
          </h2>
          <p className="text-ink-muted leading-relaxed">
            If you wish to stop SparkBooks from receiving your WhatsApp messages
            without deleting your full account, you can simply stop messaging
            our SparkBooks WhatsApp number at any time. This will not
            automatically delete your existing stored data — for full deletion,
            please follow the request process above.
          </p>
        </section>

        {/* Contact Us */}
        <section>
          <h2 className="font-display text-xl text-ink mb-3">Contact Us</h2>
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
      </div>
    </section>
  );
}
