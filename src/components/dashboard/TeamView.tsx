"use client";

import { useState } from "react";
import { inviteTeamMember, removeTeamMember, updateMemberWhatsApp, type TeamMember } from "@/app/dashboard/team/actions";

export function TeamView({
  members,
  isOwner,
}: {
  members: TeamMember[];
  isOwner: boolean;
}) {
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [editingWhatsApp, setEditingWhatsApp] = useState<number | null>(null);
  const [whatsAppValue, setWhatsAppValue] = useState("");
  const [savingWhatsApp, setSavingWhatsApp] = useState(false);

  const active = members.filter((m) => m.status === "active");
  const pending = members.filter((m) => m.status === "pending");

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setInviting(true);
    setError(null);
    try {
      await inviteTeamMember(email.trim());
      setEmail("");
      window.location.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setInviting(false);
    }
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
            {pending.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-rule text-xs font-medium text-ink-muted">
                    {m.invitedEmail?.charAt(0).toUpperCase() ?? "?"}
                  </div>
                  <div>
                    <p className="text-sm text-ink">{m.invitedEmail}</p>
                    <p className="text-xs text-ink-muted">
                      Invitation sent &mdash; they&apos;ll be added when they sign in
                    </p>
                  </div>
                </div>
                {isOwner && (
                  <button
                    onClick={() => handleRemove(m.id)}
                    disabled={removingId === m.id}
                    className="text-xs text-ink-muted hover:text-flag transition-colors disabled:opacity-50"
                  >
                    {removingId === m.id ? "Cancelling..." : "Cancel"}
                  </button>
                )}
              </div>
            ))}
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
              They&apos;ll be added as a team member when they sign in to SparkBooks.
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
