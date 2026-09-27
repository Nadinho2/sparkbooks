"use client";

import { useState } from "react";
import {
  inviteTeamMember,
  removeTeamMember,
  updateMemberWhatsApp,
  type TeamMember,
} from "@/app/dashboard/team/actions";

interface TeamViewProps {
  members: TeamMember[];
  isOwner: boolean;
  businessName?: string;
}

export function TeamView({ members, isOwner, businessName = "Our Store" }: TeamViewProps) {
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentInvite, setRecentInvite] = useState<{
    email: string;
    inviteLink: string;
    emailSent: boolean;
    message: string;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [editingWhatsApp, setEditingWhatsApp] = useState<number | null>(null);
  const [whatsAppValue, setWhatsAppValue] = useState("");
  const [savingWhatsApp, setSavingWhatsApp] = useState(false);

  const active = members.filter((m) => m.status === "active");
  const pending = members.filter((m) => m.status === "pending");

  const baseUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_SITE_URL || "https://sparkbooks-jade.vercel.app";
  const defaultSignUpUrl = `${baseUrl}/sign-up`;

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setInviting(true);
    setError(null);
    try {
      const res = await inviteTeamMember(email.trim());
      setEmail("");
      setRecentInvite({
        email: res.invitedEmail,
        inviteLink: res.inviteLink,
        emailSent: res.emailSent,
        message: res.message,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setInviting(false);
    }
  }

  async function handleCopy(text: string, identifier: string) {
    if (typeof window !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      setCopiedLink(identifier);
      setTimeout(() => setCopiedLink(null), 3000);
    }
  }

  function getWhatsAppInviteUrl(memberEmail: string) {
    const text = encodeURIComponent(
      `Hello! You've been invited to join *${businessName}* on SparkBooks.\n\n` +
      `Click this link to create your account and access our store dashboard:\n${defaultSignUpUrl}\n\n` +
      `👉 *Important:* Please sign up using this email: *${memberEmail}*\n\n` +
      `Once you sign up, you will automatically share our store's books and WhatsApp logging.`
    );
    return `https://wa.me/?text=${text}`;
  }

  async function handleRemove(memberId: number) {
    setRemovingId(memberId);
    setError(null);
    try {
      await removeTeamMember(memberId);
      window.location.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRemovingId(null);
    }
  }

  function startEditWhatsApp(memberId: number, current: string | null) {
    setEditingWhatsApp(memberId);
    setWhatsAppValue(current ?? "");
  }

  async function handleSaveWhatsApp(memberId: number) {
    setSavingWhatsApp(true);
    setError(null);
    try {
      await updateMemberWhatsApp(memberId, whatsAppValue);
      setEditingWhatsApp(null);
      window.location.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingWhatsApp(false);
    }
  }

  return (
    <div>
      {error && (
        <div className="bg-flag-light border border-flag rounded-lg px-4 py-3 text-sm text-flag mb-5">
          {error}
        </div>
      )}

      {/* ── Recent Invite Alert Card ── */}
      {recentInvite && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6 shadow-xs">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-bold">
                ✓
              </span>
              <h3 className="text-sm font-bold text-emerald-900">
                Invitation Created for {recentInvite.email}
              </h3>
            </div>
            <button
              onClick={() => {
                setRecentInvite(null);
                window.location.reload();
              }}
              className="text-xs text-emerald-700 hover:text-emerald-900 font-semibold"
            >
              ✕ Close
            </button>
          </div>

          <p className="text-xs text-emerald-800 mt-1 mb-3">
            {recentInvite.emailSent ? (
              <span>Invitation email sent via Resend.</span>
            ) : (
              <span>
                <strong>Share this invite with your staff:</strong> Send the invitation link or WhatsApp message below so they can join your store right away.
              </span>
            )}
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-emerald-200/80">
            <button
              type="button"
              onClick={() => handleCopy(recentInvite.inviteLink, "recent")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-emerald-300 rounded-lg text-xs font-semibold text-emerald-900 hover:bg-emerald-100/50 transition-colors shadow-2xs"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              {copiedLink === "recent" ? "Link Copied! ✓" : "Copy Invite Link"}
            </button>

            <a
              href={getWhatsAppInviteUrl(recentInvite.email)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#25D366] text-white rounded-lg text-xs font-semibold hover:bg-[#20ba59] transition-colors shadow-2xs"
            >
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z" />
              </svg>
              Send on WhatsApp
            </a>
          </div>
        </div>
      )}

      {/* ── Active members ── */}
      {active.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-medium text-ink mb-3">
            Active Members ({active.length})
          </h2>
          <div className="divide-y divide-rule rounded-lg border border-rule bg-white">
            {active.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-spark/10 text-xs font-medium text-spark shrink-0">
                    {m.invitedEmail?.charAt(0).toUpperCase() ?? "?"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink truncate">{m.invitedEmail}</p>
                    <div className="flex items-center gap-2 text-xs text-ink-muted">
                      <span>{m.role}</span>
                      {editingWhatsApp === m.id ? (
                        <span className="flex items-center gap-1">
                          <input
                            type="text"
                            value={whatsAppValue}
                            onChange={(e) => setWhatsAppValue(e.target.value)}
                            placeholder="+234..."
                            className="w-32 h-6 rounded border border-rule px-1.5 text-xs"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveWhatsApp(m.id);
                              if (e.key === "Escape") setEditingWhatsApp(null);
                            }}
                          />
                          <button
                            onClick={() => handleSaveWhatsApp(m.id)}
                            disabled={savingWhatsApp}
                            className="text-spark font-medium disabled:opacity-50"
                          >
                            {savingWhatsApp ? "..." : "Save"}
                          </button>
                          <button
                            onClick={() => setEditingWhatsApp(null)}
                            className="text-ink-muted"
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <>
                          {m.whatsappNumber && (
                            <span className="text-ink-muted/70">
                              &middot; {m.whatsappNumber}
                            </span>
                          )}
                          {isOwner && (
                            <button
                              onClick={() =>
                                startEditWhatsApp(m.id, m.whatsappNumber)
                              }
                              className="text-spark hover:underline"
                            >
                              {m.whatsappNumber ? "Edit" : "+ Add WhatsApp"}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
                {isOwner && m.role !== "owner" && (
                  <button
                    onClick={() => handleRemove(m.id)}
                    disabled={removingId === m.id}
                    className="text-xs text-ink-muted hover:text-flag transition-colors disabled:opacity-50 shrink-0 ml-3"
                  >
                    {removingId === m.id ? "Removing..." : "Remove"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Pending invitations ── */}
      {pending.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-medium text-ink mb-3">
            Pending Invitations ({pending.length})
          </h2>
          <div className="divide-y divide-rule rounded-lg border border-rule bg-white">
            {pending.map((m) => {
              const inviteEmail = m.invitedEmail || "";
              return (
                <div
                  key={m.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between px-4 py-3.5 gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-rule text-xs font-medium text-ink-muted shrink-0">
                      {inviteEmail.charAt(0).toUpperCase() || "?"}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-ink">{inviteEmail}</p>
                      <p className="text-xs text-ink-muted">
                        Pending &mdash; will automatically join when signing in with this email
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-center ml-11 sm:ml-0">
                    <button
                      type="button"
                      onClick={() => handleCopy(defaultSignUpUrl, `pending-${m.id}`)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      {copiedLink === `pending-${m.id}` ? "Copied! ✓" : "Copy Link"}
                    </button>

                    <a
                      href={getWhatsAppInviteUrl(inviteEmail)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-xs font-medium transition-colors"
                    >
                      <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
                        <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z" />
                      </svg>
                      WhatsApp Invite
                    </a>

                    {isOwner && (
                      <button
                        onClick={() => handleRemove(m.id)}
                        disabled={removingId === m.id}
                        className="text-xs text-ink-muted hover:text-flag transition-colors disabled:opacity-50 ml-1 px-1.5 py-1"
                      >
                        {removingId === m.id ? "..." : "Cancel"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Invite form (owner only) ── */}
      {isOwner && (
        <form
          onSubmit={handleInvite}
          className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-start"
        >
          <div className="flex-1 sm:max-w-sm">
            <label
              htmlFor="invite-email"
              className="block text-xs font-medium text-ink-muted mb-1.5"
            >
              Invite by email
            </label>
            <input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="staff@example.com"
              required
              className="w-full h-10 rounded-lg border border-rule bg-white px-3 text-sm text-ink placeholder:text-ink-muted/50 focus:outline-none focus:ring-2 focus:ring-spark/30 focus:border-spark"
            />
            <p className="text-xs text-ink-muted/60 mt-1.5">
              They&apos;ll be connected as a team member when they sign in to SparkBooks with this email.
            </p>
          </div>
          <button
            type="submit"
            disabled={inviting || !email.trim()}
            className="sm:mt-[26px] inline-flex h-10 items-center justify-center rounded-lg bg-ink px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {inviting ? "Sending..." : "Send invite"}
          </button>
        </form>
      )}

      {!isOwner && active.length === 0 && pending.length === 0 && (
        <p className="text-sm text-ink-muted">No team members yet.</p>
      )}
    </div>
  );
}
