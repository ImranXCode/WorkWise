import { useState, useEffect } from "react";
import {
  Task,
  TaskComment,
  TaskActivity,
  TaskStatus,
  ChecklistItem,
  isTaskOverdue,
  isTaskDueSoon,
  updateTask,
  fetchTaskComments,
  addTaskComment,
  fetchTaskActivity,
} from "../lib/taskService";
import { useAuth } from "../lib/AuthContext";

interface Props {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onTaskUpdated: () => void;
}

export default function TaskDetailsModal({ task, isOpen, onClose, onTaskUpdated }: Props) {
  const { user, profile } = useAuth();
  const isOwnerOrAdmin = profile?.role === "owner" || profile?.role === "admin" || profile?.role === "manager" || profile?.role === "hr";

  const [comments, setComments] = useState<TaskComment[]>([]);
  const [activities, setActivities] = useState<TaskActivity[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loadingComment, setLoadingComment] = useState(false);
  const [activeTab, setActiveTab] = useState<"details" | "checklist" | "comments" | "activity">("details");

  const [status, setStatus] = useState<TaskStatus>("todo");
  const [progress, setProgress] = useState<number>(0);
  const [blockedReason, setBlockedReason] = useState<string>("");
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newCheckitem, setNewCheckitem] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);

  useEffect(() => {
    if (task) {
      setStatus(task.status);
      setProgress(task.progress || 0);
      setBlockedReason(task.blocked_reason || "");
      setChecklist(task.checklist || []);
      loadDetails(task.id);
    }
  }, [task]);

  async function loadDetails(taskId: string) {
    const [cList, aList] = await Promise.all([
      fetchTaskComments(taskId),
      fetchTaskActivity(taskId),
    ]);
    setComments(cList);
    setActivities(aList);
  }

  if (!isOpen || !task) return null;

  const overdue = isTaskOverdue(task);
  const dueSoon = isTaskDueSoon(task);
  const canEditTask = isOwnerOrAdmin || task.assigned_to === user?.id;

  const priorityColors: Record<string, { bg: string; text: string; border: string }> = {
    low: { bg: "bg-slate-500/10", text: "text-slate-400", border: "border-slate-500/30" },
    medium: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/30" },
    high: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/30" },
    urgent: { bg: "bg-red-500/15", text: "text-red-400", border: "border-red-500/40" },
  };

  const statusColors: Record<string, { bg: string; text: string; dot: string }> = {
    todo: { bg: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30", text: "To Do", dot: "bg-zinc-400" },
    in_progress: { bg: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30", text: "In Progress", dot: "bg-cyan-400" },
    blocked: { bg: "bg-rose-500/15 text-rose-400 border-rose-500/40", text: "Blocked", dot: "bg-rose-500" },
    completed: { bg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30", text: "Completed", dot: "bg-emerald-400" },
    cancelled: { bg: "bg-slate-700/30 text-slate-400 border-slate-700", text: "Cancelled", dot: "bg-slate-500" },
  };

  function getPriorityStyle(p?: string) {
    const key = (p || "medium").toLowerCase();
    return priorityColors[key] || priorityColors.medium;
  }

  function getStatusStyle(s?: string) {
    const key = (s || "todo").toLowerCase().replace(/[\s-]+/g, "_");
    return statusColors[key] || statusColors.todo;
  }

  async function handleSaveStatus(newStatus: TaskStatus, newProg = progress) {
    if (!task || !user) return;
    setSaving(true);
    await updateTask(
      task.id,
      {
        organization_id: task.organization_id,
        title: task.title,
        status: newStatus,
        progress: newProg,
        blocked_reason: newStatus === "blocked" ? blockedReason : null,
        checklist,
      },
      user.id,
      profile?.role || "employee"
    );
    setStatus(newStatus);
    setProgress(newProg);
    setSaving(false);
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2500);
    onTaskUpdated();
    loadDetails(task.id);
  }

  async function handleToggleChecklist(itemId: string) {
    if (!task || !user) return;
    const updated = checklist.map((item) =>
      item.id === itemId ? { ...item, completed: !item.completed } : item
    );
    setChecklist(updated);

    // Calculate auto progress based on checklist items
    const completedCount = updated.filter((i) => i.completed).length;
    const autoProgress = updated.length > 0 ? Math.round((completedCount / updated.length) * 100) : progress;
    setProgress(autoProgress);

    await updateTask(
      task.id,
      {
        organization_id: task.organization_id,
        title: task.title,
        checklist: updated,
        progress: autoProgress,
      },
      user.id,
      profile?.role || "employee"
    );
    onTaskUpdated();
  }

  async function handleAddCheckitem() {
    if (!newCheckitem.trim() || !task || !user) return;
    const newItem: ChecklistItem = {
      id: crypto.randomUUID(),
      text: newCheckitem.trim(),
      completed: false,
    };
    const updated = [...checklist, newItem];
    setChecklist(updated);
    setNewCheckitem("");

    await updateTask(
      task.id,
      {
        organization_id: task.organization_id,
        title: task.title,
        checklist: updated,
      },
      user.id,
      profile?.role || "employee"
    );
    onTaskUpdated();
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim() || !task || !user || !profile) return;
    setLoadingComment(true);
    await addTaskComment(
      task.organization_id,
      task.id,
      user.id,
      newComment.trim()
    );
    setNewComment("");
    setLoadingComment(false);
    loadDetails(task.id);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-opacity duration-300">
      <div
        className="w-full max-w-2xl bg-base-900 border-l border-base-700/70 h-full flex flex-col shadow-2xl overflow-hidden animate-slide-left"
        style={{ animationDuration: "0.25s" }}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-base-700/60 bg-base-900/70 backdrop-blur-md flex items-start justify-between gap-4 shrink-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              {(() => {
                const pStyle = getPriorityStyle(task.priority);
                const sStyle = getStatusStyle(task.status);
                return (
                  <>
                    <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${pStyle.bg} ${pStyle.text} ${pStyle.border}`}>
                      {(task.priority || "medium").toUpperCase()} PRIORITY
                    </span>
                    <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full border flex items-center gap-1.5 ${sStyle.bg}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${sStyle.dot}`} />
                      {sStyle.text}
                    </span>
                  </>
                );
              })()}
              {overdue && (
                <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-red-500/20 text-red-300 border border-red-500/40 animate-pulse">
                  ⚠ OVERDUE
                </span>
              )}
              {dueSoon && !overdue && (
                <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  ⏳ DUE SOON
                </span>
              )}
            </div>

            <h2 className="text-lg font-spacex font-bold text-ink-100 tracking-wide leading-snug break-words">
              {task.title}
            </h2>

            {task.department && (
              <p className="text-xs text-ink-400 mt-1">
                Department: <span className="text-ink-200 font-medium">{task.department}</span>
              </p>
            )}
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg text-ink-400 hover:text-ink-100 hover:bg-base-800 transition-colors shrink-0"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>


        {/* Navigation Tabs */}
        <div className="flex border-b border-base-700/60 bg-base-850 px-6 gap-6 text-sm font-medium shrink-0">
          {[
            { id: "details", label: "Task Details" },
            { id: "checklist", label: `Checklist (${checklist.filter((i) => i.completed).length}/${checklist.length})` },
            { id: "comments", label: `Comments (${comments.length})` },
            { id: "activity", label: "Activity Log" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={`py-3 relative transition-colors ${
                activeTab === t.id
                  ? "text-accent-400 font-semibold"
                  : "text-ink-400 hover:text-ink-200"
              }`}
            >
              {t.label}
              {activeTab === t.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-500 rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === "details" && (
            <>
              {/* Description */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                  Description
                </h3>
                <div className="p-4 rounded-xl bg-base-800/60 border border-base-700/50 text-sm text-ink-200 whitespace-pre-wrap leading-relaxed">
                  {task.description || "No description provided for this task."}
                </div>
              </div>

              {/* People & Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-base-800/40 border border-base-700/50 space-y-1">
                  <span className="text-[11px] font-medium text-ink-400 uppercase">Assigned To</span>
                  <div className="flex items-center gap-2 pt-1">
                    <div className="w-7 h-7 rounded-full bg-accent-500/20 border border-accent-500/40 flex items-center justify-center text-xs font-bold text-accent-300">
                      {(task.assignee?.full_name || task.assignee?.email || "U")[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-ink-100 truncate">
                        {task.assignee?.full_name || task.assignee?.email || "Unassigned"}
                      </p>
                      {task.assignee?.department && (
                        <p className="text-[10px] text-ink-500">{task.assignee.department}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-base-800/40 border border-base-700/50 space-y-1">
                  <span className="text-[11px] font-medium text-ink-400 uppercase">Due Date</span>
                  <p className="text-xs font-semibold text-ink-100 pt-1">
                    {task.due_date
                      ? new Date(task.due_date).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "No deadline"}
                  </p>
                  {task.estimated_hours > 0 && (
                    <p className="text-[10px] text-ink-400">Est. Time: {task.estimated_hours} hrs</p>
                  )}
                </div>
              </div>

              {/* Progress Slider */}
              <div className="p-4 rounded-xl bg-base-800/60 border border-base-700/60 space-y-3">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-ink-300">Completion Progress</span>
                  <span className="text-accent-400 font-bold text-sm">{progress}%</span>
                </div>
                <div className="w-full bg-base-950 h-2.5 rounded-full overflow-hidden border border-base-700/50 relative">
                  <div
                    className="h-full bg-gradient-to-r from-accent-500 to-emerald-400 transition-all duration-300 rounded-full"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                {canEditTask && (
                  <div className="flex items-center gap-3 pt-1">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={progress}
                      onChange={(e) => setProgress(Number(e.target.value))}
                      className="flex-1 accent-accent-500 cursor-pointer"
                    />
                    <button
                      onClick={() => handleSaveStatus(status, progress)}
                      disabled={saving}
                      className="px-3.5 py-1.5 text-xs font-semibold bg-accent-500/20 text-accent-300 hover:bg-accent-500 hover:text-white border border-accent-500/40 rounded-lg transition-colors shrink-0 flex items-center gap-1.5 shadow-sm"
                    >
                      {saving ? "Saving..." : "Save Progress"}
                    </button>
                  </div>
                )}
              </div>

              {/* Status Update Workflow */}
              {canEditTask && (
                <div className="p-4 rounded-xl bg-base-800/60 border border-base-700/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                      Update Task Status
                    </h3>
                    <button
                      onClick={() => handleSaveStatus(status, progress)}
                      disabled={saving}
                      className="px-3 py-1 text-xs font-semibold bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500 hover:text-base-950 border border-emerald-500/40 rounded-lg transition-colors flex items-center gap-1 shrink-0"
                    >
                      Save Status
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(["todo", "in_progress", "blocked", "completed"] as TaskStatus[]).map((st) => (
                      <button
                        key={st}
                        onClick={() => {
                          const nextProg = st === "completed" ? 100 : progress;
                          setStatus(st);
                          handleSaveStatus(st, nextProg);
                        }}
                        disabled={saving}
                        className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-all duration-200 flex items-center justify-center gap-1.5 ${
                          status === st
                            ? "bg-accent-500 text-white border-accent-400 shadow-md shadow-accent-500/20"
                            : "bg-base-900 border-base-700 text-ink-300 hover:bg-base-750"
                        }`}
                      >
                        {st === "completed" ? "✓ Complete" : statusColors[st].text}
                      </button>
                    ))}
                  </div>

                  {status === "blocked" && (
                    <div className="space-y-2 pt-2">
                      <label className="text-xs text-rose-300 font-medium">
                        Blocked Reason / Bottleneck:
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={blockedReason}
                          onChange={(e) => setBlockedReason(e.target.value)}
                          placeholder="e.g. Waiting for API credentials or manager signoff..."
                          className="flex-1 px-3 py-2 text-xs rounded-lg bg-base-900 border border-rose-500/40 text-ink-100 placeholder-ink-500 focus:outline-none focus:border-rose-400"
                        />
                        <button
                          onClick={() => handleSaveStatus("blocked", progress)}
                          className="px-3 py-1.5 text-xs font-semibold rounded-md bg-rose-500 text-white hover:bg-rose-600 transition-colors shrink-0"
                        >
                          Save Reason
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons for Owner Re-open or Employee Finish */}
              {isOwnerOrAdmin && task.status === "completed" && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-amber-300">Task is Marked Completed</p>
                    <p className="text-[11px] text-amber-400/80">Need more work? You can reopen this task.</p>
                  </div>
                  <button
                    onClick={() => handleSaveStatus("in_progress", 50)}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-600 text-base-950 transition-colors shadow"
                  >
                    Re-open Task
                  </button>
                </div>
              )}
            </>
          )}

          {activeTab === "checklist" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-ink-400">
                <span>Subtasks Checklist</span>
                <span>
                  {checklist.filter((i) => i.completed).length} of {checklist.length} done
                </span>
              </div>

              {checklist.length === 0 ? (
                <p className="text-xs text-ink-500 text-center py-6 bg-base-800/40 rounded-xl border border-base-700/50">
                  No subtasks in checklist. Add items below.
                </p>
              ) : (
                <div className="space-y-2">
                  {checklist.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleToggleChecklist(item.id)}
                      className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-all duration-200 ${
                        item.completed
                          ? "bg-emerald-500/5 border-emerald-500/20 text-ink-400 line-through"
                          : "bg-base-800/60 border-base-700/60 text-ink-100 hover:border-accent-500/40"
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                          item.completed
                            ? "bg-emerald-500 border-emerald-500 text-base-950"
                            : "border-base-600"
                        }`}
                      >
                        {item.completed && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                      <span className="text-xs font-medium leading-normal flex-1">{item.text}</span>
                    </div>
                  ))}
                </div>
              )}

              {canEditTask && (
                <div className="flex gap-2 pt-2">
                  <input
                    type="text"
                    value={newCheckitem}
                    onChange={(e) => setNewCheckitem(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddCheckitem()}
                    placeholder="Add new subtask item..."
                    className="flex-1 px-3 py-2 text-xs rounded-xl bg-base-900 border border-base-700 text-ink-100 placeholder-ink-500 focus:outline-none focus:border-accent-500"
                  />
                  <button
                    onClick={handleAddCheckitem}
                    className="px-4 py-2 text-xs font-semibold rounded-xl bg-accent-500 hover:bg-accent-600 text-white transition-colors"
                  >
                    Add Subtask
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === "comments" && (
            <div className="space-y-4">
              <div className="space-y-3">
                {comments.length === 0 ? (
                  <p className="text-xs text-ink-500 text-center py-6 bg-base-800/40 rounded-xl border border-base-700/50">
                    No comments yet. Start the conversation below.
                  </p>
                ) : (
                  comments.map((c) => (
                    <div key={c.id} className="p-4 rounded-xl bg-base-800/60 border border-base-700/50 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-ink-200">
                          {c.user?.full_name || c.user?.email || "Team Member"}
                        </span>
                        <span className="text-[10px] text-ink-500">
                          {new Date(c.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="text-xs text-ink-100 whitespace-pre-wrap leading-relaxed">{c.comment}</p>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handleAddComment} className="space-y-2 pt-2">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Write a comment or status note..."
                  rows={3}
                  className="w-full px-3 py-2.5 text-xs rounded-xl bg-base-900 border border-base-700 text-ink-100 placeholder-ink-500 focus:outline-none focus:border-accent-500 resize-none"
                />
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={loadingComment || !newComment.trim()}
                    className="px-4 py-2 text-xs font-semibold rounded-xl bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white transition-colors"
                  >
                    {loadingComment ? "Posting..." : "Post Comment"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeTab === "activity" && (
            <div className="space-y-3">
              {activities.length === 0 ? (
                <p className="text-xs text-ink-500 text-center py-6 bg-base-800/40 rounded-xl border border-base-700/50">
                  No activity history recorded yet.
                </p>
              ) : (
                <div className="relative pl-4 space-y-4 border-l border-base-700/60">
                  {activities.map((a) => (
                    <div key={a.id} className="relative text-xs space-y-1">
                      <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-accent-500 border-2 border-base-900" />
                      <div className="flex items-center justify-between text-ink-400">
                        <span className="font-medium text-ink-200 capitalize">
                          {a.action.replace(/_/g, " ")}
                        </span>
                        <span className="text-[10px] text-ink-500">
                          {new Date(a.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      {a.metadata && Object.keys(a.metadata).length > 0 && (
                        <p className="text-[11px] text-ink-400 bg-base-800/40 px-2.5 py-1.5 rounded-lg border border-base-750 font-mono">
                          {JSON.stringify(a.metadata)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sticky Footer with Primary Save Button */}
        <div className="px-6 py-4 border-t border-base-700/60 bg-base-850 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            {savedToast ? (
              <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5 animate-pulse">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Changes saved successfully!
              </span>
            ) : (
              <span className="text-xs text-ink-400">
                Task status: <span className="text-ink-200 font-medium capitalize">{status.replace(/_/g, " ")}</span> ({progress}%)
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-ink-300 hover:text-ink-100 bg-base-800 hover:bg-base-750 border border-base-700 rounded-xl transition-colors"
            >
              Close
            </button>
            {canEditTask && (
              <button
                onClick={() => handleSaveStatus(status, progress)}
                disabled={saving}
                className="px-5 py-2 text-xs font-semibold text-white bg-gradient-to-r from-accent-500 to-cyan-500 hover:from-accent-600 hover:to-cyan-600 rounded-xl shadow-lg shadow-accent-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Saving...
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                      <polyline points="17 21 17 13 7 13 7 21" />
                      <polyline points="7 3 7 8 15 8" />
                    </svg>
                    Save Changes
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
