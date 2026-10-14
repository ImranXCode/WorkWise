import { useEffect, useRef, useState } from "react";
import { useAuth } from "../lib/AuthContext";
import { supabase } from "../lib/supabase";
import { fetchEmployeeStressHistory } from "../lib/stressService";

/* ─────────────── mood types ─────────────── */
type MoodEntry = {
  mood: string;
  emoji: string;
  note: string;
  created_at: string;
};

const MOODS = [
  { emoji: "😊", label: "Great", value: "great", color: "emerald" },
  { emoji: "🙂", label: "Good", value: "good", color: "teal" },
  { emoji: "😐", label: "Okay", value: "okay", color: "amber" },
  { emoji: "😔", label: "Low", value: "low", color: "orange" },
  { emoji: "😣", label: "Stressed", value: "stressed", color: "rose" },
] as const;

/* ─────────────── BREATHING EXERCISE ─────────────── */
const BREATHING_PHASES: { label: string; seconds: number; instruction: string }[] = [
  { label: "Inhale", seconds: 4, instruction: "Breathe in slowly through your nose" },
  { label: "Hold", seconds: 4, instruction: "Hold your breath gently" },
  { label: "Exhale", seconds: 4, instruction: "Breathe out slowly through your mouth" },
  { label: "Hold", seconds: 4, instruction: "Rest before the next breath" },
];

function BreathingExercise() {
  const [running, setRunning] = useState(false);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(BREATHING_PHASES[0].seconds);
  const [cycles, setCycles] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setTotalSeconds((s) => s + 1);
      setSecondsLeft((s) => {
        if (s > 1) return s - 1;
        setPhaseIndex((p) => {
          const next = (p + 1) % BREATHING_PHASES.length;
          if (next === 0) setCycles((c) => c + 1);
          return next;
        });
        return 0;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    setSecondsLeft(BREATHING_PHASES[phaseIndex].seconds);
  }, [phaseIndex]);

  function toggle() {
    if (running) {
      setRunning(false);
    } else {
      setPhaseIndex(0);
      setSecondsLeft(BREATHING_PHASES[0].seconds);
      setCycles(0);
      setTotalSeconds(0);
      setRunning(true);
    }
  }

  const phase = BREATHING_PHASES[phaseIndex];
  const progress = 1 - secondsLeft / phase.seconds;

  const ringScale =
    phase.label === "Inhale"
      ? 0.6 + 0.4 * progress
      : phase.label === "Exhale"
      ? 1 - 0.4 * progress
      : phaseIndex === 1
      ? 1
      : 0.6;

  const phaseColor =
    phase.label === "Inhale"
      ? "from-cyan-400 to-teal-500"
      : phase.label === "Exhale"
      ? "from-blue-400 to-indigo-500"
      : "from-violet-400 to-purple-500";

  return (
    <div className="glass-card p-6 lg:p-8 rounded-3xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-spacex text-sm font-bold text-ink-100 uppercase tracking-wider flex items-center gap-2">
            <span className="text-xl">🫁</span> BREATHING EXERCISE
          </h3>
          <p className="text-ink-400 text-xs mt-1 font-medium">Box breathing — calms the nervous system</p>
        </div>
        {running && (
          <span className="text-xs text-cyan-300 font-mono font-bold tabular-nums px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30">
            {Math.floor(totalSeconds / 60)}:{(totalSeconds % 60).toString().padStart(2, "0")}
          </span>
        )}
      </div>

      <div className="relative w-48 h-48 mx-auto flex items-center justify-center my-6">
        {/* Outer static ring */}
        <div className="absolute inset-0 rounded-full border border-base-700/60" />

        {/* Animated breath ring */}
        <div
          className={`absolute rounded-full transition-all duration-1000 ease-in-out ${
            running
              ? `bg-gradient-to-br ${phaseColor} opacity-25`
              : "bg-cyan-500/10"
          }`}
          style={{
            width: "85%",
            height: "85%",
            transform: `scale(${running ? ringScale : 0.7})`,
          }}
        />

        {/* Glow pulse */}
        {running && (
          <div
            className={`absolute rounded-full bg-gradient-to-br ${phaseColor} opacity-20 blur-xl transition-all duration-1000`}
            style={{
              width: "100%",
              height: "100%",
              transform: `scale(${ringScale * 0.9})`,
            }}
          />
        )}

        {/* Center content */}
        <div className="relative text-center z-10 space-y-1">
          <p className="font-spacex text-sm font-bold text-ink-100 tracking-wider">
            {running ? phase.label.toUpperCase() : "READY"}
          </p>
          {running ? (
            <p className="text-4xl font-spacex font-black text-cyan-300 tabular-nums">
              {secondsLeft}
            </p>
          ) : (
            <p className="text-ink-400 text-xs font-mono">4-4-4-4</p>
          )}
        </div>
      </div>

      {running && (
        <p className="text-cyan-300 text-xs text-center font-medium italic">
          {phase.instruction}
        </p>
      )}

      <div className="flex items-center justify-center gap-3 pt-2">
        <button
          onClick={toggle}
          className={running ? "btn-glass px-6 py-2.5 text-xs font-spacex" : "btn-glass-primary px-6 py-2.5 text-xs font-spacex"}
        >
          {running ? "STOP SESSION" : "START SESSION"}
        </button>
      </div>

      {running && cycles > 0 && (
        <div className="flex justify-center gap-1.5 pt-2">
          {Array.from({ length: Math.min(cycles, 8) }).map((_, i) => (
            <div key={i} className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#2dd4bf]" />
          ))}
          {cycles > 8 && <span className="text-ink-400 text-[10px] ml-1">+{cycles - 8}</span>}
        </div>
      )}
    </div>
  );
}

/* ─────────────── BREAK REMINDER ─────────────── */
function BreakReminder() {
  const [enabled, setEnabled] = useState(false);
  const [intervalMin, setIntervalMin] = useState(60);
  const [lastFired, setLastFired] = useState<Date | null>(null);
  const [banner, setBanner] = useState(false);
  const [nextBreakIn, setNextBreakIn] = useState<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);

    if (!enabled) {
      setNextBreakIn(null);
      return;
    }

    const totalMs = intervalMin * 60 * 1000;
    const startTime = Date.now();

    timeoutRef.current = setTimeout(() => {
      setBanner(true);
      setLastFired(new Date());
      setNextBreakIn(null);
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("Time for a break ☕", {
          body: "You've been at it a while — stretch, walk, or just look away from the screen.",
        });
      }
    }, totalMs);

    countdownRef.current = setInterval(() => {
      const remaining = Math.max(0, totalMs - (Date.now() - startTime));
      setNextBreakIn(Math.ceil(remaining / 1000));
    }, 1000);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [enabled, intervalMin, lastFired]);

  function handleToggle() {
    if (!enabled && typeof Notification !== "undefined") {
      Notification.requestPermission();
    }
    setBanner(false);
    setEnabled((e) => !e);
  }

  function formatCountdown(secs: number) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  return (
    <div className="glass-card p-6 lg:p-8 rounded-3xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-spacex text-sm font-bold text-ink-100 uppercase tracking-wider flex items-center gap-2">
            <span className="text-xl">⏰</span> BREAK REMINDER TELEMETRY
          </h3>
          <p className="text-ink-400 text-xs mt-1 font-medium">
            Gentle automated alert to step away and recharge
          </p>
        </div>
        {enabled && nextBreakIn !== null && (
          <span className="px-3.5 py-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-mono font-bold tabular-nums">
            {formatCountdown(nextBreakIn)}
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 flex-wrap pt-3">
        <label className="text-ink-300 text-xs font-spacex">INTERVAL:</label>
        <select
          value={intervalMin}
          onChange={(e) => setIntervalMin(Number(e.target.value))}
          disabled={enabled}
          className="glass-input h-10 rounded-xl px-3 text-xs font-semibold text-ink-100 disabled:opacity-60"
        >
          <option value={25} className="bg-base-900">25 min</option>
          <option value={30} className="bg-base-900">30 min</option>
          <option value={45} className="bg-base-900">45 min</option>
          <option value={60} className="bg-base-900">1 hour</option>
          <option value={90} className="bg-base-900">1.5 hours</option>
        </select>
        <button
          onClick={handleToggle}
          className={enabled ? "btn-glass px-5 py-2 text-xs font-spacex text-rose-300 border-rose-500/40" : "btn-glass-primary px-5 py-2 text-xs font-spacex"}
        >
          {enabled ? "TURN OFF" : "TURN ON"}
        </button>
      </div>

      {banner && (
        <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-3">
            <span className="text-xl">☕</span>
            <span className="text-amber-300 text-xs font-medium">
              Time for a break — stretch, walk, or rest your eyes.
            </span>
          </div>
          <button
            onClick={() => setBanner(false)}
            className="btn-glass px-3 py-1 text-xs"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

/* ─────────────── DAILY MOOD CHECK-IN ─────────────── */
function DailyMoodCheckin() {
  const { profile, organization } = useAuth();
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [todayMood, setTodayMood] = useState<MoodEntry | null>(null);
  const [weekMoods, setWeekMoods] = useState<MoodEntry[]>([]);
  const [showNoteField, setShowNoteField] = useState(false);

  useEffect(() => {
    loadMoodHistory();
  }, [profile?.id, organization?.id]);

  async function loadMoodHistory() {
    if (!profile?.id || !organization?.id) return;

    const today = new Date().toISOString().split("T")[0];
    const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();

    const { data: todayData } = await supabase
      .from("mood_checkins")
      .select("*")
      .eq("employee_id", profile.id)
      .gte("created_at", today)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (todayData) {
      setTodayMood(todayData as MoodEntry);
      setSelectedMood(todayData.mood);
    }

    const { data: weekData } = await supabase
      .from("mood_checkins")
      .select("*")
      .eq("employee_id", profile.id)
      .gte("created_at", weekAgo)
      .order("created_at", { ascending: false })
      .limit(7);

    if (weekData) setWeekMoods(weekData as MoodEntry[]);
  }

  async function handleSaveMood() {
    if (!selectedMood || !profile?.id || !organization?.id) return;
    setSaving(true);

    const moodObj = MOODS.find((m) => m.value === selectedMood);

    await supabase.from("mood_checkins").insert({
      employee_id: profile.id,
      organization_id: organization.id,
      mood: selectedMood,
      emoji: moodObj?.emoji || "😐",
      note: note.trim() || null,
    });

    setTodayMood({
      mood: selectedMood,
      emoji: moodObj?.emoji || "😐",
      note: note.trim(),
      created_at: new Date().toISOString(),
    });
    setSaving(false);
    setShowNoteField(false);
  }

  const streak = weekMoods.length;

  return (
    <div className="glass-card p-6 lg:p-8 rounded-3xl space-y-6 shadow-2xl flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-spacex text-sm font-bold text-ink-100 uppercase tracking-wider flex items-center gap-2">
            <span className="text-xl">💭</span> DAILY MOOD CHECK-IN
          </h3>
          <p className="text-ink-400 text-xs mt-1 font-medium">
            {todayMood ? "You've checked in today" : "How are you feeling right now?"}
          </p>
        </div>
        {streak > 1 && (
          <span className="px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold font-spacex flex items-center gap-1.5 shadow-[0_0_12px_rgba(245,158,11,0.2)]">
            🔥 {streak}-DAY STREAK
          </span>
        )}
      </div>

      {/* Mood selector */}
      <div className="grid grid-cols-5 gap-3 my-2">
        {MOODS.map((m) => (
          <button
            key={m.value}
            onClick={() => {
              if (!todayMood) {
                setSelectedMood(m.value);
                setShowNoteField(true);
              }
            }}
            disabled={!!todayMood}
            className={`flex flex-col items-center justify-center p-4 lg:p-5 rounded-2xl border transition-all duration-300 ${
              selectedMood === m.value
                ? `bg-cyan-500/20 border-cyan-400 scale-105 shadow-xl shadow-cyan-500/25`
                : todayMood
                ? "opacity-40 cursor-not-allowed bg-white/[0.01] border-white/5"
                : "bg-white/[0.03] border-white/10 hover:border-cyan-400/50 hover:bg-white/[0.06] hover:scale-105"
            }`}
          >
            <span className="text-3xl lg:text-4xl mb-2">{m.emoji}</span>
            <span className="text-[11px] font-bold text-ink-100 font-spacex uppercase tracking-wider">{m.label}</span>
          </button>
        ))}
      </div>

      {/* Optional note */}
      {showNoteField && !todayMood && (
        <div className="space-y-3 animate-fade-in">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Quick note about how you feel (optional)..."
            className="glass-input w-full h-11 rounded-xl px-4 text-xs"
          />
          <button
            onClick={handleSaveMood}
            disabled={saving || !selectedMood}
            className="btn-glass-primary w-full h-11 text-xs font-spacex font-bold rounded-xl"
          >
            {saving ? "LOGGING MOOD..." : "LOG MOOD"}
          </button>
        </div>
      )}

      {/* Today's logged mood */}
      {todayMood && (
        <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-4 flex items-center gap-4">
          <span className="text-3xl">{todayMood.emoji}</span>
          <div className="flex-1 min-w-0">
            <p className="text-ink-100 text-xs font-bold font-spacex uppercase">{todayMood.mood}</p>
            {todayMood.note && (
              <p className="text-ink-400 text-xs truncate mt-0.5">{todayMood.note}</p>
            )}
          </div>
          <span className="text-ink-500 text-xs font-mono shrink-0">
            {new Date(todayMood.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      )}
    </div>
  );
}

/* ─────────────── PERSONAL STRESS OVERVIEW ─────────────── */
function PersonalStressOverview() {
  const { profile, organization } = useAuth();
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (organization?.id && profile?.id) {
        try {
          const data = await fetchEmployeeStressHistory(organization.id, profile.id);
          setRecords(data);
        } catch {
          // no-op
        }
      }
      setLoading(false);
    }
    load();
  }, [organization?.id, profile?.id]);

  if (loading) {
    return (
      <div className="glass-card p-6 lg:p-8 rounded-3xl flex items-center gap-3 text-ink-400 text-xs font-spacex">
        <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        <span>SYNCING STRESS TELEMETRY...</span>
      </div>
    );
  }

  const latestScore = records.length > 0 ? records[0].stress_score : null;
  const avgScore = records.length > 0
    ? Math.round(records.reduce((sum: number, r: any) => sum + r.stress_score, 0) / records.length)
    : null;
  const stressCount = records.filter((r: any) => r.predicted_class === "stress").length;

  const scoreColor =
    latestScore === null
      ? "text-ink-400"
      : latestScore <= 30
      ? "text-emerald-400"
      : latestScore <= 60
      ? "text-amber-400"
      : "text-rose-400";

  const scoreLabel =
    latestScore === null
      ? "No data"
      : latestScore <= 30
      ? "Low Stress"
      : latestScore <= 60
      ? "Moderate"
      : "Elevated";

  return (
    <div className="glass-card p-6 lg:p-8 rounded-3xl space-y-6 shadow-2xl flex flex-col justify-between">
      <div>
        <h3 className="font-spacex text-sm font-bold text-ink-100 uppercase tracking-wider flex items-center gap-2">
          <span className="text-xl">📊</span> YOUR STRESS PROFILE
        </h3>
        <p className="text-ink-400 text-xs mt-1 font-medium">Real-time AI telemetry & wellness history</p>
      </div>

      {records.length === 0 ? (
        <div className="text-center py-10 px-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-3">
          <div className="w-12 h-12 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mx-auto">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <p className="text-ink-200 text-xs font-spacex font-bold uppercase tracking-wider">NO STRESS SCANS RECORDED YET</p>
          <p className="text-ink-400 text-xs max-w-xs mx-auto leading-relaxed">
            Take an AI stress check-in to generate your personalized wellness score.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-6">
            <div className="relative w-32 h-32 flex items-center justify-center shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255, 255, 255, 0.08)" strokeWidth="6" />
                <circle cx="50" cy="50" r="42" fill="none" strokeWidth="6"
                  strokeDasharray={`${((latestScore || 0) / 100) * 264} 264`}
                  strokeLinecap="round"
                  className={scoreColor}
                  style={{ transition: "stroke-dasharray 1s ease" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-2xl font-spacex font-black ${scoreColor}`}>
                  {latestScore}
                </span>
                <span className="text-[10px] text-ink-400 font-mono font-bold">/ 100</span>
              </div>
            </div>

            <div className="flex-1 space-y-3">
              <div className="flex items-center justify-between text-xs font-spacex">
                <span className="text-ink-400">STATUS</span>
                <span className={`font-bold ${scoreColor}`}>{scoreLabel}</span>
              </div>
              <div className="flex items-center justify-between text-xs font-spacex">
                <span className="text-ink-400">AVERAGE</span>
                <span className="text-ink-100 font-bold">{avgScore} / 100</span>
              </div>
              <div className="flex items-center justify-between text-xs font-spacex">
                <span className="text-ink-400">TOTAL SCANS</span>
                <span className="text-ink-100 font-bold">{records.length}</span>
              </div>
              <div className="flex items-center justify-between text-xs font-spacex">
                <span className="text-ink-400">ELEVATED</span>
                <span className="text-rose-400 font-bold">{stressCount}</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}


/* ─────────────── WELLNESS QUICK TIPS ─────────────── */
function WellnessTips() {
  const TIPS = [
    { icon: "💧", title: "Stay Hydrated", desc: "Drink water regularly — dehydration amplifies stress." },
    { icon: "🚶", title: "Move Often", desc: "A 5-minute walk resets focus better than pushing through." },
    { icon: "🌿", title: "Natural Light", desc: "Take calls near a window when possible." },
    { icon: "🧘", title: "Mindful Pauses", desc: "Three deep breaths before a meeting can reduce anxiety." },
    { icon: "📵", title: "Batch Notifications", desc: "Check messages at set intervals, not every ping." },
    { icon: "🌙", title: "Consistent Sleep", desc: "Same wake-up time matters more than total hours." },
  ];

  const [currentTip, setCurrentTip] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setCurrentTip((c) => (c + 1) % TIPS.length);
    }, 8000);
    return () => clearInterval(id);
  }, [TIPS.length]);

  return (
    <div className="glass-card p-6 lg:p-8 rounded-3xl space-y-5 shadow-2xl">
      <h3 className="text-ink-100 text-sm font-bold font-spacex uppercase tracking-wider flex items-center gap-2">
        <span className="text-xl">💡</span> WELLNESS & PERFORMANCE PROTOCOLS
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {TIPS.map((tip, i) => (
          <div
            key={i}
            className={`p-4 rounded-2xl border transition-all duration-500 cursor-default ${
              i === currentTip
                ? "border-cyan-400/50 bg-cyan-500/10 scale-[1.02] shadow-lg shadow-cyan-500/10"
                : "border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10"
            }`}
          >
            <span className="text-2xl block mb-2">{tip.icon}</span>
            <p className="text-ink-100 text-xs font-bold font-spacex uppercase tracking-wider mb-1">{tip.title}</p>
            <p className="text-ink-400 text-xs leading-relaxed">{tip.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}


/* ─────────────── MAIN PAGE ─────────────── */
export default function WellbeingPage() {
  return (
    <div className="space-y-8 max-w-7xl mx-auto page-enter animate-fade-in p-6 lg:p-8">
      {/* Header */}
      <div>
        <h1 className="font-spacex text-xl lg:text-2xl font-bold text-ink-100 uppercase tracking-wider flex items-center gap-3">
          <span className="text-2xl">🧠</span>
          <span>WELLBEING & MENTAL HEALTH</span>
          <span className="px-3 py-1 text-[10px] font-bold rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 uppercase tracking-widest">
            AI MONITORING
          </span>
        </h1>
        <p className="text-ink-400 text-xs mt-1.5 leading-relaxed">
          Interactive tools to manage stress, track mood telemetry, and optimize work performance.
          <span className="text-ink-500 ml-1.5">(Not medical advice)</span>
        </p>
      </div>

      {/* Top row: Mood + Stress Profile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <DailyMoodCheckin />
        <PersonalStressOverview />
      </div>

      {/* Middle row: Breathing + Break Reminders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <BreathingExercise />
        <BreakReminder />
      </div>

      {/* Bottom: Wellness Tips */}
      <WellnessTips />
    </div>
  );
}
