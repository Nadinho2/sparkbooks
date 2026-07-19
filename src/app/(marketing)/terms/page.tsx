import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service – SparkBooks",
  description:
    "Terms governing your access to and use of SparkBooks, a product of UltimaSpark Agency.",
};

export default function TermsPage() {
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
        Terms of Service
      </h1>

      <p className="text-sm text-ink-muted mb-12">
        Effective Date: July 18, 2026 &nbsp;&middot;&nbsp; Last Updated: July
        18, 2026
      </p>

      <p className="text-ink-muted leading-relaxed mb-10">
        These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and
        use of SparkBooks, a product of UltimaSpark Agency
        (&ldquo;UltimaSpark,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or
        &ldquo;our&rdquo;). By creating an account or using SparkBooks, you
        agree to these Terms. If you do not agree, do not use the Service.
      </p>

      <div className="space-y-10">
        <section>
          <h2 className="font-display text-xl text-ink mb-3">
            1. The Service
          </h2>
          <p className="text-ink-muted leading-relaxed">
            SparkBooks allows business owners to log sales, expenses, and
            inventory changes by sending WhatsApp messages, which are parsed
            into structured bookkeeping records using AI. The Service includes a
            web dashboard for reviewing and managing this data.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl text-ink mb-3">
            2. Eligibility and Account Registration
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-ink-muted leading-relaxed">
            <li>
              You must be at least 18 years old and legally able to enter into a
              binding contract to use SparkBooks.
            </li>
            <li>
              You are responsible for providing accurate business information
              during onboarding.
            </li>
            <li>
              You are responsible for maintaining the confidentiality of your
              account credentials and for all activity under your account.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-xl text-ink mb-3">
            3. Subscription Plans and Billing
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-ink-muted leading-relaxed">
            <li>
              SparkBooks offers Free, Starter, and Pro plans, each with
              different message and feature limits, as described on our pricing
              page.
            </li>
            <li>
              Paid subscriptions are billed on a recurring monthly basis through
              Paystack.
            </li>
            <li>
              By subscribing to a paid plan, you authorize us to charge your
              chosen payment method on a recurring basis until you cancel.
            </li>
            <li>
              Failure to complete payment may result in your account being
              marked past due, and continued failure may result in downgrade to
              the Free plan.
            </li>
            <li>
              See our{" "}
              <Link href="/refund" className="text-spark hover:underline">
                Refund Policy
              </Link>{" "}
              for details on cancellations and refunds.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-xl text-ink mb-3">
            4. Acceptable Use
          </h2>
          <p className="text-ink-muted leading-relaxed mb-3">
            You agree not to:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-ink-muted leading-relaxed">
            <li>
              Use SparkBooks for any unlawful purpose, including fraud, money
              laundering, or misrepresentation of financial records
            </li>
            <li>
              Attempt to circumvent plan limits, security measures, or access
              controls
            </li>
            <li>
              Send content through the Service that is abusive, harassing, or
              infringes on the rights of others
            </li>
            <li>
              Reverse engineer, resell, or white-label the Service without our
              written permission
            </li>
            <li>
              Use the Service to process data on behalf of a business you are
              not authorized to represent
            </li>
          </ul>
          <p className="text-ink-muted leading-relaxed mt-3">
            We reserve the right to suspend or terminate accounts that violate
            these Terms.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl text-ink mb-3">
            5. Accuracy of AI-Parsed Data
          </h2>
          <p className="text-ink-muted leading-relaxed mb-3">
            SparkBooks uses AI to interpret WhatsApp messages and voice notes
            into ledger entries. While we work to keep this accurate:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-ink-muted leading-relaxed">
            <li>
              AI parsing may occasionally misinterpret amounts, product names,
              or transaction types
            </li>
            <li>
              You are responsible for reviewing entries in your dashboard for
              accuracy
            </li>
            <li>
              SparkBooks is a bookkeeping aid, not a substitute for professional
              accounting or tax advice
            </li>
            <li>
              We are not liable for financial decisions made based on
              inaccurately parsed entries that were not reviewed or corrected by
              you
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-xl text-ink mb-3">
            6. Data Ownership
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-ink-muted leading-relaxed">
            <li>
              You retain ownership of all business data, product information,
              and financial records you input into SparkBooks.
            </li>
            <li>
              We do not claim ownership over your business data and will not use
              it for purposes beyond operating and improving the Service, as
              described in our Privacy Policy.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-xl text-ink mb-3">
            7. Service Availability
          </h2>
          <p className="text-ink-muted leading-relaxed">
            We aim to keep SparkBooks available and reliable but do not
            guarantee uninterrupted access. The Service may occasionally be
            unavailable due to maintenance, third-party outages (including
            WhatsApp, Supabase, or payment providers), or circumstances outside
            our control.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl text-ink mb-3">
            8. Limitation of Liability
          </h2>
          <p className="text-ink-muted leading-relaxed">
            To the fullest extent permitted by law, UltimaSpark Agency shall not
            be liable for indirect, incidental, or consequential damages arising
            from your use of SparkBooks, including lost profits, lost data, or
            business interruption, except where such liability cannot be
            excluded under applicable law.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl text-ink mb-3">
            9. Termination
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-ink-muted leading-relaxed">
            <li>
              You may cancel your account at any time through the Billing
              section of your dashboard.
            </li>
            <li>
              We may suspend or terminate accounts that violate these Terms,
              engage in fraudulent activity, or pose a security risk to the
              Service or other users.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-xl text-ink mb-3">
            10. Governing Law
          </h2>
          <p className="text-ink-muted leading-relaxed">
            These Terms are governed by the laws of the Federal Republic of
            Nigeria, without regard to conflict of law principles.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl text-ink mb-3">
            11. Changes to These Terms
          </h2>
          <p className="text-ink-muted leading-relaxed">
            We may update these Terms from time to time. Material changes will
            be communicated via the Service or by email. Continued use of
            SparkBooks after changes take effect constitutes acceptance of the
            updated Terms.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl text-ink mb-3">
            12. Contact Us
          </h2>
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
