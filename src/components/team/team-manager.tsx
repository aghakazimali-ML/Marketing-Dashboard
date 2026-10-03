"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Copy, Eye, RefreshCw, UserRoundX, UserRoundCheck, X } from "lucide-react";
import { format } from "date-fns";
import { SectionCard } from "@/components/ui/section-card";
import { AuditLog } from "@/components/team/audit-log";
import { useEntitlements, useBrand } from "@/components/providers/entitlements-provider";
import { useConfirm } from "@/components/providers/confirm-provider";
import { EmptyState, TableSkeleton } from "@/components/ui/states";
import Link from "next/link";

type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "ANALYST";
  isActive: boolean;
  isOwner: boolean;
  createdAt: string;
};

type TeamInvite = {
  id: string;
  email: string;
  role: "ADMIN" | "ANALYST";
  createdBy: string;
  expiresAt: string;
};

export function TeamManager() {
  const DASHBOARD_NAME = useBrand();
  const { data: ent, reload: reloadEntitlements } = useEntitlements();
  const confirm = useConfirm();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"ADMIN" | "ANALYST">("ANALYST");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [teamResponse, inviteResponse] = await Promise.all([
        fetch("/api/auth/team"),
        fetch("/api/auth/invites"),
      ]);
      const [teamData, inviteData] = await Promise.all([
        teamResponse.json(),
        inviteResponse.json(),
      ]);
      if (!teamResponse.ok || !inviteResponse.ok) {
        throw new Error(teamData.error || inviteData.error || "Unable to load team.");
      }
      setMembers(teamData.members ?? []);
      setInvites(inviteData.invites ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load team.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function createInvite(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setCopied(false);
    try {
      const response = await fetch("/api/auth/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create invitation.");
      setInviteUrl(data.inviteUrl);
      setInviteMessage(data.emailMessage ?? (data.emailSent ? "Invitation email sent." : "Invitation created."));
      setEmail("");
      await load();
      void reloadEntitlements();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create invitation.");
    } finally {
      setSaving(false);
    }
  }

  async function updateMember(member: TeamMember, update: Partial<Pick<TeamMember, "role" | "isActive">>) {
    setError(null);
    if (update.isActive === false || update.role === "ANALYST") {
      const ok = await confirm({
        title: update.isActive === false ? `Disable ${member.email}?` : `Make ${member.email} an analyst?`,
        body: "They will be signed out everywhere immediately.",
        confirmLabel: update.isActive === false ? "Disable account" : "Change role",
        danger: update.isActive === false,
      });
      if (!ok) {
        await load();
        return;
      }
    }
    const response = await fetch("/api/auth/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: member.id, ...update }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Could not update account.");
      return;
    }
    await load();
    void reloadEntitlements();
  }

  async function revokeInvite(invite: TeamInvite) {
    const response = await fetch(`/api/auth/invites?id=${encodeURIComponent(invite.id)}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error || "Could not revoke invitation.");
      return;
    }
    await load();
  }

  async function copyInvite() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
  }

  return (
    <div className="space-y-6">
      <SectionCard title="Invite a teammate" subtitle="Invitations expire after seven days and can only be used once.">
        {ent && ent.plan.limits.seats !== null ? (
          <p className="mb-3 text-xs text-muted">
            {ent.usage.seats + ent.usage.pendingInvites} of {ent.plan.limits.seats} seats used on the {ent.plan.name} plan (including pending invitations).{" "}
            {ent.usage.seats + ent.usage.pendingInvites >= ent.plan.limits.seats ? <Link href="/billing" className="font-medium text-teal-600 underline">Upgrade for more</Link> : null}
          </p>
        ) : null}
        <form onSubmit={createInvite} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end">
          <label className="block text-sm">
            <span className="mb-1 block text-[11px] font-semibold text-muted uppercase">Email</span>
            <input
              type="email"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-md border border-line bg-surface px-3 py-2.5 text-sm text-ink"
              autoComplete="email"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[11px] font-semibold text-muted uppercase">Role</span>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as "ADMIN" | "ANALYST")}
              className="w-full rounded-md border border-line bg-surface px-3 py-2.5 text-sm text-ink"
            >
              <option value="ANALYST">Analyst</option>
              <option value="ADMIN">Administrator</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-teal-600 px-4 py-2.5 text-sm font-semibold text-on-accent hover:bg-teal-500 disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create invite"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => setShowEmailPreview((value) => !value)}
          className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-teal-700 hover:text-teal-600"
        >
          <Eye size={14} aria-hidden="true" />
          {showEmailPreview ? "Hide email preview" : "Preview invitation email"}
        </button>
        {showEmailPreview ? (
          <div className="mt-3 max-w-2xl rounded-md border border-line bg-sand-50 p-4 text-sm">
            <dl className="grid gap-2 sm:grid-cols-[5rem_1fr]">
              <dt className="text-xs font-semibold text-muted uppercase">To</dt>
              <dd>{email || "new teammate@example.com"}</dd>
              <dt className="text-xs font-semibold text-muted uppercase">CC</dt>
              <dd>Installation owner</dd>
              <dt className="text-xs font-semibold text-muted uppercase">Subject</dt>
              <dd>You are invited to {DASHBOARD_NAME}</dd>
            </dl>
            <div className="mt-4 border-t border-line pt-4 leading-relaxed text-muted">
              <p className="font-semibold text-ink">You are invited to {DASHBOARD_NAME}</p>
              <p className="mt-2">
                You have been invited as an {role === "ADMIN" ? "administrator" : "analyst"}.
              </p>
              <p className="mt-3 inline-block rounded-md bg-teal-600 px-4 py-2 font-semibold text-white">
                Accept invitation
              </p>
              <p className="mt-3 text-xs">This one-time link expires in seven days.</p>
            </div>
          </div>
        ) : null}
        {inviteUrl ? (
          <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4 sm:flex-row">
            <div className="min-w-0 flex-1">
              <p className="mb-2 text-xs text-muted">{inviteMessage}</p>
              <input
                aria-label="New invitation link"
                readOnly
                value={inviteUrl}
                className="w-full rounded-md border border-line bg-sand-50 px-3 py-2 text-xs"
              />
            </div>
            <button
              type="button"
              onClick={copyInvite}
              title="Copy invitation link"
              className="inline-flex items-center justify-center gap-2 self-end rounded-md border border-line px-3 py-2 text-sm hover:bg-sand-100"
            >
              <Copy size={15} aria-hidden="true" />
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        ) : null}
      </SectionCard>

      {error ? <p role="alert" className="text-sm text-down">{error}</p> : null}

      <SectionCard title="Team members">
        {loading ? (
          <TableSkeleton rows={3} />
        ) : members.length === 0 ? (
          <EmptyState title="No team accounts yet" body="Invite a teammate above." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="table-head text-left">
                <tr>
                  { ["Name", "Email", "Role", "Status", "Joined", ""].map((heading) => (
                    <th key={heading || "actions"} className="px-3 py-3 text-[11px] font-semibold text-muted uppercase">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id} className="border-t border-line/80">
                    <td className="px-3 py-3 font-medium">{member.name}{member.isOwner ? " · Owner" : ""}</td>
                    <td className="px-3 py-3 text-muted">{member.email}</td>
                    <td className="px-3 py-3">
                      {member.isOwner ? (
                        "Administrator"
                      ) : (
                        <select
                          aria-label={`Role for ${member.email}`}
                          value={member.role}
                          onChange={(event) => void updateMember(member, { role: event.target.value as "ADMIN" | "ANALYST" })}
                          className="rounded border border-line bg-surface px-2 py-1 text-xs text-ink"
                        >
                          <option value="ANALYST">Analyst</option>
                          <option value="ADMIN">Administrator</option>
                        </select>
                      )}
                    </td>
                    <td className="px-3 py-3">{member.isActive ? "Active" : "Disabled"}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-muted">{format(new Date(member.createdAt), "MMM d, yyyy")}</td>
                    <td className="px-3 py-3 text-right">
                      {!member.isOwner ? (
                        <button
                          type="button"
                          onClick={() => void updateMember(member, { isActive: !member.isActive })}
                          title={member.isActive ? "Disable account" : "Enable account"}
                          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-navy-700 hover:bg-sand-100"
                        >
                          {member.isActive ? <UserRoundX size={15} /> : <UserRoundCheck size={15} />}
                          {member.isActive ? "Disable" : "Enable"}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Pending invitations">
        {loading ? (
          <p className="text-sm text-muted">Loading invitations…</p>
        ) : invites.length === 0 ? (
          <p className="text-sm text-muted">No pending invitations.</p>
        ) : (
          <div className="divide-y divide-line/80">
            {invites.map((invite) => (
              <div key={invite.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{invite.email}</p>
                  <p className="text-xs text-muted">{invite.role === "ADMIN" ? "Administrator" : "Analyst"} · Expires {format(new Date(invite.expiresAt), "MMM d, yyyy")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void revokeInvite(invite)}
                  title={`Revoke invitation for ${invite.email}`}
                  className="inline-flex items-center gap-1.5 self-start rounded-md px-2 py-1 text-xs font-medium text-down hover:bg-down/5 sm:self-auto"
                >
                  <X size={14} aria-hidden="true" />
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
        <button type="button" onClick={() => void load()} className="mt-3 inline-flex items-center gap-2 text-xs text-muted hover:text-ink">
          <RefreshCw size={13} aria-hidden="true" /> Refresh
        </button>
      </SectionCard>
      <AuditLog />
    </div>
  );
}