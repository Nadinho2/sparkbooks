export function Footer() {
  return (
    <footer className="w-full border-t border-rule py-8">
      <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <span className="font-display text-ink text-lg">SparkBooks</span>
        <p className="text-xs text-ink-muted">
          &copy; {new Date().getFullYear()} SparkBooks. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
