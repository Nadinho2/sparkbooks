import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getCurrentPartner } from "@/lib/partner-server";
import { isAdmin } from "@/lib/admin-auth";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  // Intercept partners and coordinators — they manage merchants and do not register stores
  const partner = await getCurrentPartner();
  if (partner) {
    redirect("/partner");
  }

  // Intercept super admins
  const admin = await isAdmin();
  if (admin) {
    redirect("/admin");
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center py-10 px-4">
      <div className="w-full max-w-lg">{children}</div>
    </div>
  );
}
