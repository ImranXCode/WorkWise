import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { Spinner } from "../components/icons";

type AttendanceRow = {
  employee_id: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
  attendance_type?: string | null;
  profiles?: { full_name: string | null; email: string } | null;
};

type ActivityRow = { activity_type: string };

function isoDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((r) =>
      r
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(",")
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const [tab, setTab] = useState<"overview" | "trend" | "activity">(
    "overview"
  );

  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [employeeCount, setEmployeeCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      const since = isoDaysAgo(30);

      let attQuery = supabase
        .from("attendance")
        .select("employee_id, date, check_in, check_out, status, attendance_type, profiles!employee_id(full_name, email)")
        .gte("date", since)
        .order("date", { ascending: false });

      const [attRes, actRes, empRes] = await Promise.all([
        attQuery.then(async (res) => {
          if (res.error && (res.error.message.includes("attendance_type") || res.error.message.includes("relationship"))) {
            return supabase
              .from("attendance")
              .select("employee_id, date, check_in, check_out, status, profiles!employee_id(full_name, email)")
              .gte("date", since)
              .order("date", { ascending: false });
          }
          return res;
        }),
        supabase
          .from("employee_activity")
          .select("activity_type")
          .gte("created_at", since)
          .limit(1000),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
      ]);

      if (attRes.error) setError(attRes.error.message);
      else setAttendance((attRes.data ?? []) as unknown as AttendanceRow[]);

      if (!actRes.error) setActivity((actRes.data ?? []) as ActivityRow[]);
      if (typeof empRes.count === "number") setEmployeeCount(empRes.count);

      setLoading(false);
    }
    load();
  }, []);

  const todayStr = new Date().toISOString().slice(0, 10);
  const presentToday = useMemo(
    () => attendance.filter((r) => r.date === todayStr).length,
    [attendance, todayStr]
  );
  const attendanceRateToday = employeeCount
    ? Math.round((presentToday / employeeCount) * 100)
    : 0;

  const last14 = useMemo(() => {
    const days: { date: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = isoDaysAgo(i);
      days.push({
        date: d,
        count: attendance.filter((r) => r.date === d).length,
      });
    }
    return days;
  }, [attendance]);

  const maxDayCount = Math.max(1, ...last14.map((d) => d.count));

  const activityBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of activity) {
      counts[a.activity_type] = (counts[a.activity_type] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [activity]);
  const maxActivityCount = Math.max(1, ...activityBreakdown.map(([, c]) => c));

  function exportAttendanceCsv() {
    const rows = [
      ["Employee", "Email", "Date", "Attendance Type", "Check-in", "Check-out", "Status"],
      ...attendance.map((r) => [
        r.profiles?.full_name || "",
        r.profiles?.email || "",
        r.date,
        r.attendance_type === "WORK_FROM_HOME" ? "Work From Home" : "Workplace",
        r.check_in ? new Date(r.check_in).toLocaleTimeString() : "",
        r.check_out ? new Date(r.check_out).toLocaleTimeString() : "",
        r.status,
      ]),
    ];
    downloadCsv(`attendance-last-30-days-${todayStr}.csv`, rows);
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8 animate-fade-in-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-spacex text-xl lg:text-2xl font-bold text-ink-100 uppercase tracking-wider flex items-center gap-3">
            <span>REPORTS & ANALYTICS</span>
            <span className="px-3 py-1 text-[10px] font-bold rounded-full bg-accent-500/15 text-accent-400 border border-accent-500/30 uppercase tracking-widest font-spacex">
              30-DAY TELEMETRY
            </span>
          </h1>
          <p className="text-ink-400 text-xs mt-1.5 leading-relaxed">
            Historical attendance trends, employee metrics, and system activity logs.
          </p>
        </div>
        <button
          onClick={exportAttendanceCsv}
          disabled={loading || attendance.length === 0}
          className="btn-glass-primary h-10 px-4 rounded-xl text-xs font-bold disabled:opacity-40 shrink-0 flex items-center gap-2"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Export CSV Report
        </button>
      </div>

      {/* Pill Navigation Tabs */}
      <div className="flex items-center gap-2 p-1.5 rounded-xl bg-base-900 border border-base-750/50 w-fit">
        {(
          [
            ["overview", "Overview"],
            ["trend", "Attendance Trend"],
            ["activity", "Activity Breakdown"],
          ] as const
        ).map(([key, tabLabel]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
              tab === key
                ? "bg-accent-500 text-white shadow-md shadow-accent-500/20"
                : "text-ink-400 hover:text-ink-100 hover:bg-base-800"
            }`}
          >
            {tabLabel}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs font-medium text-rose-300 flex items-center gap-2">
          <span>⚠</span>
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-xs text-ink-400 flex items-center justify-center gap-2">
          <Spinner /> Loading telemetry reports...
        </div>
      ) : tab === "overview" ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl glass-card p-6 border border-base-750/50 space-y-2">
            <p className="text-[10px] font-bold text-ink-500 uppercase tracking-widest font-spacex">
              Total Employees
            </p>
            <p className="font-display text-4xl font-extrabold text-ink-100">
              {employeeCount}
            </p>
            <p className="text-[11px] text-ink-500">Registered organization members</p>
          </div>
          <div className="rounded-2xl glass-card p-6 border border-base-750/50 space-y-2">
            <p className="text-[10px] font-bold text-ink-500 uppercase tracking-widest font-spacex">
              Present Today
            </p>
            <p className="font-display text-4xl font-extrabold text-accent-400">
              {presentToday}
            </p>
            <p className="text-[11px] text-ink-400 font-semibold">
              {attendanceRateToday}% attendance rate
            </p>
          </div>
          <div className="rounded-2xl glass-card p-6 border border-base-750/50 space-y-2">
            <p className="text-[10px] font-bold text-ink-500 uppercase tracking-widest font-spacex">
              Activity Events (30d)
            </p>
            <p className="font-display text-4xl font-extrabold text-cobalt-400">
              {activity.length}
            </p>
            <p className="text-[11px] text-ink-500">Recorded workplace signals</p>
          </div>
        </div>
      ) : tab === "trend" ? (
        <div className="rounded-2xl glass-card p-6 border border-base-750/50 space-y-4">
          <h3 className="text-xs font-bold text-ink-400 uppercase tracking-widest font-spacex">14-Day Attendance Trend</h3>
          <div className="flex items-end gap-3 h-48 pt-6 pb-2">
            {last14.map((d) => (
              <div
                key={d.date}
                className="flex-1 flex flex-col items-center justify-end gap-2 group cursor-pointer"
                title={`${d.date}: ${d.count} present`}
              >
                <span className="text-ink-400 text-[10px] font-mono font-bold group-hover:text-accent-400 transition-colors">{d.count}</span>
                <div
                  className="w-full rounded-t-lg bg-gradient-to-t from-accent-500/40 to-cyan-400/80 group-hover:brightness-125 transition-all duration-300"
                  style={{
                    height: `${Math.max(6, (d.count / maxDayCount) * 100)}%`,
                    boxShadow: "0 0 12px rgba(45, 212, 191, 0.2)",
                  }}
                />
                <span className="text-ink-500 text-[10px] font-mono">
                  {d.date.slice(5)}
                </span>
              </div>
            ))}
          </div>
          {attendance.length === 0 && (
            <p className="text-ink-500 text-xs text-center py-4">
              No attendance records recorded in the last 30 days.
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-2xl glass-card p-6 border border-base-750/50 space-y-4">
          <h3 className="text-xs font-bold text-ink-400 uppercase tracking-widest font-spacex">Activity Type Breakdown</h3>
          {activityBreakdown.length === 0 ? (
            <p className="text-ink-500 text-xs text-center py-4">
              No activity records in the last 30 days.
            </p>
          ) : (
            <div className="space-y-3">
              {activityBreakdown.map(([type, count]) => (
                <div key={type} className="flex items-center gap-4">
                  <span className="text-ink-200 text-xs font-medium w-44 shrink-0 capitalize truncate font-mono">
                    {type.replace(/_/g, " ")}
                  </span>
                  <div className="flex-1 h-3 rounded-full bg-base-950 border border-base-750/60 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cobalt-500 to-accent-400 rounded-full transition-all duration-500"
                      style={{ width: `${(count / maxActivityCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-ink-400 text-xs font-bold font-mono w-10 text-right shrink-0">
                    {count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

