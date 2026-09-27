import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Partner Dashboard | SparkBooks",
  description: "Field territory management and commission scoreboard for SparkBooks relationship managers.",
};

export default function PartnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="antialiased text-ink">{children}</div>;
}
