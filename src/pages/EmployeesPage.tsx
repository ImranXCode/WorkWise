import { FormEvent, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthContext";
import { Spinner } from "../components/icons";

import { UserRole } from "../lib/AuthContext";

type Member = {
  id: string;
  full_name: string | null;
  email: string;
  role: UserRole;
  department: string | null;
  designation: string | null;
  employee_code: string | null;
  created_at: string;
};

type Invite = {
  id: string;
  email: string;
  role: string;
  status: string;
  token: string;
  employee_code: string | null;
  expires_at: string;
  created_at: string;
};

const roleStyles: Record<UserRole, string> = {
  owner: "bg-accent-500/20 text-accent-400 border border-accent-500/40 font-bold",
  admin: "bg-cobalt-500/20 text-cobalt-300 border border-cobalt-500/40 font-bold",
  manager: "bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold",
  hr: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold",
  employee: "bg-base-750 text-ink-200 border border-base-700 font-semibold",
};

function friendlyInviteError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("only an owner or admin")) {
    return "You don't have permission to invite people.";
  }
  if (m.includes("only an owner can invite an admin")) {
    return "Only the workspace owner can invite an admin.";
  }
  return message;
}

function friendlyRemoveError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("only an owner or admin can remove")) {
    return "You don't have permission to remove people.";
  }
  if (m.includes("owner can't be removed")) {
    return "The workspace owner can't be removed.";
  }
  if (m.includes("only the owner can remove an admin")) {
    return "Only the workspace owner can remove an admin.";
  }
  if (m.includes("not in your organization")) {
    return "That person is no longer in your organization.";
  }
  return message;
}

export default function EmployeesPage() {
  const { profile } = useAuth();
  const isOwner = profile?.role === "owner";
  const canInvite = profile?.role === "owner" || profile?.role === "admin" || profile?.role === "manager" || profile?.role === "hr";

  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("employee");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [lastInvitedEmail, setLastInvitedEmail] = useState<string | null>(null);
  const [lastInvitedRole, setLastInvitedRole] = useState<UserRole>("employee");
  const [lastInvitedToken, setLastInvitedToken] = useState<string | null>(null);
  const [copiedInviteText, setCopiedInviteText] = useState(false);
  const [copiedRowInviteId, setCopiedRowInviteId] = useState<string | null>(null);

  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removeSuccess, setRemoveSuccess] = useState<string | null>(null);

  const [cancelingInviteId, setCancelingInviteId] = useState<string | null>(
    null
  );

  async function loadAll() {
    setLoading(true);
    setLoadError(null);

    const { data: memberRows, error: memberError } = await supabase
      .from("profiles")
      .select(
        "id, full_name, email, role, department, designation, employee_code, created_at"
      )
      .order("created_at", { ascending: true });

    if (memberError) {
      setLoadError(memberError.message);
      setLoading(false);
      return;
    }
    setMembers((memberRows ?? []) as Member[]);

    const { data: inviteRows, error: inviteErr } = await supabase
      .from("invitations")
      .select("id, email, role, status, token, employee_code, expires_at, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    // Non-fatal: an admin/owner can still see the member list even if this fails.
    if (!inviteErr && inviteRows) {
      setInvites((inviteRows ?? []) as Invite[]);
      try {
        (inviteRows as any[]).forEach((inv) => {
          if (inv.employee_code && inv.token) {
            localStorage.setItem(`nexora_passcode_${inv.employee_code.toUpperCase()}`, inv.token);
          }
        });
      } catch (e) {
        console.warn("localStorage invite cache notice:", e);
      }
    }

    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getInviteEmailDetails(
    targetEmail: string,
    targetRole: string,
    code: string | null,
    inviteToken: string | null
  ) {
    const senderName = profile?.full_name || profile?.email || "Workspace Admin";
    const joinUrl = inviteToken
      ? `${window.location.origin}/accept-invite?token=${inviteToken}`
      : `${window.location.origin}/accept-invite`;

    const subject = `Invitation to join company workspace on Workwise`;
    const body =
      `Hello,\n\n` +
      `You have been invited by ${senderName} (${profile?.email || ""}) to join our company workspace on the Workwise AI Platform as a ${targetRole} for account ${targetEmail}.\n\n` +
      `Your Access Credentials:\n` +
      (code ? `• Employee Passcode: ${code}\n` : "") +
      `• Direct Join URL: ${joinUrl}\n\n` +
      `To accept this invitation and activate your employee account:\n` +
      `1. Open the direct link: ${joinUrl}\n` +
      `2. Or visit ${window.location.origin}/accept-invite and enter your employee passcode (${code || "provided code"}).\n\n` +
      `Best regards,\n` +
      `${senderName}`;

    return { subject, body, joinUrl };
  }

  function sendEmailDispatch(
    targetEmail: string,
    targetRole: string,
    code: string | null,
    inviteToken: string | null,
    method: "gmail" | "mailto" = "gmail"
  ) {
    const { subject, body } = getInviteEmailDetails(targetEmail, targetRole, code, inviteToken);

    if (method === "gmail") {
      const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
        targetEmail
      )}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

      window.open(gmailUrl, "_blank", "noopener,noreferrer");
    } else {
      const mailtoUrl = `mailto:${encodeURIComponent(targetEmail)}?subject=${encodeURIComponent(
        subject
      )}&body=${encodeURIComponent(body)}`;

      window.open(mailtoUrl, "_self");
    }
  }

  async function copyInviteMessage(
    targetEmail: string,
    targetRole: string,
    code: string | null,
    inviteToken: string | null,
    rowId?: string
  ) {
    const { body } = getInviteEmailDetails(targetEmail, targetRole, code, inviteToken);
    try {
      await navigator.clipboard.writeText(body);
      if (rowId) {
        setCopiedRowInviteId(rowId);
        setTimeout(() => setCopiedRowInviteId(null), 2000);
      } else {
        setCopiedInviteText(true);
        setTimeout(() => setCopiedInviteText(false), 2000);
      }
    } catch {
      // Clipboard fallback
    }
  }

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    setInviteError(null);
    setInviteLink(null);
    setInviteCode(null);
    setCopied(false);

    const targetEmail = inviteEmail.trim();

    if (!targetEmail) {
      setInviteError("Enter an email address.");
      return;
    }

    setInviteLoading(true);
    const { data, error } = await supabase.rpc("invite_employee", {
      p_email: targetEmail,
      p_role: inviteRole,
    });
    setInviteLoading(false);

    if (error) {
      setInviteError(friendlyInviteError(error.message));
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    const createdToken = row?.token || null;
    const createdCode = row?.employee_code || null;

    setLastInvitedEmail(targetEmail);
    setLastInvitedRole(inviteRole);
    setLastInvitedToken(createdToken);

    if (createdToken) {
      setInviteLink(`${window.location.origin}/accept-invite?token=${createdToken}`);
    }
    if (createdCode) {
      setInviteCode(createdCode);
    }
    if (createdToken && createdCode) {
      try {
        localStorage.setItem(`nexora_passcode_${createdCode.toUpperCase()}`, createdToken);
      } catch (e) {
        console.warn("localStorage passcode cache notice:", e);
      }
    }

    // Automatically trigger email dispatch via Admin/Owner email client
    sendEmailDispatch(targetEmail, inviteRole, createdCode, createdToken, "gmail");

    setInviteEmail("");
    loadAll();
  }

  async function copyLink() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail in insecure contexts; the link is still
      // visible on screen for the user to copy manually.
    }
  }

  async function handleRemove() {
    if (!confirmRemoveId) return;
    const target = members.find((m) => m.id === confirmRemoveId);

    setRemoveError(null);
    setRemovingId(confirmRemoveId);

    const { error } = await supabase.rpc("remove_member", {
      p_profile_id: confirmRemoveId,
    });

    setRemovingId(null);

    if (error) {
      setRemoveError(friendlyRemoveError(error.message));
      return;
    }

    setConfirmRemoveId(null);
    setRemoveSuccess(
      `${target?.full_name || target?.email || "The employee"} was permanently removed from the organization.`
    );
    setTimeout(() => setRemoveSuccess(null), 5000);
    loadAll();
  }

  async function cancelInvite(inviteId: string) {
    setCancelingInviteId(inviteId);
    const { error } = await supabase
      .from("invitations")
      .update({ status: "cancelled" })
      .eq("id", inviteId);
    setCancelingInviteId(null);

    if (error) {
      setRemoveError(error.message);
      return;
    }
    loadAll();
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl animate-fade-in-up">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-display text-2.5xl font-extrabold text-ink-100 tracking-tight">
            Employees
          </h1>
          <p className="text-ink-400 text-sm mt-1 font-medium">
            Everyone in your organization, plus anyone you've invited who
            hasn't joined yet.
          </p>
        </div>
        <button
          onClick={() => {
            setInviteOpen((v) => !v);
            setInviteError(null);
            setInviteLink(null);
          }}
          className="h-10 px-5 rounded-xl bg-accent-500 hover:bg-accent-400 transition-all duration-200 text-base-950 text-xs font-bold shrink-0 shadow-glow hover:shadow-glow-lg"
        >
          {inviteOpen ? "Close" : "Invite employee"}
        </button>
      </div>

      {inviteOpen && (
        <div className="mb-8 rounded-2xl border border-base-750 bg-base-800 p-6 shadow-xl">
          <form onSubmit={handleInvite} className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[220px]">
              <label className="block text-xs font-bold uppercase tracking-wider text-ink-300 mb-1.5">
                Email address
              </label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="teammate@company.com"
                className="w-full h-10 rounded-xl bg-base-900 border border-base-700 px-3.5 text-sm text-ink-100 placeholder:text-ink-500 outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500/40 transition-colors"
              />
            </div>

            {canInvite && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-ink-300 mb-1.5">
                  Role
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) =>
                    setInviteRole(e.target.value as UserRole)
                  }
                  className="h-10 rounded-xl bg-base-900 border border-base-700 px-3.5 text-sm text-ink-100 outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500/40 transition-colors"
                >
                  <option value="employee">Employee</option>
                  <option value="manager">Manager</option>
                  <option value="hr">HR Specialist</option>
                  {profile?.role === "owner" && <option value="admin">Admin</option>}
                </select>
              </div>
            )}

            <button
              type="submit"
              disabled={inviteLoading}
              className="h-10 px-5 rounded-xl bg-accent-500 hover:bg-accent-400 disabled:opacity-60 disabled:cursor-not-allowed transition-colors text-base-950 text-xs font-bold flex items-center gap-2"
            >
              {inviteLoading ? (
                <>
                  <Spinner />
                  Sending…
                </>
              ) : (
                "Send invite"
              )}
            </button>
          </form>

          {inviteError && (
            <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-[13px] text-red-300">
              {inviteError}
            </div>
          )}

          {inviteLink && (
            <div className="mt-4 p-5 rounded-2xl bg-base-900/90 border border-accent-500/40 shadow-2xl space-y-4 animate-fade-in-up gradient-border">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-base-750">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <h4 className="text-xs font-bold text-ink-100 uppercase tracking-wider">
                    Workplace Access Passcode Created
                  </h4>
                  {lastInvitedEmail && (
                    <span className="text-[11px] font-mono text-accent-400 bg-accent-500/10 px-2 py-0.5 rounded-md border border-accent-500/20">
                      for {lastInvitedEmail}
                    </span>
                  )}
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-accent-500/15 text-accent-400 border border-accent-500/30">
                  Status: Active (Valid 7 Days)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 6-Digit / Employee Passcode Box */}
                <div className="p-3.5 rounded-xl bg-base-950 border border-base-750 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-semibold text-ink-400 uppercase tracking-wide">
                      Employee Passcode
                    </span>
                    <p className="font-mono text-lg font-bold text-accent-400 mt-0.5 tracking-wider">
                      {inviteCode || "—"}
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      if (inviteCode) {
                        await navigator.clipboard.writeText(inviteCode);
                        setCopiedCode(true);
                        setTimeout(() => setCopiedCode(false), 2000);
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-accent-500/20 hover:bg-accent-500/30 text-accent-300 text-xs font-semibold transition-colors flex items-center gap-1.5"
                  >
                    {copiedCode ? "✓ Copied" : "Copy Code"}
                  </button>
                </div>

                {/* Direct Link Box */}
                <div className="p-3.5 rounded-xl bg-base-950 border border-base-750 flex items-center justify-between">
                  <div className="truncate mr-2">
                    <span className="text-[10px] font-semibold text-ink-400 uppercase tracking-wide">
                      Direct Join Link
                    </span>
                    <p className="font-mono text-xs text-ink-200 truncate mt-1">{inviteLink}</p>
                  </div>
                  <button
                    onClick={copyLink}
                    className="px-3 py-1.5 rounded-lg bg-base-800 hover:bg-base-750 text-ink-100 text-xs font-semibold transition-colors shrink-0"
                  >
                    {copied ? "✓ Copied" : "Copy Link"}
                  </button>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-base-950/70 border border-base-750/70 text-xs text-ink-300 space-y-2">
                <div className="flex items-center gap-1.5 text-ink-200 font-medium">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-400 shrink-0">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  <span>How to deliver this invitation:</span>
                </div>
                <p className="text-[11px] text-ink-400 leading-relaxed">
                  A Gmail draft was opened in a new tab. <strong>Make sure to click &quot;Send&quot; inside Gmail</strong> to dispatch the email. You can also re-open Gmail, use your computer&apos;s default email client, or copy the full invite message to send via Slack/WhatsApp:
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    onClick={() => {
                      if (lastInvitedEmail) {
                        sendEmailDispatch(lastInvitedEmail, lastInvitedRole, inviteCode, lastInvitedToken, "gmail");
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 text-xs font-semibold transition-colors flex items-center gap-1.5"
                  >
                    ✉ Open in Gmail
                  </button>
                  <button
                    onClick={() => {
                      if (lastInvitedEmail) {
                        sendEmailDispatch(lastInvitedEmail, lastInvitedRole, inviteCode, lastInvitedToken, "mailto");
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-300 text-xs font-semibold transition-colors flex items-center gap-1.5"
                  >
                    📬 Default Email App
                  </button>
                  <button
                    onClick={() => {
                      if (lastInvitedEmail) {
                        copyInviteMessage(lastInvitedEmail, lastInvitedRole, inviteCode, lastInvitedToken);
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-accent-500/20 hover:bg-accent-500/30 border border-accent-500/35 text-accent-300 text-xs font-semibold transition-colors flex items-center gap-1.5"
                  >
                    {copiedInviteText ? "✓ Copied Email Message!" : "📋 Copy Full Invite Text"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {removeError && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-[13px] text-red-300">
          {removeError}
        </div>
      )}

      {removeSuccess && (
        <div className="mb-4 rounded-lg border border-accent-500/30 bg-accent-500/10 px-3.5 py-2.5 text-[13px] text-accent-400">
          {removeSuccess}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-ink-300 text-sm">
          <Spinner />
          Loading…
        </div>
      ) : loadError ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-[13px] text-red-300">
          {loadError}
        </div>
      ) : (
        <>
          <div className="rounded-3xl glass-card p-6 lg:p-8 border border-white/10 overflow-hidden mb-8 shadow-2xl space-y-4">
            <h2 className="text-xs font-bold text-ink-400 uppercase tracking-widest font-spacex">Active Team Roster</h2>
            <div className="overflow-x-auto rounded-2xl border border-white/5">
              <table className="w-full text-left text-xs text-ink-200">
                <thead className="bg-base-900/90 text-ink-400 font-semibold uppercase text-[10px] tracking-wider border-b border-white/5 font-spacex">
                  <tr>
                    <th className="px-5 py-3.5">Employee ID</th>
                    <th className="px-5 py-3.5">Name</th>
                    <th className="px-5 py-3.5">Email</th>
                    <th className="px-5 py-3.5">Role</th>
                    <th className="px-5 py-3.5">Department</th>
                    <th className="px-5 py-3.5">Designation</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {members.map((m) => {
                    const isSelf = m.id === profile?.id;
                    const canRemove =
                      !isSelf &&
                      m.role !== "owner" &&
                      (isOwner || m.role === "employee");

                    return (
                      <tr key={m.id} className="hover:bg-base-800/40 transition-colors">
                        <td className="px-5 py-3.5 text-ink-200 font-mono text-xs">
                          {m.employee_code || "—"}
                        </td>
                        <td className="px-5 py-3.5 font-semibold text-ink-100">
                          {m.full_name || "—"}
                        </td>
                        <td className="px-5 py-3.5 text-ink-300 font-mono">{m.email}</td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${roleStyles[m.role]}`}
                          >
                            {m.role}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-ink-300">
                          {m.department || "—"}
                        </td>
                        <td className="px-5 py-3.5 text-ink-300">
                          {m.designation || "—"}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {canRemove ? (
                            <button
                              onClick={() => {
                                setRemoveError(null);
                                setConfirmRemoveId(m.id);
                              }}
                              className="h-7 px-3 rounded-lg bg-rose-500/15 border border-rose-500/30 hover:bg-rose-500/25 text-rose-300 text-xs font-semibold transition-colors"
                            >
                              Remove
                            </button>
                          ) : (
                            <span className="text-ink-500 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {members.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-5 py-8 text-center text-ink-500"
                      >
                        No members found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {invites.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xs font-bold text-ink-400 uppercase tracking-widest font-spacex">
                Pending Invitations ({invites.length})
              </h2>
              <div className="rounded-3xl glass-card p-6 lg:p-8 border border-white/10 overflow-hidden shadow-2xl">
                <div className="overflow-x-auto rounded-2xl border border-white/5">
                  <table className="w-full text-left text-xs text-ink-200">
                    <thead className="bg-base-900/90 text-ink-400 font-semibold uppercase text-[10px] tracking-wider border-b border-white/5 font-spacex">
                      <tr>
                        <th className="px-5 py-3.5">Employee ID</th>
                        <th className="px-5 py-3.5">Email</th>
                        <th className="px-5 py-3.5">Role</th>
                        <th className="px-5 py-3.5">Expires</th>
                        <th className="px-5 py-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {invites.map((inv) => (
                        <tr key={inv.id} className="hover:bg-base-800/40 transition-colors">
                          <td className="px-5 py-3.5 text-ink-200 font-mono text-xs">
                            {inv.employee_code || "—"}
                          </td>
                          <td className="px-5 py-3.5 font-mono text-ink-200">{inv.email}</td>
                          <td className="px-5 py-3.5 capitalize">
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 uppercase tracking-wider">
                              {inv.role}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-ink-300 font-mono">
                            {new Date(inv.expires_at).toLocaleDateString()}
                          </td>
                          <td className="px-5 py-3.5 text-right flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => sendEmailDispatch(inv.email, inv.role, inv.employee_code, inv.token, "gmail")}
                              className="h-7 px-2.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 text-xs font-semibold transition-colors flex items-center gap-1 shrink-0"
                              title="Open compose window in Gmail"
                            >
                              ✉ Gmail
                            </button>
                            <button
                              onClick={() => copyInviteMessage(inv.email, inv.role, inv.employee_code, inv.token, inv.id)}
                              className="h-7 px-2.5 rounded-lg bg-accent-500/15 hover:bg-accent-500/25 border border-accent-500/30 text-accent-300 text-xs font-semibold transition-colors flex items-center gap-1 shrink-0"
                              title="Copy invitation message to clipboard"
                            >
                              {copiedRowInviteId === inv.id ? "✓ Copied" : "📋 Copy Msg"}
                            </button>
                            <button
                              onClick={() => cancelInvite(inv.id)}
                              disabled={cancelingInviteId === inv.id}
                              className="h-7 px-2.5 rounded-lg btn-glass text-ink-300 hover:text-rose-300 hover:border-rose-500/40 text-xs font-medium transition-colors disabled:opacity-60 shrink-0"
                            >
                              {cancelingInviteId === inv.id
                                ? "Cancelling…"
                                : "Cancel"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {confirmRemoveId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 glass-modal-backdrop">
          <div className="w-full max-w-sm rounded-3xl glass-modal-content p-6 shadow-2xl space-y-4">
            <h3 className="font-display text-lg font-bold text-ink-100">
              Remove Employee?
            </h3>
            <p className="text-ink-300 text-xs leading-relaxed">
              This action will permanently remove{" "}
              <strong className="text-ink-100 font-semibold">
                {members.find((m) => m.id === confirmRemoveId)?.full_name ||
                  members.find((m) => m.id === confirmRemoveId)?.email}
              </strong>{" "}
              from this organization.
            </p>

            {removeError && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-300">
                {removeError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setConfirmRemoveId(null)}
                disabled={removingId !== null}
                className="h-9 px-4 rounded-xl btn-glass text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleRemove}
                disabled={removingId !== null}
                className="h-9 px-4 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold transition-colors disabled:opacity-60 flex items-center gap-2"
              >
                {removingId !== null ? (
                  <>
                    <Spinner />
                    Removing…
                  </>
                ) : (
                  "Yes, Remove"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
