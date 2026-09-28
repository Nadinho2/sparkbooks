"use client";

import { Suspense, useState, useEffect } from "react";
import { SignIn, useClerk, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function SignInContent() {
  const searchParams = useSearchParams();
  const ticket = searchParams.get("__clerk_ticket");
  const isExpired = searchParams.get("expired") === "1";
  const errorFromQuery = searchParams.get("error");
  const redirectUrl = searchParams.get("redirect_url") || "/dashboard";

  const [ticketState, setTicketState] = useState<{
    status: "idle" | "verifying" | "success" | "error";
    errorMsg?: string;
  }>(() => ({
    status: ticket ? "verifying" : errorFromQuery ? "error" : "idle",
    errorMsg: errorFromQuery || undefined,
  }));

  const clerk = useClerk();
  const { isLoaded } = useAuth();

  useEffect(() => {
    if (!ticket) return;
    if (!isLoaded || !clerk.loaded || !clerk.client) return;

    let active = true;

    clerk.client.signIn
      .create({
        strategy: "ticket",
        ticket,
      })
      .then(async (res) => {
        if (!active) return;
        if (res.status === "complete" && res.createdSessionId) {
          setTicketState({ status: "success" });
          await clerk.setActive({
            session: res.createdSessionId,
            navigate: () => {
              window.location.href = redirectUrl;
            },
          });
          window.location.href = redirectUrl;
        } else {
          setTicketState({
            status: "error",
            errorMsg: "Login could not be completed automatically. Please sign in below.",
          });
        }
      })
      .catch(async (err: any) => {
        if (!active) return;
        const isSessionConflict = err.errors?.some((e: any) =>
          e.code === "session_exists" || e.code === "already_signed_in"
        );
        if (isSessionConflict) {
          try {
            await clerk.signOut();
            const retryRes = await clerk.client.signIn.create({ strategy: "ticket", ticket });
            if (retryRes.status === "complete" && retryRes.createdSessionId) {
              setTicketState({ status: "success" });
              await clerk.setActive({
                session: retryRes.createdSessionId,
                navigate: () => {
                  window.location.href = redirectUrl;
                },
              });
              window.location.href = redirectUrl;
              return;
            }
          } catch (retryErr) {
            console.error("Retry ticket authentication error:", retryErr);
          }
        }

        console.error("Clerk ticket authentication error:", err);
        setTicketState({
          status: "error",
          errorMsg: err.errors?.[0]?.longMessage || err.message || "Login link has expired or is invalid.",
        });
      });

    return () => {
      active = false;
    };
  }, [ticket, isLoaded, clerk, redirectUrl]);

  return (
    <>
      {isExpired && (
        <div className="mb-6 w-full max-w-md bg-amber-50 border border-amber-200 rounded-lg p-3.5 flex items-start gap-2.5 text-xs text-amber-900 shadow-xs">
          <span className="text-base leading-none">🔒</span>
          <div>
            <p className="font-semibold text-amber-900">Session Expired</p>
            <p className="text-amber-800 mt-0.5">
              You were automatically signed out after 12 hours of inactivity for your security. Please sign in again.
            </p>
          </div>
        </div>
      )}

      {/* Passwordless Ticket Verification in Progress */}
      {ticket && (ticketState.status === "verifying" || ticketState.status === "success") && (
        <div className="mb-6 w-full max-w-md bg-white border border-rule rounded-2xl p-8 text-center shadow-lg animate-in fade-in duration-200">
          <div className="w-12 h-12 border-3 border-forest border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <h3 className="font-display font-semibold text-ink text-lg">Logging you in...</h3>
          <p className="text-xs text-ink-muted mt-1.5 leading-relaxed">
            Verifying your secure passwordless link. No password required.
          </p>
        </div>
      )}

      {/* Error message if ticket failed, was used, or expired */}
      {ticketState.status === "error" && ticketState.errorMsg && (
        <div className="mb-6 w-full max-w-md bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 shadow-xs animate-in fade-in duration-200">
          <p className="font-semibold flex items-center gap-1.5 text-sm">
            <span>⚠️</span> Passwordless Login Notice
          </p>
          <p className="mt-1.5 text-amber-800 leading-relaxed">{ticketState.errorMsg}</p>
          <div className="mt-3 pt-3 border-t border-amber-200/60 flex items-center justify-between gap-2">
            <span className="text-[11px] text-amber-700">Need a fresh login link?</span>
            <a
              href="https://wa.me/2349132514101?text=LOGIN"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#25D366] hover:bg-[#20ba5a] text-white font-medium rounded-lg text-xs shadow-xs transition"
            >
              <span>📲</span> Text LOGIN on WhatsApp
            </a>
          </div>
        </div>
      )}

      {/* Standard Form only when not verifying ticket */}
      {ticketState.status !== "verifying" && ticketState.status !== "success" && (
        <>
          <SignIn
            signUpUrl="/sign-up"
            fallbackRedirectUrl="/dashboard"
          />
          <div className="mt-6 text-center text-xs text-ink-muted">
            Are you a Field Relationship Manager (BRM) or Coordinator?{" "}
            <Link href="/partner" className="text-forest font-semibold hover:underline">
              Go to Partner Portal ↗
            </Link>
          </div>
        </>
      )}
    </>
  );
}

export default function SignInPage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center py-16 px-4">
      <Suspense
        fallback={
          <div className="w-10 h-10 border-3 border-forest border-t-transparent rounded-full animate-spin my-8" />
        }
      >
        <SignInContent />
      </Suspense>
    </div>
  );
}

