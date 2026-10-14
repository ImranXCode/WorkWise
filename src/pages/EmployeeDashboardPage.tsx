import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthContext";
import { Spinner } from "../components/icons";
import StressCheckModal from "../components/StressCheckModal";
import { checkStressCooldown, StressEventType } from "../lib/stressService";
import TiltCard from "../components/TiltCard";

type TodayAttendance = {
  check_in: string | null;
  check_out: string | null;
  attendance_type?: string | null;
  approval_status?: string | null;
} | null;

type ActivityRow = {
  id: string;
  activity_type: string;
  created_at: string;
};

const activityLabels: Record<string, string> = {
  checked_in: "Checked in",
  checked_out: "Checked out",
  joined_organization: "Joined the organization",
};

const activityIcons: Record<string, JSX.Element> = {
  checked_in: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  checked_out: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  joined_organization: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  ),
};

function fmtTime(v: string | null) {
  if (!v) return "—";
  return new Date(v).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function EmployeeDashboardPage() {
  const { profile, organization } = useAuth();

  const [today, setToday] = useState<TodayAttendance>(null);
  const [recentActivity, setRecentActivity] = useState<ActivityRow[]>([]);
  const [myTasksCount, setMyTasksCount] = useState<number>(0);
  const [completedTasksCount, setCompletedTasksCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Workplace Stress Check & Break State
  const [stressModalOpen, setStressModalOpen] = useState(false);
  const [stressEventType, setStressEventType] = useState<StressEventType>("LOGIN");
  const [onBreak, setOnBreak] = useState<boolean>(() => {
    return localStorage.getItem("nexora_on_break") === "true";
  });

  async function load() {
    setLoading(true);
    setError(null);

    const todayStr = new Date().toISOString().slice(0, 10);

    let attQuery = supabase
      .from("attendance")
      .select("check_in, check_out, attendance_type, approval_status")
      .eq("date", todayStr)
      .maybeSingle();

    const [attendanceResult, activityResult, tasksResult] = await Promise.all([
      attQuery.then(async (res) => {
        if (res.error && res.error.message.includes("attendance_type")) {
          return supabase
            .from("attendance")
            .select("check_in, check_out")
            .eq("date", todayStr)
            .maybeSingle();
        }
        return res;
      }),
      supabase
        .from("employee_activity")
        .select("id, activity_type, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
      organization && profile
        ? supabase
            .from("tasks")
            .select("id, status")
            .eq("organization_id", organization.id)
            .eq("assigned_to", profile.id)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (attendanceResult.error) {
      setError(attendanceResult.error.message);
    } else {
      setToday(attendanceResult.data as TodayAttendance);
    }

    if (!activityResult.error) {
      setRecentActivity((activityResult.data ?? []) as ActivityRow[]);
    }

    if (tasksResult && tasksResult.data) {
      setMyTasksCount(tasksResult.data.length);
      setCompletedTasksCount(tasksResult.data.filter((t: any) => t.status === "completed").length);
    }

    setLoading(false);
  }

  useEffect(() => {
    load();

    // Check LOGIN event trigger
    if (profile && sessionStorage.getItem("nexora_just_logged_in") === "true") {
      sessionStorage.removeItem("nexora_just_logged_in");
      const cooldown = checkStressCooldown(profile.id);
      if (!cooldown.inCooldown) {
        setStressEventType("LOGIN");
        setStressModalOpen(true);
      }
    }
  }, [profile, organization]);

  const handleToggleBreak = () => {
    if (!profile) return;
    const nextEventType: StressEventType = onBreak ? "BREAK_END" : "BREAK_START";
    const cooldown = checkStressCooldown(profile.id);

    if (cooldown.inCooldown) {
      const nextBreakState = !onBreak;
      setOnBreak(nextBreakState);
      localStorage.setItem("nexora_on_break", String(nextBreakState));
      return;
    }

    setStressEventType(nextEventType);
    setStressModalOpen(true);
  };

  const finalizeBreakToggle = () => {
    const nextBreakState = !onBreak;
    setOnBreak(nextBreakState);
    localStorage.setItem("nexora_on_break", String(nextBreakState));
    setStressModalOpen(false);
  };

  if (loading) {
    return (
      <div className="glass-card p-12 text-center flex items-center justify-center gap-3 text-ink-400 text-sm max-w-4xl mx-auto my-12 animate-fade-in">
        <Spinner />
        <span className="font-spacex font-medium">INITIALIZING WORKSTATION TELEMETRY...</span>
      </div>
    );
  }

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <div className="space-y-8 max-w-7xl mx-auto page-enter animate-fade-in p-6 lg:p-8">
      {/* SpaceX Style Mission Control Hero Header (2-Column Spacious Grid) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Col: Welcome Banner */}
        <div className="lg:col-span-2 relative glass-card p-7 lg:p-8 overflow-hidden rounded-3xl border border-cyan-500/20 shadow-2xl flex flex-col justify-between">
          {/* Background ambient radial light */}
          <div
            className="absolute -top-24 -right-24 w-96 h-96 rounded-full opacity-25 blur-3xl pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(45,212,191,0.8), transparent 70%)" }}
          />
          <div
            className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full opacity-20 blur-3xl pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(59,130,246,0.8), transparent 70%)" }}
          />

          <div className="relative z-10 space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="px-3.5 py-1.5 rounded-full text-[10px] font-spacex font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 tracking-widest uppercase flex items-center gap-2 shadow-[0_0_15px_rgba(45,212,191,0.25)]">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                WORKSTATION ONLINE
              </span>
              {organization && (
                <span className="px-3.5 py-1.5 rounded-full text-[10px] font-spacex font-bold bg-white/5 text-ink-300 border border-white/10 uppercase tracking-wider">
                  {organization.name}
                </span>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-cyan-400 text-xs font-spacex tracking-widest uppercase font-bold">{greeting}</p>
              <h1 className="font-spacex text-2xl lg:text-4xl font-black text-ink-100 tracking-wider uppercase"
                style={{ textShadow: "0 0 30px rgba(255,255,255,0.2)" }}>
                {profile?.full_name || profile?.email}
              </h1>
            </div>

            <p className="text-ink-400 text-xs lg:text-sm max-w-xl leading-relaxed">
              Welcome back to your AI-powered workplace telemetry suite. Monitor your tasks, check attendance, and track real-time wellbeing metrics in real time.
            </p>
          </div>

          <div className="relative z-10 pt-6 flex items-center gap-4 text-xs font-mono text-ink-400">
            <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
              Telemetry Active
            </span>
            <span>•</span>
            <span>AI Verified Profile</span>
          </div>
        </div>

        {/* Right Col: Today's Shift Telemetry Card */}
        <div className="glass-card p-6 lg:p-7 rounded-3xl border border-cyan-500/30 bg-base-950/40 shadow-2xl flex flex-col justify-between gap-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(45,212,191,0.25)]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div>
                <span className="text-[10px] font-spacex font-bold uppercase tracking-widest text-ink-400 block">
                  SHIFT TELEMETRY
                </span>
                <span className="text-xs font-mono font-bold text-ink-100">
                  {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </span>
              </div>
            </div>

            <span className={`w-3 h-3 rounded-full shadow-lg ${today?.check_in ? (today.check_out ? "bg-amber-400 shadow-amber-400/50" : "bg-emerald-400 shadow-emerald-400/50") : "bg-ink-500"}`} />
          </div>

          <div className="grid grid-cols-2 gap-3 p-4 rounded-2xl bg-white/[0.02] border border-white/5 text-center font-mono">
            <div>
              <span className="text-[10px] text-ink-400 uppercase block font-sans font-medium mb-1">Check In</span>
              <span className="text-sm font-bold text-cyan-300">{fmtTime(today?.check_in ?? null)}</span>
            </div>
            <div>
              <span className="text-[10px] text-ink-400 uppercase block font-sans font-medium mb-1">Check Out</span>
              <span className="text-sm font-bold text-ink-300">{fmtTime(today?.check_out ?? null)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              onClick={handleToggleBreak}
              className={`btn-glass h-11 text-xs font-spacex font-bold rounded-xl transition-all ${onBreak ? "bg-amber-500/20 text-amber-300 border-amber-500/40" : ""}`}
            >
              {onBreak ? "☕ END BREAK" : "☕ BREAK"}
            </button>

            <Link
              to="/employee/attendance"
              className="btn-glass-primary h-11 text-xs font-spacex font-bold rounded-xl text-center justify-center flex items-center gap-1.5"
            >
              {today?.check_in ? (today?.check_out ? "LOGS" : "LOG OUT") : "LOG IN"}
            </Link>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 backdrop-blur-md p-4 text-xs text-red-300 animate-scale-in">
          {error}
        </div>
      )}

      {/* KPI Stats Row (Spacious TiltCards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <TiltCard className="glass-card p-6 lg:p-7 rounded-3xl relative overflow-hidden group">
          <div className="flex items-center justify-between mb-4">
            <span className="font-spacex text-[10px] font-bold text-ink-400 uppercase tracking-widest">
              ASSIGNED TASKS
            </span>
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform shadow-[0_0_15px_rgba(45,212,191,0.2)]">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </div>
          </div>
          <div className="font-spacex text-3xl lg:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-teal-300 via-cyan-200 to-blue-400 mb-1.5">
            {myTasksCount}
          </div>
          <p className="text-xs text-ink-400 font-medium">Workplace deliverables</p>
        </TiltCard>

        <TiltCard className="glass-card p-6 lg:p-7 rounded-3xl relative overflow-hidden group">
          <div className="flex items-center justify-between mb-4">
            <span className="font-spacex text-[10px] font-bold text-ink-400 uppercase tracking-widest">
              COMPLETED TASKS
            </span>
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform shadow-[0_0_15px_rgba(52,211,153,0.2)]">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
          </div>
          <div className="font-spacex text-3xl lg:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 to-teal-400 mb-1.5">
            {completedTasksCount}
          </div>
          <p className="text-xs text-ink-400 font-medium">Finished requirements</p>
        </TiltCard>

        <TiltCard className="glass-card p-6 lg:p-7 rounded-3xl relative overflow-hidden group">
          <div className="flex items-center justify-between mb-4">
            <span className="font-spacex text-[10px] font-bold text-ink-400 uppercase tracking-widest">
              ATTENDANCE STATUS
            </span>
            <div className="w-12 h-12 rounded-2xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform shadow-[0_0_15px_rgba(59,130,246,0.2)]">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
          </div>
          <div className="font-spacex text-lg lg:text-xl font-bold text-ink-100 mb-1.5">
            {today?.check_in
              ? today.check_out
                ? "SHIFT DONE"
                : today.attendance_type === "WORK_FROM_HOME"
                ? "WORKING FROM HOME"
                : "LOGGED IN"
              : "NOT LOGGED IN"}
          </div>
          <p className="text-xs text-ink-400 font-medium">Daily clock telemetry</p>
        </TiltCard>

        <TiltCard className="glass-card p-6 lg:p-7 rounded-3xl relative overflow-hidden group">
          <div className="flex items-center justify-between mb-4">
            <span className="font-spacex text-[10px] font-bold text-ink-400 uppercase tracking-widest">
              BREAK TELEMETRY
            </span>
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform shadow-[0_0_15px_rgba(245,158,11,0.2)]">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
                <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
                <line x1="6" y1="1" x2="6" y2="4" />
                <line x1="10" y1="1" x2="10" y2="4" />
                <line x1="14" y1="1" x2="14" y2="4" />
              </svg>
            </div>
          </div>
          <div className="font-spacex text-lg lg:text-xl font-bold text-amber-300 mb-1.5">
            {onBreak ? "ON BREAK" : "ACTIVE WORK"}
          </div>
          <p className="text-xs text-ink-400 font-medium">Rest & stress tracking</p>
        </TiltCard>
      </div>

      {/* Quick Access Modules Navigation */}
      <div className="space-y-4">
        <h2 className="font-spacex text-sm font-bold text-ink-100 uppercase tracking-wider flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(45,212,191,0.6)]" />
          CORE WORKPLACE MODULES
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            {
              to: "/employee/tasks",
              title: "MY TASKS",
              desc: "View assigned deliverables, subtasks, & deadlines",
              color: "cyan",
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
              ),
            },
            {
              to: "/employee/attendance",
              title: "MY ATTENDANCE",
              desc: "Log daily shift clock-in, clock-out & view history",
              color: "emerald",
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              ),
            },
            {
              to: "/employee/activity",
              title: "MY ACTIVITY",
              desc: "Real-time audit log of your workplace actions",
              color: "blue",
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              ),
            },
            {
              to: "/employee/profile",
              title: "MY PROFILE",
              desc: "Update personal security, credentials & face ID",
              color: "purple",
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              ),
            },
          ].map((item) => (
            <Link key={item.to} to={item.to} className="block group">
              <TiltCard className="glass-card p-6 lg:p-7 rounded-3xl h-full border border-white/10 group-hover:border-cyan-400/50 transition-all duration-300 shadow-xl flex flex-col justify-between">
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-4 group-hover:scale-110 transition-transform shadow-[0_0_15px_rgba(45,212,191,0.2)]">
                    {item.icon}
                  </div>
                  <h3 className="font-spacex text-sm font-bold text-ink-100 group-hover:text-cyan-300 transition-colors uppercase tracking-wider mb-2">
                    {item.title}
                  </h3>
                  <p className="text-ink-400 text-xs leading-relaxed">{item.desc}</p>
                </div>
                <div className="pt-4 flex items-center gap-1.5 text-xs font-spacex font-bold text-cyan-400 group-hover:translate-x-1 transition-transform">
                  <span>LAUNCH</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </div>
              </TiltCard>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Activity Timeline Widget */}
      <div className="glass-card p-6 lg:p-8 rounded-3xl space-y-6 shadow-2xl">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(45,212,191,0.2)]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <div>
              <h2 className="font-spacex text-sm font-bold text-ink-100 uppercase tracking-wider">
                RECENT WORKSTATION EVENTS
              </h2>
              <p className="text-ink-400 text-xs mt-0.5">Live stream of your recent activity logs</p>
            </div>
          </div>

          <Link to="/employee/activity" className="btn-glass text-xs px-4 py-2 font-spacex font-bold rounded-xl">
            VIEW ALL
          </Link>
        </div>

        {recentActivity.length === 0 ? (
          <div className="p-10 text-center glass-card rounded-2xl space-y-3 bg-white/[0.01]">
            <div className="w-12 h-12 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mx-auto">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h3 className="font-spacex text-xs font-bold text-ink-200 uppercase tracking-wider">NO RECENT EVENTS RECORDED</h3>
            <p className="text-ink-400 text-xs max-w-sm mx-auto">Your check-in, check-out, and break telemetry will be automatically recorded here.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5 rounded-2xl overflow-hidden border border-white/5 bg-white/[0.02]">
            {recentActivity.map((a) => (
              <div key={a.id} className="p-4 flex items-center justify-between hover:bg-white/[0.04] transition-colors">
                <div className="flex items-center gap-3.5">
                  <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
                    {activityIcons[a.activity_type] || (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                      </svg>
                    )}
                  </div>
                  <span className="text-xs font-medium text-ink-100">
                    {activityLabels[a.activity_type] || a.activity_type}
                  </span>
                </div>
                <span className="text-xs font-mono text-ink-500">
                  {new Date(a.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Workplace Event Stress Check Consent Popup */}
      <StressCheckModal
        isOpen={stressModalOpen}
        eventType={stressEventType}
        onClose={() => setStressModalOpen(false)}
        onSkip={() => {
          if (stressEventType === "BREAK_START" || stressEventType === "BREAK_END") {
            finalizeBreakToggle();
          } else {
            setStressModalOpen(false);
          }
        }}
        onComplete={() => {
          if (stressEventType === "BREAK_START" || stressEventType === "BREAK_END") {
            finalizeBreakToggle();
          } else {
            setStressModalOpen(false);
          }
        }}
      />
    </div>
  );
}

