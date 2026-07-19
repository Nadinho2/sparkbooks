import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center py-10 px-4">
      <div className="w-full max-w-lg">{children}</div>
    </div>
  );
}
