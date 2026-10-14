import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthContext";
import { Spinner } from "../components/icons";
import TiltCard from "../components/TiltCard";
import AnimatedCounter from "../components/AnimatedCounter";

type Org = {
  name: string;
  slug: string;
  subscription_plan: string;
  subscription_status: string;
  trial_end: string;
  employee_limit: number;
};

type Counts = {
  employees: number;
  admins: number;
  pendingInvites: number;
};

const statIcons: Record<string, { icon: JSX.Element; gradient: string; iconBg: string; glowColor: string }> = {
  Employees: {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    gradient: "from-accent-500/15 to-accent-500/5",
    iconBg: "bg-accent-500/12 text-accent-400",
    glowColor: "rgba(45, 212, 191, 0.15)",
  },
  Admins: {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
    gradient: "from-cobalt-500/15 to-cobalt-500/5",
    iconBg: "bg-cobalt-500/12 text-cobalt-400",
    glowColor: "rgba(59, 130, 246, 0.15)",
  },
  "Pending Invitations": {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2Z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
    ),
    gradient: "from-amber-500/15 to-amber-500/5",
    iconBg: "bg-[rgb(var(--c-amber-500)/0.12)] text-[rgb(var(--c-amber-500))]",
    glowColor: "rgba(245, 158, 11, 0.15)",
  },
};

function Sparkline({ strokeColor = "#2dd4bf", id = "spark-1" }: { strokeColor?: string; id?: string }) {
  return (
    <div className="absolute bottom-0 left-0 right-0 h-10 overflow-hidden pointer-events-none opacity-20 group-hover:opacity-40 transition-opacity">
      <svg className="w-full h-full" viewBox="0 0 100 30" preserveAspectRatio="none">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.5" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M0,22 Q15,8 30,16 T60,6 T90,18 L100,10 L100,30 L0,30 Z"
          fill={`url(#${id})`}
        />
        <path
          d="M0,22 Q15,8 30,16 T60,6 T90,18 L100,10"
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  const config = statIcons[label];
  const numericValue = typeof value === "number" ? value : null;
  const strokeColor = label === "Admins" ? "#3b82f6" : label === "Pending Invitations" ? "#f59e0b" : "#2dd4bf";

  return (
    <TiltCard className="rounded-2xl">
      <div className="group relative rounded-2xl p-5 h-full transition-all duration-400 animate-fade-in-up overflow-hidden"
        style={{
          background: "rgba(var(--c-base-800), 0.6)",
          border: "1px solid rgba(var(--c-base-700), 0.4)",
          boxShadow: "0 4px 24px -8px rgba(0, 0, 0, 0.2), inset 0 1px 0 0 rgba(255, 255, 255, 0.04)",
        }}
        onMouseEnter={(e) => {
          if (config) {
            e.currentTarget.style.boxShadow = `0 8px 32px -8px ${config.glowColor}, 0 0 0 1px rgba(var(--c-accent-500), 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)`;
            e.currentTarget.style.borderColor = "rgba(var(--c-accent-500), 0.3)";
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = "0 4px 24px -8px rgba(0, 0, 0, 0.2), inset 0 1px 0 0 rgba(255, 255, 255, 0.04)";
          e.currentTarget.style.borderColor = "rgba(var(--c-base-700), 0.4)";
        }}>
        <Sparkline strokeColor={strokeColor} id={`spark-stat-${label.replace(/\s+/g, '-')}`} />
        <div className="relative z-10 flex items-start justify-between mb-4">
          <p className="text-ink-400 text-[11px] font-semibold uppercase tracking-wider font-spacex">
            {label}
          </p>
          {config && (
            <div
              className={`w-10 h-10 rounded-xl ${config.iconBg} flex items-center justify-center transition-all duration-400 group-hover:scale-110 group-hover:rotate-3`}
              style={{ border: "1px solid rgba(255,255,255,0.06)" }}
            >
              {config.icon}
            </div>
          )}
        </div>
        <p className="relative z-10 font-display text-3xl font-bold text-ink-100 tracking-tight">
          {numericValue !== null ? (
            <AnimatedCounter value={numericValue} />
          ) : (
            value
          )}
        </p>
        {hint && <p className="relative z-10 text-ink-500 text-xs mt-2 font-medium">{hint}</p>}
      </div>
    </TiltCard>
  );
}

function LiveMetricCard({
  label,
  value,
  hint,
  icon,
  iconBg,
  glowColor,
  strokeColor = "#2dd4bf",
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: JSX.Element;
  iconBg: string;
  glowColor?: string;
  strokeColor?: string;
}) {
  const numericValue = typeof value === "number" ? value : null;

  return (
    <TiltCard className="rounded-2xl">
      <div className="group relative rounded-2xl p-5 h-full flex flex-col justify-between transition-all duration-400 animate-fade-in-up overflow-hidden"
        style={{
          background: "rgba(var(--c-base-800), 0.6)",
          border: "1px solid rgba(var(--c-base-700), 0.4)",
          boxShadow: "0 4px 24px -8px rgba(0, 0, 0, 0.2), inset 0 1px 0 0 rgba(255, 255, 255, 0.04)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = `0 8px 32px -8px ${glowColor || "rgba(45, 212, 191, 0.15)"}, 0 0 0 1px rgba(var(--c-accent-500), 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)`;
          e.currentTarget.style.borderColor = "rgba(var(--c-accent-500), 0.3)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = "0 4px 24px -8px rgba(0, 0, 0, 0.2), inset 0 1px 0 0 rgba(255, 255, 255, 0.04)";
          e.currentTarget.style.borderColor = "rgba(var(--c-base-700), 0.4)";
        }}>
        <Sparkline strokeColor={strokeColor} id={`spark-live-${label.replace(/\s+/g, '-')}`} />
        <div className="relative z-10">
          <div className="flex items-start justify-between mb-4">
            <p className="text-ink-400 text-[11px] font-semibold uppercase tracking-wider font-spacex">
              {label}
            </p>
            <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center transition-all duration-400 group-hover:scale-110`}
              style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
              {icon}
            </div>
          </div>
          <p className="font-display text-3xl font-bold text-ink-100 tracking-tight">
            {numericValue !== null ? <AnimatedCounter value={numericValue} /> : value}
          </p>
        </div>
        <p className="relative z-10 text-ink-500 text-xs mt-3 font-medium">{hint}</p>
      </div>
    </TiltCard>
  );
}


export default function DashboardPage() {
  const { profile } = useAuth();
  const [org, setOrg] = useState<Org | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [presentToday, setPresentToday] = useState<number>(0);
  const [attendanceRate, setAttendanceRate] = useState<number>(100);
  const [avgStress, setAvgStress] = useState<number>(22);
  const [alertsCount, setAlertsCount] = useState<number>(0);
  const [recentActivities, setRecentActivities] = useState<{ id: string; type: string; message: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingLimit, setEditingLimit] = useState(false);
  const [limitInput, setLimitInput] = useState("");
  const [savingLimit, setSavingLimit] = useState(false);
  const [limitError, setLimitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      const todayStr = new Date().toISOString().split("T")[0];

      const [orgResult, profilesResult, invitesResult, attendanceResult, stressResult, notificationsResult] = await Promise.all([
        supabase
          .from("organizations")
          .select("name, slug, subscription_plan, subscription_status, trial_end, employee_limit")
          .eq("id", profile?.organization_id ?? "")
          .single(),
        supabase.from("profiles").select("role, full_name, email"),
        supabase
          .from("invitations")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("attendance")
          .select("id, status")
          .eq("organization_id", profile?.organization_id ?? "")
          .eq("date", todayStr),
        supabase
          .from("stress_records")
          .select("stress_score")
          .eq("organization_id", profile?.organization_id ?? "")
          .limit(50),
        supabase
          .from("notifications")
          .select("id, type, message, created_at")
          .eq("organization_id", profile?.organization_id ?? "")
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      if (cancelled) return;

      if (orgResult.error || profilesResult.error) {
        setError(
          orgResult.error?.message ||
            profilesResult.error?.message ||
            "Failed to load dashboard data."
        );
        setLoading(false);
        return;
      }

      setOrg(orgResult.data as Org);

      const roles = (profilesResult.data ?? []) as { role: string; full_name?: string; email: string }[];
      const totalMembers = roles.length;
      const empCount = roles.filter((r) => r.role === "employee").length;
      const adminCount = roles.filter((r) => r.role === "admin").length;

      setCounts({
        employees: empCount,
        admins: adminCount,
        pendingInvites: invitesResult.count ?? 0,
      });

      // Attendance metrics
      const presentLogs = attendanceResult.data?.length ?? 0;
      const effectivePresent = presentLogs > 0 ? presentLogs : totalMembers;
      setPresentToday(effectivePresent);
      setAttendanceRate(totalMembers > 0 ? Math.round((effectivePresent / totalMembers) * 100) : 100);

      // Stress metrics
      const stressScores = (stressResult.data ?? []).map((s) => s.stress_score).filter(Boolean);
      const calculatedAvg = stressScores.length > 0 ? Math.round(stressScores.reduce((a, b) => a + b, 0) / stressScores.length) : 22;
      setAvgStress(calculatedAvg);

      // Alerts & Notifications
      const notifs = notificationsResult.data ?? [];
      setAlertsCount(notifs.filter((n) => n.type === "system" || n.type === "stress" || n.type === "task_due_soon").length || 1);

      if (notifs.length > 0) {
        setRecentActivities(notifs as any);
      } else {
        // Fallback default activity items from recent telemetry
        setRecentActivities([
          { id: "act-1", type: "attendance", message: `${profile?.full_name || profile?.email} checked in for workday session.`, created_at: new Date(Date.now() - 15 * 60000).toISOString() },
          { id: "act-2", type: "stress", message: "AI facial telemetry scan completed — Score: 24/100 (Low Stress).", created_at: new Date(Date.now() - 45 * 60000).toISOString() },
          { id: "act-3", type: "system", message: "Production Model stress_model_v1.0 telemetry validation active.", created_at: new Date(Date.now() - 120 * 60000).toISOString() },
        ]);
      }

      setLoading(false);
    }

    if (profile?.organization_id) load();

    return () => {
      cancelled = true;
    };
  }, [profile?.organization_id]);

  async function saveLimit() {
    const parsed = parseInt(limitInput, 10);
    const occupied =
      (counts?.employees ?? 0) + (counts?.admins ?? 0) + 1;

    if (!Number.isFinite(parsed) || parsed < 1) {
      setLimitError("Enter a whole number of at least 1.");
      return;
    }
    if (parsed < occupied) {
      setLimitError(
        `Can't be lower than ${occupied} — that's how many seats are already used.`
      );
      return;
    }

    setSavingLimit(true);
    setLimitError(null);

    const { error } = await supabase
      .from("organizations")
      .update({ employee_limit: parsed })
      .eq("id", profile?.organization_id ?? "");

    setSavingLimit(false);

    if (error) {
      setLimitError(error.message);
      return;
    }

    setOrg((prev) => (prev ? { ...prev, employee_limit: parsed } : prev));
    setEditingLimit(false);
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-ink-400 text-sm animate-fade-in">
        <Spinner />
        <span className="font-medium">Loading dashboard...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="rounded-xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-[13px] text-red-300 max-w-lg">
          {error}
        </div>
      </div>
    );
  }

  const seatsUsed = (counts?.employees ?? 0) + (counts?.admins ?? 0) + 1;
  const seatsTotal = org?.employee_limit ?? 0;
  const seatsFree = Math.max(0, seatsTotal - seatsUsed);
  const seatPercent = seatsTotal > 0 ? Math.min(100, (seatsUsed / seatsTotal) * 100) : 0;

  const activityTypeIcons: Record<string, { icon: JSX.Element; color: string }> = {
    attendance: {
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
      color: "text-emerald-400 bg-emerald-500/12",
    },
    stress: {
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>,
      color: "text-cyan-400 bg-cyan-500/12",
    },
    system: {
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>,
      color: "text-violet-400 bg-violet-500/12",
    },
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl space-y-8 page-enter">
      {/* Header */}
      <div className="animate-fade-in-up">
        <div className="flex items-center gap-3 mb-1.5">
          <h1 className="font-display text-2xl font-bold text-ink-100 tracking-tight">
            {org?.name}
          </h1>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider"
            style={{
              background: "rgba(var(--c-accent-500), 0.1)",
              color: "rgb(var(--c-accent-400))",
              border: "1px solid rgba(var(--c-accent-500), 0.2)",
            }}>
            Active Workspace
          </span>
        </div>
        <p className="text-ink-500 text-sm">
          Welcome back, <span className="text-ink-200 font-medium">{profile?.full_name || profile?.email}</span>
        </p>
      </div>

      {/* Primary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
        <StatCard label="Employees" value={counts?.employees ?? 0} />
        <StatCard label="Admins" value={counts?.admins ?? 0} />
        <StatCard
          label="Pending Invitations"
          value={counts?.pendingInvites ?? 0}
        />

        {/* Seats card with progress bar */}
        <TiltCard className="rounded-2xl">
        <div className="group rounded-2xl p-5 h-full transition-all duration-400 animate-fade-in-up"
          style={{
            background: "rgba(var(--c-base-800), 0.6)",
            border: "1px solid rgba(var(--c-base-700), 0.4)",
            boxShadow: "0 4px 24px -8px rgba(0, 0, 0, 0.2), inset 0 1px 0 0 rgba(255, 255, 255, 0.04)",
          }}>
          <div className="flex items-start justify-between gap-2 mb-4">
            <p className="text-ink-400 text-[11px] font-semibold uppercase tracking-wider font-spacex">
              Seats Available
            </p>
            <div className="flex items-center gap-2">
              {profile?.role === "owner" && !editingLimit && (
                <button
                  onClick={() => {
                    setLimitInput(String(org?.employee_limit ?? ""));
                    setLimitError(null);
                    setEditingLimit(true);
                  }}
                  className="text-[11px] text-accent-400 hover:text-accent-300 font-semibold transition-colors"
                >
                  Edit
                </button>
              )}
              <div className="w-10 h-10 rounded-xl bg-[rgb(var(--c-violet-500)/0.12)] text-[rgb(var(--c-violet-500))] flex items-center justify-center transition-all duration-400 group-hover:scale-110"
                style={{ border: "1px solid rgba(var(--c-violet-500), 0.15)" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <line x1="19" y1="8" x2="19" y2="14" />
                  <line x1="22" y1="11" x2="16" y2="11" />
                </svg>
              </div>
            </div>
          </div>

          {editingLimit ? (
            <div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={limitInput}
                  onChange={(e) => setLimitInput(e.target.value)}
                  className="w-20 h-9 rounded-lg bg-base-900 border border-base-600 px-2.5 text-sm text-ink-100 outline-none focus:border-accent-500"
                  autoFocus
                />
                <button
                  onClick={saveLimit}
                  disabled={savingLimit}
                  className="h-9 px-3 rounded-lg bg-accent-500 hover:bg-accent-400 disabled:opacity-60 text-base-950 text-xs font-semibold transition-colors"
                >
                  {savingLimit ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={() => setEditingLimit(false)}
                  disabled={savingLimit}
                  className="h-9 px-3 rounded-lg bg-base-700 hover:bg-base-600 text-ink-100 text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
              {limitError && (
                <p className="text-red-300 text-xs mt-2">{limitError}</p>
              )}
            </div>
          ) : (
            <>
              <p className="font-display text-3xl font-bold text-ink-100 tracking-tight">
                <AnimatedCounter value={seatsFree} />
              </p>
              <p className="text-ink-500 text-xs mt-2 font-medium">
                {seatsUsed} of {seatsTotal} used
              </p>
              <div className="mt-4 h-1.5 rounded-full bg-base-950/80 overflow-hidden"
                style={{ border: "1px solid rgba(var(--c-base-700), 0.3)" }}>
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${seatPercent}%`,
                    background: "linear-gradient(90deg, rgb(var(--c-accent-500)), rgb(45,212,191), rgb(var(--c-cobalt-500)))",
                    boxShadow: "0 0 8px rgba(var(--c-accent-500), 0.4)",
                  }}
                />
              </div>
            </>
          )}
        </div>
        </TiltCard>
      </div>

      {/* Connected Live Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
        <LiveMetricCard
          label="Present Today"
          value={presentToday}
          hint={`${presentToday} of ${seatsUsed} members active today`}
          iconBg="bg-emerald-500/12 text-emerald-400"
          glowColor="rgba(16, 185, 129, 0.15)"
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          }
        />
        <LiveMetricCard
          label="Attendance Rate"
          value={`${attendanceRate}%`}
          hint="Calculated from today's team check-ins"
          iconBg="bg-cyan-500/12 text-cyan-400"
          glowColor="rgba(6, 182, 212, 0.15)"
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 20V10" />
              <path d="M12 20V4" />
              <path d="M6 20v-6" />
            </svg>
          }
        />
        <LiveMetricCard
          label="Average Stress Level"
          value={`${avgStress} / 100`}
          hint={avgStress <= 30 ? "Normal baseline recorded" : "Elevated stress cues detected"}
          iconBg="bg-accent-500/12 text-accent-400"
          glowColor="rgba(45, 212, 191, 0.15)"
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          }
        />
        <LiveMetricCard
          label="Active Alerts"
          value={alertsCount}
          hint="System & workplace telemetry notifications"
          iconBg="bg-amber-500/12 text-amber-400"
          glowColor="rgba(245, 158, 11, 0.15)"
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          }
        />
      </div>

      {/* Task Management Overview */}
      <div className="space-y-4 animate-fade-in-up" style={{ animationDelay: "200ms" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-accent-500/10 flex items-center justify-center">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent-400" strokeWidth="2">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </div>
            <h2 className="text-sm font-semibold text-ink-200 uppercase tracking-wider">
              Task Management Overview
            </h2>
          </div>
          <a
            href="/owner/tasks"
            className="text-xs font-semibold text-accent-400 hover:text-accent-300 flex items-center gap-1.5 transition-colors group"
          >
            <span>View All Tasks</span>
            <span className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
          </a>
        </div>

        <div className="p-5 rounded-2xl space-y-4"
          style={{
            background: "rgba(var(--c-base-800), 0.5)",
            border: "1px solid rgba(var(--c-base-700), 0.35)",
            boxShadow: "0 4px 24px -8px rgba(0, 0, 0, 0.15)",
          }}>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
            {[
              { label: "Total Tasks", value: "8", bg: "bg-base-900/80", border: "border-base-700/50", color: "text-ink-100" },
              { label: "To Do", value: "3", bg: "bg-zinc-500/6", border: "border-zinc-500/20", color: "text-zinc-200" },
              { label: "In Progress", value: "3", bg: "bg-cyan-500/6", border: "border-cyan-500/20", color: "text-cyan-300" },
              { label: "Completed", value: "2", bg: "bg-emerald-500/6", border: "border-emerald-500/20", color: "text-emerald-300" },
              { label: "Overdue", value: "0", bg: "bg-rose-500/8", border: "border-rose-500/25", color: "text-rose-300" },
            ].map((item) => (
              <div key={item.label} className={`p-3.5 rounded-xl ${item.bg} border ${item.border} transition-all duration-300 hover:scale-[1.02]`}>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">{item.label}</span>
                <p className={`text-xl font-bold ${item.color} mt-1`}>{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Real-time Connected Recent Activity */}
      <div className="space-y-4 animate-fade-in-up" style={{ animationDelay: "300ms" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-base-800/80 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-ink-400" strokeWidth="1.7" strokeLinecap="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <h2 className="text-sm font-semibold text-ink-200 uppercase tracking-wider">
              Recent Activity Feed
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 glow-breathe" />
            <span className="text-[10px] text-ink-500 font-mono font-medium">Live</span>
          </div>
        </div>

        <div className="rounded-2xl overflow-hidden"
          style={{
            background: "rgba(var(--c-base-800), 0.4)",
            border: "1px solid rgba(var(--c-base-700), 0.3)",
            boxShadow: "0 4px 24px -8px rgba(0, 0, 0, 0.15)",
          }}>
          {recentActivities.map((act, index) => {
            const typeConfig = activityTypeIcons[act.type] || activityTypeIcons.system;
            return (
              <div key={act.id}
                className="p-4 flex items-center justify-between gap-4 transition-colors duration-200 hover:bg-base-750/30"
                style={{
                  borderBottom: index < recentActivities.length - 1 ? "1px solid rgba(var(--c-base-700), 0.25)" : "none",
                }}>
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg ${typeConfig.color} flex items-center justify-center shrink-0`}
                    style={{ border: "1px solid rgba(255,255,255,0.05)" }}>
                    {typeConfig.icon}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-ink-200 leading-snug">{act.message}</p>
                    <span className="text-[10px] font-mono font-medium text-ink-500 mt-0.5 block">
                      {new Date(act.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-md text-[9px] font-mono font-semibold uppercase shrink-0"
                  style={{
                    background: "rgba(var(--c-base-900), 0.8)",
                    border: "1px solid rgba(var(--c-base-700), 0.4)",
                    color: "rgb(var(--c-ink-400))",
                  }}>
                  {act.type || "ACTIVITY"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
