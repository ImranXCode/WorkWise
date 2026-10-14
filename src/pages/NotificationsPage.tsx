import { FormEvent, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthContext";
import { Spinner } from "../components/icons";

type NotificationType =
  | "name_change"
  | "join"
  | "leave"
  | "attendance"
  | "announcement"
  | "system"
  | "stress";

type Notification = {
  id: string;
  type: NotificationType;
  message: string;
  visibility: "admin" | "all";
  created_at: string;
};

const typeStyles: Record<NotificationType, string> = {
  name_change: "bg-base-700 text-ink-300",
  join: "bg-accent-500/15 text-accent-500",
  leave: "bg-red-500/15 text-red-300",
  attendance: "bg-cobalt-500/15 text-cobalt-400",
  announcement: "bg-accent-500/15 text-accent-500",
  system: "bg-base-700 text-ink-300",
  stress: "bg-cobalt-500/15 text-cobalt-400",
};

const typeLabels: Record<NotificationType, string> = {
  name_change: "Profile",
  join: "New member",
  leave: "Removed",
  attendance: "Attendance",
  announcement: "Announcement",
  system: "System",
  stress: "Stress",
};

export default function NotificationsPage() {
  const { profile } = useAuth();
  const canAnnounce = profile?.role === "owner" || profile?.role === "admin";

  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [message, setMessage] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("notifications")
      .select("id, type, message, visibility, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      setError(error.message);
    } else {
      setItems((data ?? []) as Notification[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    localStorage.setItem("workwise_last_seen_notif", String(Date.now()));
  }, []);

  async function handlePost(e: FormEvent) {
    e.preventDefault();
    if (!message.trim()) {
      setPostError("Enter a message.");
      return;
    }

    setPosting(true);
    setPostError(null);

    const { error } = await supabase.rpc("create_announcement", {
      p_message: message.trim(),
    });

    setPosting(false);

    if (error) {
      setPostError(error.message);
      return;
    }

    setMessage("");
    load();
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-8 animate-fade-in-up">
      <div>
        <h1 className="font-spacex text-xl lg:text-2xl font-bold text-ink-100 uppercase tracking-wider flex items-center gap-3">
          <span>NOTIFICATIONS & DISPATCH</span>
          <span className="px-3 py-1 text-[10px] font-bold rounded-full bg-accent-500/15 text-accent-400 border border-accent-500/30 uppercase tracking-widest font-spacex">
            LIVE FEED
          </span>
        </h1>
        <p className="text-ink-400 text-xs mt-1.5 leading-relaxed">
          {canAnnounce
            ? "Organization-wide telemetry updates, security dispatches, and public announcements."
            : "Announcements and alerts from your organization."}
        </p>
      </div>

      {canAnnounce && (
        <form
          onSubmit={handlePost}
          className="rounded-2xl glass-card p-6 border border-base-750/50 space-y-3 shadow-2xl"
        >
          <label
            htmlFor="announcement"
            className="block text-xs font-bold text-ink-300 uppercase tracking-wider font-spacex"
          >
            Dispatch Organization Announcement
          </label>
          <textarea
            id="announcement"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="Broadcast a message to all members in your organization..."
            className="w-full rounded-xl glass-input p-3.5 text-xs text-ink-100 placeholder:text-ink-500 outline-none resize-none"
          />
          {postError && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-xs text-rose-300">
              {postError}
            </div>
          )}
          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={posting}
              className="btn-glass-primary h-10 px-5 rounded-xl text-xs font-bold disabled:opacity-50 flex items-center gap-2"
            >
              {posting && <Spinner />}
              Post Announcement
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="p-8 text-center text-xs text-ink-400 flex items-center justify-center gap-2">
          <Spinner /> Loading notifications...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-300">
          {error}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl glass-card border border-base-750/50 p-10 text-center space-y-2">
          <p className="text-ink-400 text-xs font-medium">No active dispatches or notifications yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((n) => (
            <div
              key={n.id}
              className="rounded-2xl glass-card p-5 border border-base-750/50 hover:border-accent-500/30 transition-all duration-300 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider font-spacex ${typeStyles[n.type]}`}
                >
                  {typeLabels[n.type]}
                </span>
                <span className="text-[10px] font-mono text-ink-500">
                  {new Date(n.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <p className="text-ink-100 text-xs leading-relaxed font-medium">{n.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

