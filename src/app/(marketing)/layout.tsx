import { Header } from "@/components/ui/Header";
import { Footer } from "@/components/ui/Footer";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 flex flex-col bg-paper">
      <Header />
      {children}
      <Footer />
    </div>
  );
}
