import Link from "next/link";

export default function SuspendedPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="max-w-md">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-flag-light mb-4">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            className="text-flag"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
          </svg>
        </div>
        <h1 className="font-display text-2xl text-ink mb-2">
          Account Suspended
        </h1>
        <p className="text-ink-muted mb-6">
          Your SparkBooks account has been suspended. Please contact support for
          more information.
        </p>
        <Link
          href="/sign-in"
          className="inline-flex h-10 items-center justify-center rounded-full border border-rule px-6 text-sm text-ink-muted hover:text-ink transition-colors"
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
