import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",                          // landing page
  "/sign-in(.*)",               // local sign-in page
  "/sign-up(.*)",               // local sign-up page
  "/onboarding",                // onboarding (auth checked at layout level)
  "/suspended",                 // suspended account page (auth checked at layout level)
  "/terms",                     // Terms of Service (public / Meta compliance)
  "/privacy",                   // Privacy Policy (public / Meta compliance)
  "/refund",                    // Refund Policy (public / Paystack compliance)
  "/deletion",                  // User Data Deletion Instructions (Meta compliance)
  "/receipt/(.*)",              // Customer Digital Receipts (public link for WhatsApp buyers)
  "/api/webhooks/(.*)",         // WhatsApp & Paystack webhooks (HMAC-verified)
  "/api/cron/(.*)",             // Cron jobs (bearer-token verified)
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (svg, png, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
