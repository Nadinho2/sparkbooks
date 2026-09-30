import Link from "next/link";

export default function Home() {
  return (
    <>
      {/* ── Hero ── */}
      <section className="w-full max-w-6xl mx-auto px-6 pt-16 pb-24 sm:pt-24 sm:pb-32">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-rule px-4 py-1.5 text-sm text-ink-muted mb-8">
            <span className="flex h-2 w-2 rounded-full bg-money" />
            Built for sellers who run their business on WhatsApp
          </div>

          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl leading-[1.1] tracking-tight text-ink mb-6">
            Your books,
            <br />
            <span className="text-spark">on WhatsApp.</span>
          </h1>

          <p className="text-lg leading-relaxed text-ink-muted max-w-xl mb-10">
            Send sales, expenses, and stock updates as WhatsApp messages.
            SparkBooks parses them into clean ledgers, tracks inventory, and
            alerts you before you run out — no app, no typing.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/onboarding"
              className="inline-flex h-12 items-center justify-center rounded-full bg-ink px-8 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Start free — no card required
            </Link>
            <Link
              href="#how-it-works"
              className="inline-flex h-12 items-center justify-center rounded-full border border-rule px-8 text-sm font-medium text-ink transition-colors hover:bg-rule/30"
            >
              How it works
            </Link>
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section
        id="how-it-works"
        className="w-full border-t border-rule bg-white/40 py-20 sm:py-28"
      >
        <div className="max-w-6xl mx-auto px-6">
          <p className="text-xs font-medium tracking-widest uppercase text-ink-muted mb-4">
            How it works
          </p>
          <h2 className="font-display text-3xl sm:text-4xl tracking-tight text-ink mb-14">
            Three steps. That&apos;s it.
          </h2>

          <div className="grid gap-10 sm:grid-cols-3">
            {[
              {
                step: "01",
                title: "Send a WhatsApp message",
                body: "Text &ldquo;Sold 3 packs of Indomie for N4,500&rdquo; or record a voice note. Just like you&apos;re chatting with a friend.",
              },
              {
                step: "02",
                title: "SparkBooks parses it",
                body: "AI extracts the product, quantity, price, and category. It updates your ledger and adjusts stock automatically.",
              },
              {
                step: "03",
                title: "See your books",
                body: "Open your dashboard anytime — clean ledgers, stock levels, low-stock alerts, and weekly summaries. Zero spreadsheets.",
              },
            ].map((item) => (
              <div key={item.step}>
                <span className="font-mono text-xs text-spark tracking-widest">
                  {item.step}
                </span>
                <h3 className="font-display text-xl text-ink mt-3 mb-3">
                  {item.title}
                </h3>
                <p className="text-ink-muted leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="w-full border-t border-rule py-20 sm:py-28">
        <div className="max-w-6xl mx-auto px-6">
          <p className="text-xs font-medium tracking-widest uppercase text-ink-muted mb-4">
            Features
          </p>
          <h2 className="font-display text-3xl sm:text-4xl tracking-tight text-ink mb-14">
            Built for the way you sell.
          </h2>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: "📥",
                title: "Sales & expense tracking",
                body: "Every sale, every expense — captured from a single WhatsApp message. No forms, no dropdowns.",
              },
              {
                icon: "📦",
                title: "Live stock levels",
                body: "Inventory updates in real time as you sell. Know exactly what&apos;s left without counting.",
              },
              {
                icon: "🔔",
                title: "Low-stock alerts",
                body: "Get a WhatsApp alert before you run out of fast-moving stock. Set your own thresholds.",
              },
              {
                icon: "🎙️",
                title: "Voice notes",
                body: "Hands full? Record a voice note. SparkBooks transcribes and parses it just like text.",
              },
              {
                icon: "📊",
                title: "Weekly summaries",
                body: "A clean report of sales, top products, and stock changes — delivered to your WhatsApp every week.",
              },
              {
                icon: "\uD83D\uDD17",
                title: "Multi-user ready (Pro)",
                body: "Add your sales staff. Everyone sends to the same WhatsApp number, and books stay in sync.",
              },
            ].map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-rule bg-white p-6"
              >
                <span className="text-2xl">{f.icon}</span>
                <h3 className="font-medium text-ink mt-4 mb-2">{f.title}</h3>
                <p className="text-sm text-ink-muted leading-relaxed">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="w-full border-t border-rule bg-white/40 py-20 sm:py-28">
        <div className="max-w-6xl mx-auto px-6">
          <p className="text-xs font-medium tracking-widest uppercase text-ink-muted mb-4">
            Pricing
          </p>
          <h2 className="font-display text-3xl sm:text-4xl tracking-tight text-ink mb-14">
            Start free. Grow when ready.
          </h2>

          <div className="grid gap-6 sm:grid-cols-3">
            {[
              {
                name: "Free",
                price: "N0",
                period: "forever",
                desc: "For solo sellers getting started.",
                features: [
                  "30 messages / month",
                  "Up to 15 products",
                  "Voice note support",
                ],
                cta: "Start free",
                href: "/onboarding",
                highlight: false,
              },
              {
                name: "Starter",
                price: "₦4,999",
                period: "/ month",
                desc: "For growing shops with steady sales.",
                features: [
                  "200 messages / month",
                  "Unlimited products",
                  "CSV bulk upload",
                  "WhatsApp low-stock alerts",
                ],
                cta: "Start free trial",
                href: "/onboarding",
                highlight: true,
              },
              {
                name: "Pro",
                price: "₦9,999",
                period: "/ month",
                desc: "For busy shops with high volume.",
                features: [
                  "Unlimited messages",
                  "Unlimited products",
                  "CSV bulk upload",
                  "WhatsApp low-stock alerts",
                  "Multi-user access",
                  "Priority support",
                ],
                cta: "Start free trial",
                href: "/onboarding",
                highlight: false,
              },
            ].map((plan) => (
              <div
                key={plan.name}
                className={`rounded-2xl border p-6 flex flex-col ${
                  plan.highlight
                    ? "border-spark bg-white shadow-lg shadow-spark/10"
                    : "border-rule bg-white"
                }`}
              >
                {plan.highlight && (
                  <span className="self-start rounded-full bg-spark/10 px-3 py-1 text-xs font-medium text-spark mb-4">
                    Most popular
                  </span>
                )}
                <h3 className="font-display text-xl text-ink">{plan.name}</h3>
                <p className="text-sm text-ink-muted mt-1 mb-4">
                  {plan.desc}
                </p>

                <div className="mb-6">
                  <span className="font-display text-3xl text-ink">
                    {plan.price}
                  </span>
                  <span className="text-sm text-ink-muted">
                    {plan.period}
                  </span>
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-sm text-ink-muted"
                    >
                      <span className="mt-0.5 shrink-0 text-money">&#10003;</span>
                      {f}
                    </li>
                  ))}
                </ul>

                <Link
                  href={plan.href}
                  className={`inline-flex h-11 w-full items-center justify-center rounded-full text-sm font-medium transition-opacity ${
                    plan.highlight
                      ? "bg-spark text-white hover:opacity-90"
                      : "border border-ink text-ink hover:bg-ink/5"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer / Legal ── */}
      <footer className="w-full border-t border-rule py-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-ink-muted">
          <span>&copy; 2026 UltimaSpark Agency</span>
          <Link
            href="/privacy"
            className="hover:text-ink transition-colors"
          >
            Privacy
          </Link>
          <Link
            href="/terms"
            className="hover:text-ink transition-colors"
          >
            Terms
          </Link>
          <Link
            href="/refund"
            className="hover:text-ink transition-colors"
          >
            Refund Policy
          </Link>
          <Link
            href="/deletion"
            className="hover:text-ink transition-colors"
          >
            Data Deletion
          </Link>
        </div>

        <p className="mt-3 text-center text-sm text-ink-muted">
          Built by{" "}
          <a
            href="https://www.ultimaspark.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-ink transition-colors"
          >
            UltimaSpark Agency
          </a>{" "}
          — AI Automation for Sellers
        </p>
      </footer>
    </>
  );
}
