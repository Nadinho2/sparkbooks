import Link from "next/link";
import { getCurrentTenant, isTenantOwner } from "@/lib/tenant-server";
import { fetchTeamMembers } from "./actions";
import { TeamView } from "@/components/dashboard/TeamView";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Team – SparkBooks",
};

export default async function TeamPage() {
  const owner = await isTenantOwner();
  if (!owner) {
    redirect("/dashboard");
  }

  const tenant = await getCurrentTenant();
  const members = await fetchTeamMembers();

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-display text-xl text-ink">Team</h1>
        <p className="text-xs text-ink-muted mt-0.5">
          Invite your staff to share the same WhatsApp number and books
        </p>
      </div>

      {tenant.planTier !== "pro" ? (
        <div className="rounded-xl border border-rule bg-white p-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-spark/10 mx-auto mb-4">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              className="text-spark"
            >
              <path
                d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h2 className="font-display text-lg text-ink mb-2">
            Team access is a Pro feature
          </h2>
          <p className="text-sm text-ink-muted max-w-sm mx-auto mb-6">
            Upgrade to Pro to invite your sales staff, share your WhatsApp
            number, and keep everyone&apos;s books in sync.
          </p>
          <Link
            href="/dashboard/billing"
            className="inline-flex h-10 items-center rounded-lg bg-spark px-6 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Upgrade to Pro
          </Link>
        </div>
      ) : (
        <TeamView members={members} isOwner={owner} businessName={tenant.businessName} />
      )}
    </div>
  );
}
