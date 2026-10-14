import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../lib/AuthContext";
import {
  Task,
  fetchTasks,
  updateTask,
  isTaskOverdue,
  isTaskDueSoon,
} from "../lib/taskService";
import TaskDetailsModal from "./TaskDetailsModal";
import TiltCard from "../components/TiltCard";

export default function EmployeeTasksPage() {
  const { organization, user, profile } = useAuth();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "in_progress" | "completed" | "overdue">("all");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  useEffect(() => {
    if (organization && user) {
      loadMyTasks();
    }
  }, [organization, user]);

  async function loadMyTasks() {
    setLoading(true);
    try {
      const data = await fetchTasks(organization!.id, user!.id);
      setTasks(data);
    } catch (err) {
      console.warn("Error fetching employee tasks", err);
    } finally {
      setLoading(false);
    }
  }

  // Filtered task lists
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (activeTab === "in_progress" && t.status !== "in_progress") return false;
      if (activeTab === "completed" && t.status !== "completed") return false;
      if (activeTab === "overdue" && !isTaskOverdue(t)) return false;
      return true;
    });
  }, [tasks, activeTab]);

  const totalCount = tasks.length;
  const inProgressCount = tasks.filter((t) => t.status === "in_progress").length;
  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const overdueCount = tasks.filter((t) => isTaskOverdue(t)).length;

  const priorityStyles: Record<string, { bg: string; text: string; border: string }> = {
    low: { bg: "bg-slate-500/10", text: "text-slate-300", border: "border-slate-500/30" },
    medium: { bg: "bg-cyan-500/10", text: "text-cyan-300", border: "border-cyan-500/30" },
    high: { bg: "bg-amber-500/15", text: "text-amber-300 font-bold", border: "border-amber-500/40" },
    urgent: { bg: "bg-rose-500/20", text: "text-rose-300 font-extrabold", border: "border-rose-500/50" },
  };

  const statusStyles: Record<string, { bg: string; text: string; dot: string }> = {
    todo: { bg: "bg-zinc-500/10 text-zinc-300 border-zinc-500/30", text: "To Do", dot: "bg-zinc-400" },
    in_progress: { bg: "bg-cyan-500/15 text-cyan-300 font-semibold border-cyan-500/40", text: "In Progress", dot: "bg-cyan-400 shadow-[0_0_8px_#2dd4bf]" },
    blocked: { bg: "bg-rose-500/15 text-rose-300 font-semibold border-rose-500/40", text: "Blocked", dot: "bg-rose-400" },
    completed: { bg: "bg-emerald-500/15 text-emerald-300 font-semibold border-emerald-500/40", text: "Completed", dot: "bg-emerald-400" },
    cancelled: { bg: "bg-slate-700/30 text-slate-400 border-slate-700", text: "Cancelled", dot: "bg-slate-500" },
  };

  function getPriorityStyle(p?: string) {
    const key = (p || "medium").toLowerCase();
    return priorityStyles[key] || priorityStyles.medium;
  }

  function getStatusStyle(s?: string) {
    const key = (s || "todo").toLowerCase().replace(/[\s-]+/g, "_");
    return statusStyles[key] || statusStyles.todo;
  }

  async function handleQuickComplete(task: Task, e: React.MouseEvent) {
    e.stopPropagation();
    if (!user) return;
    await updateTask(
      task.id,
      {
        organization_id: task.organization_id,
        title: task.title,
        status: "completed",
        progress: 100,
      },
      user.id,
      profile?.role || "employee"
    );
    loadMyTasks();
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto page-enter animate-fade-in p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap mb-1">
            <h1 className="font-spacex text-xl lg:text-2xl font-black text-ink-100 uppercase tracking-wider">
              MY DELIVERABLES & TASKS
            </h1>
            <span className="px-3.5 py-1 rounded-full text-[10px] font-spacex font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 tracking-widest uppercase shadow-[0_0_12px_rgba(45,212,191,0.2)]">
              WORKPLACE ASSIGNMENTS
            </span>
          </div>
          <p className="text-ink-400 text-xs font-medium leading-relaxed">
            Track your assigned work orders, checklist progress, comments, and complete deliverables.
          </p>
        </div>
      </div>

      {/* TiltCard KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <TiltCard className="glass-card p-6 lg:p-7 rounded-3xl relative overflow-hidden group shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <span className="font-spacex text-[10px] font-bold text-ink-400 uppercase tracking-widest">
              TOTAL ASSIGNED
            </span>
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform shadow-[0_0_15px_rgba(45,212,191,0.2)]">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
          </div>
          <div className="font-spacex text-3xl lg:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-teal-300 via-cyan-200 to-blue-400 mb-1.5">
            {totalCount}
          </div>
          <p className="text-xs text-ink-400">All work orders</p>
        </TiltCard>

        <TiltCard className="glass-card p-6 lg:p-7 rounded-3xl relative overflow-hidden group shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <span className="font-spacex text-[10px] font-bold text-cyan-400 uppercase tracking-widest">
              IN PROGRESS
            </span>
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-300 group-hover:scale-110 transition-transform shadow-[0_0_15px_rgba(45,212,191,0.2)]">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
          </div>
          <div className="font-spacex text-3xl lg:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-blue-400 mb-1.5">
            {inProgressCount}
          </div>
          <p className="text-xs text-ink-400">Active execution</p>
        </TiltCard>

        <TiltCard className="glass-card p-6 lg:p-7 rounded-3xl relative overflow-hidden group shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <span className="font-spacex text-[10px] font-bold text-emerald-400 uppercase tracking-widest">
              COMPLETED
            </span>
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform shadow-[0_0_15px_rgba(52,211,153,0.2)]">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
          </div>
          <div className="font-spacex text-3xl lg:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 to-teal-300 mb-1.5">
            {completedCount}
          </div>
          <p className="text-xs text-ink-400">Verified & closed</p>
        </TiltCard>

        <TiltCard className={`glass-card p-6 lg:p-7 rounded-3xl relative overflow-hidden group shadow-xl ${overdueCount > 0 ? "border-rose-500/40 bg-rose-500/10" : ""}`}>
          <div className="flex items-center justify-between mb-4">
            <span className="font-spacex text-[10px] font-bold text-rose-400 uppercase tracking-widest">
              OVERDUE
            </span>
            <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 group-hover:scale-110 transition-transform shadow-[0_0_15px_rgba(244,63,94,0.2)]">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
          </div>
          <div className="font-spacex text-3xl lg:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-rose-300 to-amber-300 mb-1.5">
            {overdueCount}
          </div>
          <p className="text-xs text-ink-400">Requires attention</p>
        </TiltCard>
      </div>

      {/* Sleek Pill Tab Selector */}
      <div className="flex items-center gap-2 p-2 rounded-2xl glass-card w-fit overflow-x-auto shadow-xl">
        {[
          { id: "all", label: `ALL TASKS (${totalCount})` },
          { id: "in_progress", label: `IN PROGRESS (${inProgressCount})` },
          { id: "completed", label: `COMPLETED (${completedCount})` },
          { id: "overdue", label: `OVERDUE (${overdueCount})` },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-5 py-2.5 rounded-xl text-xs font-spacex font-bold transition-all duration-300 uppercase tracking-wider ${
              activeTab === tab.id
                ? "bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/25"
                : "text-ink-400 hover:text-ink-100 hover:bg-white/[0.04]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tasks List */}
      {loading ? (
        <div className="glass-card p-16 text-center text-ink-400 text-xs font-spacex flex items-center justify-center gap-3 rounded-3xl">
          <span>SYNCING WORKPLACE DELIVERABLES...</span>
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="glass-card p-16 rounded-3xl text-center space-y-4 shadow-2xl bg-white/[0.01]">
          <div className="w-16 h-16 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mx-auto shadow-[0_0_20px_rgba(45,212,191,0.2)]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <h3 className="font-spacex text-base font-bold text-ink-100 uppercase tracking-wider">NO TASKS FOUND IN THIS VIEW</h3>
          <p className="text-xs text-ink-400 max-w-sm mx-auto leading-relaxed">You currently have no tasks matching the selected tab filter.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredTasks.map((t) => {
            const overdue = isTaskOverdue(t);
            const dueSoon = isTaskDueSoon(t);
            const pStyle = getPriorityStyle(t.priority);
            const sStyle = getStatusStyle(t.status);

            return (
              <div
                key={t.id}
                onClick={() => setSelectedTask(t)}
                className="group glass-card p-6 rounded-2xl hover:border-cyan-400/50 transition-all duration-300 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-6"
              >
                <div className="min-w-0 flex-1 space-y-2.5">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className={`px-2.5 py-0.5 text-[10px] font-spacex font-bold rounded-full border ${pStyle.bg} ${pStyle.text} ${pStyle.border}`}>
                      {(t.priority || "medium").toUpperCase()}
                    </span>
                    <span className={`px-2.5 py-0.5 text-[10px] font-semibold rounded-full border flex items-center gap-1.5 ${sStyle.bg}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${sStyle.dot}`} />
                      {sStyle.text}
                    </span>
                    {overdue && (
                      <span className="px-2.5 py-0.5 text-[10px] font-spacex font-bold rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
                        ⚠ OVERDUE
                      </span>
                    )}
                    {dueSoon && !overdue && (
                      <span className="px-2.5 py-0.5 text-[10px] font-semibold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        ⏳ DUE SOON
                      </span>
                    )}
                  </div>

                  <h3 className="text-base font-spacex font-bold text-ink-100 group-hover:text-cyan-300 transition-colors uppercase tracking-wider">
                    {t.title}
                  </h3>

                  {t.description && (
                    <p className="text-xs text-ink-400 line-clamp-2 leading-relaxed">{t.description}</p>
                  )}

                  <div className="flex items-center gap-5 text-xs text-ink-400 flex-wrap pt-1 font-mono">
                    {t.creator && (
                      <span>Created by: <span className="text-ink-200 font-sans">{t.creator.full_name || t.creator.email}</span></span>
                    )}
                    {t.due_date && (
                      <span>
                        Due: <span className={overdue ? "text-rose-400 font-semibold" : "text-ink-200 font-sans"}>
                          {new Date(t.due_date).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </span>
                    )}
                    {t.checklist && t.checklist.length > 0 && (
                      <span>
                        Checklist: {t.checklist.filter((i) => i.completed).length}/{t.checklist.length}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right side: Progress & Actions */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 shrink-0 border-t md:border-t-0 pt-4 md:pt-0 border-base-750/50">
                  <div className="w-36 space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-medium font-spacex">
                      <span className="text-ink-400">PROGRESS</span>
                      <span className="text-cyan-300 font-bold">{t.progress}%</span>
                    </div>
                    <div className="w-full bg-base-950 h-2.5 rounded-full overflow-hidden border border-base-700/60 p-0.5">
                      <div
                        className="h-full bg-gradient-to-r from-teal-400 via-cyan-400 to-blue-500 rounded-full transition-all duration-300"
                        style={{ width: `${t.progress}%` }}
                      />
                    </div>
                  </div>

                  {t.status !== "completed" && (
                    <button
                      onClick={(e) => handleQuickComplete(t, e)}
                      className="btn-glass px-4 py-2 text-xs font-spacex text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/20"
                    >
                      ✓ COMPLETE
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Task Details Modal */}
      <TaskDetailsModal
        task={selectedTask}
        isOpen={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        onTaskUpdated={loadMyTasks}
      />
    </div>
  );
}

