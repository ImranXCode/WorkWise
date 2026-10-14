import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthContext";
import { Spinner } from "../components/icons";
import FaceLivenessCapture, { type FaceLivenessResult } from "../components/FaceLivenessCapture";
import StressCheckModal from "../components/StressCheckModal";
import { checkStressCooldown } from "../lib/stressService";

type Row = {
  id: string;
  employee_id: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
  attendance_type?: "WORKPLACE" | "WORK_FROM_HOME" | null;
  approval_status?: "pending" | "approved" | "rejected" | null;
  wfh_reason?: string | null;
  face_verified: boolean | null;
  confidence: number | null;
  profiles?: { full_name: string | null; email: string; department?: string | null } | null;
};

function fmtTime(v: string | null) {
  if (!v) return "—";
  return new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function friendlyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("already checked in") || m.includes("already recorded attendance")) return "You've already recorded attendance for today.";
  if (m.includes("already checked out")) return "You've already checked out today.";
  if (m.includes("have not checked in")) return "Check in before checking out.";
  if (m.includes("outside geofence")) return "You're outside the office location required for check-in. Please try again once you're on-site.";
  if (m.includes("location is required")) return "Location access is required to check in. Please allow location permissions and try again.";
  if (m.includes("schema cache") || m.includes("could not find the function") || m.includes("does not exist")) {
    return "Database migration required: Please run 'supabase/wfh_attendance_migration.sql' in your Supabase SQL Editor to enable Work From Home.";
  }
  return message;
}

export default function AttendancePage() {
  const { profile } = useAuth();
  const isManager = profile?.role === "owner" || profile?.role === "admin" || profile?.role === "manager" || profile?.role === "hr";

  const [today, setToday] = useState<Row | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureMode, setCaptureMode] = useState<"in" | "out">("in");
  const [hasFaceProfile, setHasFaceProfile] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [geofenceStatus, setGeofenceStatus] = useState<string | null>(null);

  // WFH State
  const [wfhModalOpen, setWfhModalOpen] = useState(false);
  const [wfhReason, setWfhReason] = useState("");
  const [wfhSubmitting, setWfhSubmitting] = useState(false);
  const [wfhCancelling, setWfhCancelling] = useState(false);
  const [wfhActionBusy, setWfhActionBusy] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<"all" | "workplace" | "wfh">("all");

  async function load() {
    setLoading(true);
    setError(null);

    if (isManager) {
      // Disambiguate relationship using profiles!employee_id
      let { data, error: fetchErr } = await supabase
        .from("attendance")
        .select("id, employee_id, date, check_in, check_out, status, attendance_type, approval_status, wfh_reason, face_verified, confidence, profiles!employee_id(full_name, email, department)")
        .order("date", { ascending: false })
        .limit(200);

      // Fallback for pre-migration schema
      if (fetchErr && (fetchErr.message.includes("attendance_type") || fetchErr.message.includes("relationship"))) {
        const fallback = await supabase
          .from("attendance")
          .select("id, employee_id, date, check_in, check_out, status, face_verified, confidence, profiles!employee_id(full_name, email, department)")
          .order("date", { ascending: false })
          .limit(200);
        data = fallback.data as any;
        fetchErr = fallback.error;
      }

      if (fetchErr) setError(fetchErr.message);
      else setRows((data ?? []) as unknown as Row[]);
    } else {
      let { data, error: fetchErr } = await supabase
        .from("attendance")
        .select("id, employee_id, date, check_in, check_out, status, attendance_type, approval_status, wfh_reason, face_verified, confidence")
        .order("date", { ascending: false })
        .limit(30);

      // Fallback for pre-migration schema
      if (fetchErr && fetchErr.message.includes("attendance_type")) {
        const fallback = await supabase
          .from("attendance")
          .select("id, employee_id, date, check_in, check_out, status, face_verified, confidence")
          .order("date", { ascending: false })
          .limit(30);
        data = fallback.data as any;
        fetchErr = fallback.error;
      }

      if (fetchErr) {
        setError(fetchErr.message);
      } else {
        const list = (data ?? []) as Row[];
        setRows(list);
        const todayStr = new Date().toISOString().slice(0, 10);
        setToday(list.find((r) => r.date === todayStr) ?? null);
      }

      if (profile) {
        const { count } = await supabase
          .from("employee_face_descriptors")
          .select("id", { count: "exact", head: true })
          .eq("employee_id", profile.id);
        setHasFaceProfile((count ?? 0) > 0);
      }
    }

    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCapture(mode: "in" | "out") {
    setError(null);
    setCaptureMode(mode);
    setCaptureOpen(true);
  }

  async function getLocation(): Promise<{ lat: number; lon: number } | null> {
    if (!navigator.geolocation) return null;
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });
  }

  const [showAttendanceStressModal, setShowAttendanceStressModal] = useState(false);

  // Called once FaceLivenessCapture has confirmed the pose challenge, run the
  // spoof-model liveness check, and matched the face against this employee's
  // registered descriptors. From here: geofence check (server-side, via the
  // check_in RPC), then mark attendance.
  async function handleVerified({ faceVerified, confidence }: FaceLivenessResult) {
    setBusy(true);
    setError(null);
    setCaptureOpen(false);

    const rpc = captureMode === "in" ? "check_in" : "check_out";
    let args: Record<string, unknown> | undefined;

    if (captureMode === "in") {
      setGeofenceStatus("Checking your location…");
      const loc = await getLocation();
      args = {
        p_face_verified: faceVerified,
        p_confidence: confidence,
        p_location_verified: null,
        p_lat: loc?.lat ?? null,
        p_lon: loc?.lon ?? null,
      };
    }

    const { error: rpcError } = await supabase.rpc(rpc, args as never);
    setGeofenceStatus(null);
    setBusy(false);
    if (rpcError) {
      setError(friendlyError(rpcError.message));
    } else {
      load();
      if (profile) {
        const cooldown = checkStressCooldown(profile.id);
        if (!cooldown.inCooldown) {
          setShowAttendanceStressModal(true);
        }
      }
    }
  }

  function handleCaptureCancel() {
    setCaptureOpen(false);
    setGeofenceStatus(null);
  }

  // Work From Home check-in handler
  async function handleConfirmWfh() {
    setWfhSubmitting(true);
    setError(null);

    const { error: rpcErr } = await supabase.rpc("check_in_wfh", {
      p_reason: wfhReason.trim() || null,
    });

    setWfhSubmitting(false);

    if (rpcErr) {
      setError(friendlyError(rpcErr.message));
    } else {
      setWfhModalOpen(false);
      setWfhReason("");
      load();
    }
  }

  // Cancel pending Work From Home request
  async function handleCancelWfh() {
    if (!today?.id) return;
    setWfhCancelling(true);
    setError(null);

    const { error: rpcErr } = await supabase.rpc("cancel_wfh", {
      p_attendance_id: today.id,
    });

    setWfhCancelling(false);

    if (rpcErr) {
      setError(friendlyError(rpcErr.message));
    } else {
      load();
    }
  }

  // Admin/Manager approves or rejects WFH
  async function handleReviewWfh(attendanceId: string, action: "approved" | "rejected") {
    setWfhActionBusy(attendanceId);
    setError(null);

    const { error: rpcErr } = await supabase.rpc("review_wfh_attendance", {
      p_attendance_id: attendanceId,
      p_action: action,
    });

    setWfhActionBusy(null);

    if (rpcErr) {
      setError(rpcErr.message);
    } else {
      load();
    }
  }

  // Filtered rows for manager table
  const displayedRows = rows.filter((r) => {
    if (activeFilter === "workplace") return r.attendance_type !== "WORK_FROM_HOME";
    if (activeFilter === "wfh") return r.attendance_type === "WORK_FROM_HOME";
    return true;
  });

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8 animate-fade-in-up">
      <div>
        <h1 className="font-spacex text-xl lg:text-2xl font-bold text-ink-100 uppercase tracking-wider flex items-center gap-3">
          <span>ATTENDANCE & CHECK-IN</span>
          <span className="px-3 py-1 text-[10px] font-bold rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 uppercase tracking-widest font-spacex">
            HYBRID ATTENDANCE
          </span>
        </h1>
        <p className="text-ink-400 text-xs mt-1.5 leading-relaxed">
          {isManager
            ? "Organization-wide check-in logs, biometric face verification confidence, remote WFH tracking, and location records."
            : "Check in at the workplace with biometric verification, or mark Work From Home."}
        </p>
      </div>

      {!isManager && (
        <div className="glass-card p-6 lg:p-8 rounded-3xl relative overflow-hidden shadow-2xl space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-6 relative z-10">
            <div>
              <p className="text-[10px] font-bold text-ink-500 uppercase tracking-[0.2em] mb-1.5 font-spacex">Today's Shift Status</p>
              
              <div className="flex items-center gap-3 flex-wrap">
                {today?.check_in ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-base-800/90 border border-white/10 text-ink-200">
                    {today.attendance_type === "WORK_FROM_HOME" ? "🏠 Work From Home" : "🏢 Workplace"}
                  </span>
                ) : (
                  <span className="text-xs text-ink-400 font-medium">Not checked in</span>
                )}

                {today?.check_in && (
                  <p className="text-ink-100 text-sm font-medium flex items-center gap-2">
                    <span>Check-in: <span className="font-bold text-accent-400 font-mono text-base">{fmtTime(today.check_in)}</span></span>
                    <span className="text-ink-600">•</span>
                    <span>Check-out: <span className="font-bold text-cobalt-400 font-mono text-base">{fmtTime(today.check_out)}</span></span>
                  </p>
                )}

                {today?.attendance_type === "WORK_FROM_HOME" && (
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      today.approval_status === "approved"
                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                        : today.approval_status === "rejected"
                        ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                        : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                    }`}>
                      {today.approval_status === "approved"
                        ? "Status: Approved"
                        : today.approval_status === "rejected"
                        ? "Status: Rejected"
                        : "Status: Pending Approval"}
                    </span>

                    {today.approval_status === "pending" && !today.check_out && (
                      <button
                        onClick={handleCancelWfh}
                        disabled={wfhCancelling}
                        className="text-[11px] text-ink-400 hover:text-rose-400 underline underline-offset-2 transition-colors ml-1 cursor-pointer disabled:opacity-50"
                      >
                        {wfhCancelling ? "Cancelling..." : "Cancel Request"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {hasFaceProfile === false ? (
              <div className="flex items-center gap-3">
                <Link
                  to="/face-register"
                  className="btn-glass-primary h-11 px-6 rounded-xl text-xs font-bold flex items-center gap-2"
                >
                  Register Face Descriptor
                </Link>
                <button
                  onClick={() => {
                    setError(null);
                    setWfhModalOpen(true);
                  }}
                  disabled={busy || !!today?.check_in}
                  className="btn-glass h-11 px-5 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-accent-400 hover:text-accent-300 border-accent-500/30 flex items-center gap-2"
                >
                  🏠 Work From Home
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                {!today?.check_in ? (
                  <>
                    <button
                      onClick={() => openCapture("in")}
                      disabled={busy}
                      className="btn-glass-primary h-11 px-5 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold flex items-center gap-2"
                    >
                      <span>🏢 Check In at Workplace</span>
                    </button>
                    <button
                      onClick={() => {
                        setError(null);
                        setWfhModalOpen(true);
                      }}
                      disabled={busy}
                      className="btn-glass h-11 px-5 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-accent-400 hover:text-accent-300 border-accent-500/30 hover:border-accent-500/60 flex items-center gap-2 transition-all cursor-pointer"
                    >
                      <span>🏠 Work From Home</span>
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => openCapture("out")}
                    disabled={busy || !!today?.check_out}
                    className="btn-glass h-11 px-6 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold cursor-pointer"
                  >
                    Log Out
                  </button>
                )}
              </div>
            )}
          </div>

          {captureOpen && (
            <div className="mt-6 pt-5 border-t border-white/5">
              <FaceLivenessCapture
                employeeId={profile!.id}
                onCancel={handleCaptureCancel}
                onVerified={handleVerified}
              />
            </div>
          )}

          {!captureOpen && busy && (
            <div className="mt-5 flex items-center gap-2 text-accent-400 text-xs font-semibold">
              <Spinner /> {geofenceStatus ?? "Verifying telemetry & recording attendance…"}
            </div>
          )}
        </div>
      )}

      {/* Work From Home Confirmation Modal */}
      {wfhModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
          <div className="glass-card max-w-md w-full p-6 lg:p-7 rounded-3xl border border-white/10 shadow-2xl space-y-5 animate-scale-in">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">🏠</span>
                <h2 className="font-spacex text-base font-bold text-ink-100 uppercase tracking-wider">
                  Work From Home
                </h2>
              </div>
              <button
                onClick={() => setWfhModalOpen(false)}
                className="text-ink-400 hover:text-ink-100 text-sm p-1 rounded-lg hover:bg-white/10"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-xs text-ink-300 leading-relaxed">
                You are about to mark today's attendance as <strong className="text-ink-100 font-semibold">Work From Home</strong>.
              </p>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-ink-400 uppercase tracking-wider font-spacex">
                  Reason / Optional Note
                </label>
                <textarea
                  value={wfhReason}
                  onChange={(e) => setWfhReason(e.target.value)}
                  placeholder="e.g. Remote work, doctor's appointment in morning, personal errand..."
                  rows={3}
                  className="w-full rounded-xl glass-input p-3 text-xs text-ink-100 placeholder:text-ink-500 outline-none resize-none focus:ring-1 focus:ring-accent-500/50"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setWfhModalOpen(false)}
                disabled={wfhSubmitting}
                className="btn-glass h-10 px-4 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmWfh}
                disabled={wfhSubmitting}
                className="btn-glass-primary h-10 px-5 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer"
              >
                {wfhSubmitting && <Spinner />}
                Confirm Work From Home
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs font-medium text-rose-300 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span>⚠</span>
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-400 font-bold hover:text-rose-200">✕</button>
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-xs text-ink-400 flex items-center justify-center gap-2 glass-card rounded-3xl">
          <Spinner /> Loading attendance records...
        </div>
      ) : (
        <div className="glass-card p-6 lg:p-8 rounded-3xl overflow-hidden shadow-2xl space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <h2 className="text-xs font-bold text-ink-400 uppercase tracking-widest font-spacex">Recent Logs</h2>
            
            {isManager && (
              <div className="flex items-center gap-1.5 bg-base-900/80 p-1 rounded-xl border border-white/5 text-[11px]">
                <button
                  onClick={() => setActiveFilter("all")}
                  className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                    activeFilter === "all" ? "bg-accent-500/20 text-accent-400 border border-accent-500/40" : "text-ink-400 hover:text-ink-200"
                  }`}
                >
                  All ({rows.length})
                </button>
                <button
                  onClick={() => setActiveFilter("workplace")}
                  className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                    activeFilter === "workplace" ? "bg-accent-500/20 text-accent-400 border border-accent-500/40" : "text-ink-400 hover:text-ink-200"
                  }`}
                >
                  🏢 Workplace ({rows.filter((r) => r.attendance_type !== "WORK_FROM_HOME").length})
                </button>
                <button
                  onClick={() => setActiveFilter("wfh")}
                  className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                    activeFilter === "wfh" ? "bg-accent-500/20 text-accent-400 border border-accent-500/40" : "text-ink-400 hover:text-ink-200"
                  }`}
                >
                  🏠 Work From Home ({rows.filter((r) => r.attendance_type === "WORK_FROM_HOME").length})
                </button>
              </div>
            )}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-white/5">
            <table className="w-full text-left text-xs text-ink-200">
              <thead className="bg-base-900/90 text-ink-400 font-semibold uppercase text-[10px] tracking-wider border-b border-white/5 font-spacex">
                <tr>
                  {isManager && <th className="px-5 py-4">Employee</th>}
                  <th className="px-5 py-4">Date</th>
                  <th className="px-5 py-4">Type</th>
                  <th className="px-5 py-4">Check-in</th>
                  <th className="px-5 py-4">Check-out</th>
                  <th className="px-5 py-4">Verification</th>
                  <th className="px-5 py-4">Status</th>
                  {isManager && <th className="px-5 py-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {displayedRows.map((r) => {
                  const isWfh = r.attendance_type === "WORK_FROM_HOME";
                  return (
                    <tr key={r.id} className="hover:bg-base-800/40 transition-colors">
                      {isManager && (
                        <td className="px-5 py-3.5 font-semibold text-ink-100">
                          <div>
                            <div>{r.profiles?.full_name || r.profiles?.email || "—"}</div>
                            {r.profiles?.department && (
                              <div className="text-[10px] text-ink-500 font-normal">{r.profiles.department}</div>
                            )}
                          </div>
                        </td>
                      )}
                      <td className="px-5 py-3.5 font-mono text-ink-300">{r.date}</td>
                      <td className="px-5 py-3.5">
                        {isWfh ? (
                          <div className="flex flex-col">
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent-400">
                              <span>🏠</span> WFH
                            </span>
                            {r.wfh_reason && (
                              <span className="text-[10px] text-ink-400 line-clamp-1 italic" title={r.wfh_reason}>
                                {r.wfh_reason}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink-300">
                            <span>🏢</span> Workplace
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 font-mono font-medium text-ink-200">{fmtTime(r.check_in)}</td>
                      <td className="px-5 py-3.5 font-mono font-medium text-ink-200">{fmtTime(r.check_out)}</td>
                      <td className="px-5 py-3.5">
                        {isWfh ? (
                          <span className="text-ink-500 text-[11px]">Remote</span>
                        ) : r.face_verified === null ? (
                          <span className="text-ink-500">—</span>
                        ) : r.face_verified ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            Verified
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                            Unverified
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 capitalize">
                        {isWfh ? (
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              r.approval_status === "approved"
                                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                : r.approval_status === "rejected"
                                ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                                : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                            }`}
                          >
                            {r.approval_status || "Pending"}
                          </span>
                        ) : (
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              r.status === "present"
                                ? "bg-accent-500/15 text-accent-400 border border-accent-500/30"
                                : "bg-base-800 text-ink-400 border border-base-700"
                            }`}
                          >
                            {r.status}
                          </span>
                        )}
                      </td>
                      {isManager && (
                        <td className="px-5 py-3.5 text-right">
                          {isWfh && r.approval_status === "pending" ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleReviewWfh(r.id, "approved")}
                                disabled={wfhActionBusy === r.id}
                                className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/40 transition-colors cursor-pointer disabled:opacity-50"
                                title="Approve Work From Home"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleReviewWfh(r.id, "rejected")}
                                disabled={wfhActionBusy === r.id}
                                className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/40 transition-colors cursor-pointer disabled:opacity-50"
                                title="Reject Work From Home"
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-ink-600 text-xs">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
                {displayedRows.length === 0 && (
                  <tr>
                    <td colSpan={isManager ? 8 : 6} className="px-5 py-8 text-center text-ink-500">
                      No attendance records found for current filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Optional ATTENDANCE Event Stress Check Consent Popup */}
      <StressCheckModal
        isOpen={showAttendanceStressModal}
        eventType="ATTENDANCE"
        onClose={() => setShowAttendanceStressModal(false)}
      />
    </div>
  );
}


