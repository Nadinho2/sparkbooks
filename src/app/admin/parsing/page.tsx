import { fetchParsingIssues } from "@/app/admin/actions";
import { AdminParsingView } from "@/components/admin/ParsingView";
import { BackButton } from "@/components/ui/BackButton";

export const metadata = {
  title: "Parsing Quality – Admin – SparkBooks",
};

export default async function AdminParsingPage() {
  const issues = await fetchParsingIssues();

  return (
    <div>
      <BackButton label="Tenants" className="mb-3" />
      <div className="mb-5">
        <h1 className="font-display text-xl text-ink">
          Parsing Quality
        </h1>
        <p className="text-xs text-ink-muted mt-0.5">
          Messages that failed or were unmatched — spot-check misparses and re-run
        </p>
      </div>

      <AdminParsingView issues={issues} />
    </div>
  );
}
