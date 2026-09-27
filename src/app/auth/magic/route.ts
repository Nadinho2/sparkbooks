import { NextRequest, NextResponse } from "next/server";
import { verifyAndConsumeMagicToken } from "@/lib/magic-auth-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(
      new URL("/sign-in?error=missing_token", request.url)
    );
  }

  const result = await verifyAndConsumeMagicToken(token);

  if (!result.success || !result.signInUrl) {
    const errorParam = encodeURIComponent(result.error || "invalid_token");
    return NextResponse.redirect(
      new URL(`/sign-in?error=${errorParam}`, request.url)
    );
  }

  return NextResponse.redirect(new URL(result.signInUrl, request.url));
}
