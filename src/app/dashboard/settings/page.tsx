import { auth, clerkClient } from "@clerk/nextjs/server";
import { getCurrentTenant } from "@/lib/tenant-server";
import { SettingsView } from "@/components/dashboard/SettingsView";

export const metadata = {
  title: "Settings – SparkBooks",
  description: "Manage your business profile and WhatsApp bookkeeping settings.",
};

export default async function SettingsPage() {
  const tenant = await getCurrentTenant();

  const { userId } = await auth();
  let email: string | null = null;
  if (userId) {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    email = user.emailAddresses[0]?.emailAddress ?? null;
  }

  return <SettingsView tenant={tenant} email={email} />;
}
