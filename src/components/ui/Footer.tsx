import Link from "next/link";

export function Footer() {
  return (
    <footer className="w-full border-t border-rule py-8">
      <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <span className="font-display text-ink text-lg">SparkBooks</span>
        <div className="flex items-center gap-4 text-xs text-ink-muted">
          <Link href="/partner" className="hover:text-ink transition-colors font-medium">
            Partner Portal
          </Link>
          <span>•</span>
          <p>
            &copy; {new Date().getFullYear()} SparkBooks. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
