import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthContext";
import { Spinner } from "../components/icons";

type Row = {
  id: string;
  employee_id: string;
  activity_type: string;
  created_at: string;
  profiles?: { full_name: string | null; email: string } | null;
};

const labels: Record<string, string> = {
  checked_in: "Checked in",
  checked_out: "Checked out",
  joined_organization: "Joined the organization",
};

function label(type: string) {
  return labels[type] ?? type.replace(/_/g, " ");
}

function fmt(v: string) {
  return new Date(v).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ActivityPage() {
  const { profile } = useAuth();
  const isManager = profile?.role === "owner" || profile?.role === "admin" || profile?.role === "manager" || profile?.role === "hr";

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      const query = isManager
        ? supabase
            .from("employee_activity")
            .select("id, employee_id, activity_type, created_at, profiles(full_name, email)")
        : supabase
            .from("employee_activity")
            .select("id, employee_id, activity_type, created_at");

      const { data, error } = await query
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) setError(error.message);
      else setRows((data ?? []) as unknown as Row[]);
      setLoading(false);
    }
    load();
  }, [isManager]);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8 animate-fade-in-up">
      {/* Header */}
      <div>
        <h1 className="font-spacex text-xl lg:text-2xl font-bold text-ink-100 uppercase tracking-wider flex items-center gap-3">
          <span>ACTIVITY FEED</span>
          <span className="px-3 py-1 text-[10px] font-bold rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 uppercase tracking-widest">
            REALTIME LOGS
          </span>
        </h1>
        <p className="text-ink-400 text-xs mt-1.5 leading-relaxed">
          {isManager
            ? "Real-time activity audit trail across your organization."
            : "Your personal activity timeline."}
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 backdrop-blur-md p-4 text-xs text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="glass-card p-12 text-center flex items-center justify-center gap-3 text-ink-400 text-xs rounded-3xl">
          <Spinner />
          <span>Syncing activity telemetry...</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="glass-card p-12 text-center text-ink-400 text-xs rounded-3xl">
          No activity logs recorded yet.
        </div>
      ) : (
        <div className="glass-card p-6 lg:p-8 rounded-3xl space-y-3 shadow-2xl">
          <h2 className="text-xs font-bold text-ink-400 uppercase tracking-widest font-spacex mb-4">Audit Stream</h2>
          <div className="space-y-2.5">
            {rows.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between p-4 rounded-2xl bg-base-900/50 border border-white/5 hover:border-accent-500/30 hover:bg-base-800/60 transition-all duration-200"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(45,212,191,0.7)] shrink-0" />
                  <span className="text-ink-100 truncate text-xs font-medium">
                    {isManager && (
                      <span className="text-ink-200 font-semibold mr-1.5">
                        {r.profiles?.full_name || r.profiles?.email || "User"}
                        <span className="text-ink-500 font-normal"> — </span>
                      </span>
                    )}
                    {label(r.activity_type)}
                  </span>
                </div>
                <span className="text-ink-400 text-xs shrink-0 ml-4 font-mono font-medium">
                  {fmt(r.created_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

