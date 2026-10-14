import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../lib/AuthContext";
import {
  Task,
  fetchTasks,
  deleteTask,
  isTaskOverdue,
  isTaskDueSoon,
} from "../lib/taskService";
import TiltCard from "../components/TiltCard";
import AnimatedCounter from "../components/AnimatedCounter";
import CreateTaskModal from "./CreateTaskModal";
import TaskDetailsModal from "./TaskDetailsModal";

export default function TasksPage() {
  const { organization, user, profile } = useAuth();
  const isOwnerOrAdmin = profile?.role === "owner" || profile?.role === "admin" || profile?.role === "manager" || profile?.role === "hr";

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & View
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [activeTab, setActiveTab] = useState<"all" | "assigned" | "completed" | "overdue">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedPriority, setSelectedPriority] = useState<string>("all");
  const [selectedEmployee, setSelectedEmployee] = useState<string>("all");
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all");

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedTaskForDetails, setSelectedTaskForDetails] = useState<Task | null>(null);

  useEffect(() => {
    if (organization) {
      loadTasksData();
    }
  }, [organization]);

  async function loadTasksData() {
    setLoading(true);
    try {
      const data = await fetchTasks(organization!.id);
      setTasks(data);
    } catch (err) {
      console.warn("Failed to load tasks", err);
    } finally {
      setLoading(false);
    }
  }

  // Derive unique employees and departments for filters
  const employeeOptions = useMemo(() => {
    const map = new Map<string, string>();
    tasks.forEach((t) => {
      if (t.assignee && t.assignee.id) {
        map.set(t.assignee.id, t.assignee.full_name || t.assignee.email);
      }
    });
    return Array.from(map.entries());
  }, [tasks]);

  const departmentOptions = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach((t) => {
      if (t.department) set.add(t.department);
    });
    return Array.from(set);
  }, [tasks]);

  // Derived metrics
  const totalCount = tasks.length;
  const pendingCount = tasks.filter((t) => t.status === "todo").length;
  const inProgressCount = tasks.filter((t) => t.status === "in_progress").length;
  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const overdueCount = tasks.filter((t) => isTaskOverdue(t)).length;
  const dueSoonCount = tasks.filter((t) => isTaskDueSoon(t)).length;

  // Filtered task list
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      // Tab filter
      if (activeTab === "assigned" && t.assigned_to !== user?.id) return false;
      if (activeTab === "completed" && t.status !== "completed") return false;
      if (activeTab === "overdue" && !isTaskOverdue(t)) return false;

      // Dropdown filters
      if (selectedStatus !== "all" && t.status !== selectedStatus) return false;
      if (selectedPriority !== "all" && t.priority !== selectedPriority) return false;
      if (selectedEmployee !== "all" && t.assigned_to !== selectedEmployee) return false;
      if (selectedDepartment !== "all" && t.department !== selectedDepartment) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const titleMatch = t.title.toLowerCase().includes(q);
        const descMatch = t.description?.toLowerCase().includes(q);
        const tagMatch = t.tags?.some((tag) => tag.toLowerCase().includes(q));
        const empMatch = t.assignee?.full_name?.toLowerCase().includes(q) || t.assignee?.email.toLowerCase().includes(q);
        if (!titleMatch && !descMatch && !tagMatch && !empMatch) return false;
      }

      return true;
    });
  }, [tasks, activeTab, selectedStatus, selectedPriority, selectedEmployee, selectedDepartment, searchQuery, user]);

  const priorityStyles: Record<string, { bg: string; text: string; border: string }> = {
    low: { bg: "bg-slate-500/20", text: "text-slate-300", border: "border-slate-500/40" },
    medium: { bg: "bg-blue-500/20", text: "text-blue-300", border: "border-blue-500/40" },
    high: { bg: "bg-amber-500/20", text: "text-amber-300 font-bold", border: "border-amber-500/50" },
    urgent: { bg: "bg-rose-500/25", text: "text-rose-300 font-extrabold", border: "border-rose-500/60" },
  };

  const statusStyles: Record<string, { bg: string; text: string; dot: string }> = {
    todo: { bg: "bg-zinc-500/20 text-zinc-200 border-zinc-500/40", text: "To Do", dot: "bg-zinc-300" },
    in_progress: { bg: "bg-cyan-500/20 text-cyan-300 font-semibold border-cyan-500/40", text: "In Progress", dot: "bg-cyan-400" },
    blocked: { bg: "bg-rose-500/20 text-rose-300 font-semibold border-rose-500/50", text: "Blocked", dot: "bg-rose-400" },
    completed: { bg: "bg-emerald-500/20 text-emerald-300 font-semibold border-emerald-500/40", text: "Completed", dot: "bg-emerald-400" },
    cancelled: { bg: "bg-slate-700/40 text-slate-300 border-slate-600", text: "Cancelled", dot: "bg-slate-400" },
  };

  function getPriorityStyle(p?: string) {
    const key = (p || "medium").toLowerCase();
    return priorityStyles[key] || priorityStyles.medium;
  }

  function getStatusStyle(s?: string) {
    const key = (s || "todo").toLowerCase().replace(/[\s-]+/g, "_");
    return statusStyles[key] || statusStyles.todo;
  }

  async function handleDeleteTask(taskId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this task?")) return;
    await deleteTask(taskId, organization!.id);
    loadTasksData();
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8 animate-fade-in-up">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-base-700/40">
        <div>
          <h1 className="text-2xl font-extrabold text-ink-100 tracking-tight flex items-center gap-3">
            <span>Task Management</span>
            <span className="px-3 py-1 text-xs font-semibold rounded-full bg-accent-500/15 text-accent-400 border border-accent-500/30">
              Workspace Overview
            </span>
          </h1>
          <p className="text-xs text-ink-400 mt-1.5 leading-relaxed">
            Create, assign, monitor deadlines, and track workplace task completion across departments.
          </p>
        </div>

        {isOwnerOrAdmin && (
          <button
            onClick={() => setIsCreateOpen(true)}
            className="group flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-accent-500 to-teal-500 hover:from-accent-600 hover:to-teal-600 text-white font-semibold text-xs shadow-lg shadow-accent-500/20 transition-all duration-200 transform hover:-translate-y-0.5 shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Create Task</span>
          </button>
        )}
      </div>

      {/* 3D Perspective Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <TiltCard className="rounded-2xl">
          <div className="p-5 rounded-2xl border border-base-700/60 bg-base-850/80 hover:border-accent-500/40 transition-colors flex flex-col justify-between h-full min-h-[105px]">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Total Tasks</span>
            <div className="text-2xl font-extrabold text-ink-100 my-1">
              <AnimatedCounter value={totalCount} />
            </div>
            <span className="text-[10px] text-ink-500 truncate">All registered tasks</span>
          </div>
        </TiltCard>

        <TiltCard className="rounded-2xl">
          <div className="p-5 rounded-2xl border border-base-700/60 bg-base-850/80 hover:border-zinc-500/40 transition-colors flex flex-col justify-between h-full min-h-[105px]">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">To Do</span>
            <div className="text-2xl font-extrabold text-zinc-200 my-1">
              <AnimatedCounter value={pendingCount} />
            </div>
            <span className="text-[10px] text-zinc-500 truncate">Pending start</span>
          </div>
        </TiltCard>

        <TiltCard className="rounded-2xl">
          <div className="p-5 rounded-2xl border border-cyan-500/30 bg-cyan-500/5 hover:border-cyan-500/50 transition-colors flex flex-col justify-between h-full min-h-[105px]">
            <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">In Progress</span>
            <div className="text-2xl font-extrabold text-cyan-300 my-1">
              <AnimatedCounter value={inProgressCount} />
            </div>
            <span className="text-[10px] text-cyan-400/70 truncate">Actively worked on</span>
          </div>
        </TiltCard>

        <TiltCard className="rounded-2xl">
          <div className="p-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/50 transition-colors flex flex-col justify-between h-full min-h-[105px]">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Completed</span>
            <div className="text-2xl font-extrabold text-emerald-300 my-1">
              <AnimatedCounter value={completedCount} />
            </div>
            <span className="text-[10px] text-emerald-400/70 truncate">Finished work</span>
          </div>
        </TiltCard>

        <TiltCard className="rounded-2xl">
          <div className={`p-5 rounded-2xl border transition-colors flex flex-col justify-between h-full min-h-[105px] ${overdueCount > 0 ? "border-rose-500/50 bg-rose-500/10" : "border-base-700/60 bg-base-850/80"}`}>
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400">Overdue</span>
            <div className="text-2xl font-extrabold text-rose-300 my-1">
              <AnimatedCounter value={overdueCount} />
            </div>
            <span className="text-[10px] text-rose-400/70 truncate">Past deadline</span>
          </div>
        </TiltCard>

        <TiltCard className="rounded-2xl">
          <div className="p-5 rounded-2xl border border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50 transition-colors flex flex-col justify-between h-full min-h-[105px]">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Due Soon</span>
            <div className="text-2xl font-extrabold text-amber-300 my-1">
              <AnimatedCounter value={dueSoonCount} />
            </div>
            <span className="text-[10px] text-amber-400/70 truncate">Within 3 days</span>
          </div>
        </TiltCard>
      </div>

      {/* Tabs Bar & Filters Container */}
      <div className="p-6 rounded-2xl bg-base-850/90 border border-base-700/70 space-y-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          {/* Main Navigation Tabs */}
          <div className="flex items-center gap-2 p-1.5 rounded-xl bg-base-900 border border-base-700/60 overflow-x-auto shrink-0">
            {[
              { id: "all", label: `All Tasks (${totalCount})` },
              { id: "assigned", label: "My Assigned" },
              { id: "completed", label: `Completed (${completedCount})` },
              { id: "overdue", label: `Overdue (${overdueCount})` },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200 whitespace-nowrap ${
                  activeTab === tab.id
                    ? "bg-accent-500 text-white shadow-md shadow-accent-500/20"
                    : "text-ink-400 hover:text-ink-100 hover:bg-base-800"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* View Toggle */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-base-900 border border-base-700/60 shrink-0">
            <button
              onClick={() => setViewMode("table")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                viewMode === "table"
                  ? "bg-accent-500 text-white shadow-md shadow-accent-500/20"
                  : "text-ink-400 hover:text-ink-100 hover:bg-base-800"
              }`}
            >
              <span>📑 Table View</span>
            </button>
            <button
              onClick={() => setViewMode("cards")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                viewMode === "cards"
                  ? "bg-accent-500 text-white shadow-md shadow-accent-500/20"
                  : "text-ink-400 hover:text-ink-100 hover:bg-base-800"
              }`}
            >
              <span>📊 Cards View</span>
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative flex-1 max-w-lg">
            <svg
              className="absolute left-3.5 top-3 w-4 h-4 text-ink-400 pointer-events-none"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by task title, tags, or assignee name..."
              className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl bg-base-900 border border-base-700/70 text-ink-100 placeholder-ink-500 focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500/30 transition-colors"
            />
          </div>
        </div>

        {/* Dropdown Filters Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-base-700/50">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-400 mb-1.5">
              Filter Status
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-3.5 py-2 text-xs rounded-xl bg-base-900 border border-base-700/70 text-ink-200 focus:outline-none focus:border-accent-500 cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="todo">To Do</option>
              <option value="in_progress">In Progress</option>
              <option value="blocked">Blocked</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-400 mb-1.5">
              Filter Priority
            </label>
            <select
              value={selectedPriority}
              onChange={(e) => setSelectedPriority(e.target.value)}
              className="w-full px-3.5 py-2 text-xs rounded-xl bg-base-900 border border-base-700/70 text-ink-200 focus:outline-none focus:border-accent-500 cursor-pointer"
            >
              <option value="all">All Priorities</option>
              <option value="low">Low Priority</option>
              <option value="medium">Medium Priority</option>
              <option value="high">High Priority</option>
              <option value="urgent">Urgent Priority</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-400 mb-1.5">
              Filter Employee
            </label>
            <select
              value={selectedEmployee}
              onChange={(e) => setSelectedEmployee(e.target.value)}
              className="w-full px-3.5 py-2 text-xs rounded-xl bg-base-900 border border-base-700/70 text-ink-200 focus:outline-none focus:border-accent-500 cursor-pointer truncate"
            >
              <option value="all">All Employees</option>
              {employeeOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-400 mb-1.5">
              Filter Department
            </label>
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="w-full px-3.5 py-2 text-xs rounded-xl bg-base-900 border border-base-700/70 text-ink-200 focus:outline-none focus:border-accent-500 cursor-pointer truncate"
            >
              <option value="all">All Departments</option>
              {departmentOptions.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tasks Grid/Table */}
      {loading ? (
        <div className="p-12 text-center text-ink-400 text-xs">Loading workplace tasks...</div>
      ) : filteredTasks.length === 0 ? (
        <div className="p-12 rounded-2xl bg-base-850/60 border border-base-700/60 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-base-800 border border-base-700 flex items-center justify-center mx-auto text-ink-500">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <line x1="7" y1="8" x2="17" y2="8" />
              <line x1="7" y1="12" x2="13" y2="12" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-ink-200">No tasks found</p>
          <p className="text-xs text-ink-400 max-w-sm mx-auto">
            Try adjusting your search or filters, or create a new task using the button above.
          </p>
        </div>
      ) : viewMode === "table" ? (
        <div className="rounded-2xl bg-base-850/90 border border-base-700/70 overflow-hidden shadow-2xl backdrop-blur-md">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-ink-200">
              <thead className="bg-base-900/95 text-ink-300 font-bold uppercase text-[11px] tracking-wider border-b border-base-700/60 font-sans">
                <tr>
                  <th className="py-4 px-5">Task Title & Details</th>
                  <th className="py-4 px-5">Assignee</th>
                  <th className="py-4 px-5">Status</th>
                  <th className="py-4 px-5">Priority</th>
                  <th className="py-4 px-5">Progress</th>
                  <th className="py-4 px-5">Due Date</th>
                  <th className="py-4 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-base-700/50">
                {filteredTasks.map((t) => {
                  const overdue = isTaskOverdue(t);
                  const pStyle = getPriorityStyle(t.priority);
                  const sStyle = getStatusStyle(t.status);
                  const assigneeName = t.assignee?.full_name || t.assignee?.email || "Unassigned";
                  const initial = assigneeName[0].toUpperCase();

                  return (
                    <tr
                      key={t.id}
                      onClick={() => setSelectedTaskForDetails(t)}
                      className="hover:bg-base-800/70 transition-all duration-150 cursor-pointer group"
                    >
                      <td className="py-4 px-5 max-w-sm">
                        <div className="font-bold text-sm text-ink-100 group-hover:text-accent-400 transition-colors font-sans">
                          {t.title}
                        </div>
                        {t.description && (
                          <p className="text-xs text-ink-400 truncate mt-0.5 font-normal leading-relaxed">{t.description}</p>
                        )}
                        {t.tags && t.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {t.tags.map((tag, idx) => (
                              <span key={idx} className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-base-800 text-ink-300 border border-base-700/50">
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-5 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-accent-500/20 border border-accent-500/30 flex items-center justify-center text-xs font-bold text-accent-300 shrink-0">
                            {initial}
                          </div>
                          <div>
                            <span className="font-semibold text-xs text-ink-100 font-sans block">
                              {assigneeName}
                            </span>
                            {t.department && (
                              <span className="text-[10px] text-ink-400 font-mono block">
                                {t.department}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-5 whitespace-nowrap">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold border flex items-center gap-2 w-fit ${sStyle.bg}`}>
                          <span className={`w-2 h-2 rounded-full ${sStyle.dot}`} />
                          {sStyle.text}
                        </span>
                      </td>
                      <td className="py-4 px-5 whitespace-nowrap">
                        <span className={`px-3 py-1 text-[11px] font-bold rounded-lg border uppercase tracking-wider ${pStyle.bg} ${pStyle.text} ${pStyle.border}`}>
                          {(t.priority || "medium").toUpperCase()}
                        </span>
                      </td>
                      <td className="py-4 px-5 whitespace-nowrap w-36">
                        <div className="flex items-center gap-2.5">
                          <div className="w-20 bg-base-950 h-2 rounded-full overflow-hidden border border-base-700/50">
                            <div
                              className="h-full bg-gradient-to-r from-accent-500 to-teal-400 rounded-full transition-all duration-300"
                              style={{ width: `${t.progress}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold font-mono text-accent-400">{t.progress}%</span>
                        </div>
                      </td>
                      <td className="py-4 px-5 whitespace-nowrap">
                        {t.due_date ? (
                          <span className={`font-mono text-xs ${overdue ? "text-rose-400 font-bold flex items-center gap-1" : "text-ink-200"}`}>
                            {new Date(t.due_date).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                            {overdue && " ⚠"}
                          </span>
                        ) : (
                          <span className="text-ink-500 font-mono text-xs">—</span>
                        )}
                      </td>
                      <td className="py-4 px-5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setSelectedTaskForDetails(t)}
                            className="px-3 py-1.5 rounded-xl bg-base-800 hover:bg-base-750 border border-base-700 text-ink-200 hover:text-ink-100 text-xs font-medium transition-all shadow-sm"
                          >
                            Details
                          </button>
                          {isOwnerOrAdmin && (
                            <button
                              onClick={(e) => handleDeleteTask(t.id, e)}
                              className="p-1.5 rounded-xl text-ink-400 hover:text-rose-400 hover:bg-rose-500/15 transition-all"
                              title="Delete task"
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTasks.map((t) => {
            const overdue = isTaskOverdue(t);
            const dueSoon = isTaskDueSoon(t);
            const pStyle = getPriorityStyle(t.priority);
            const sStyle = getStatusStyle(t.status);

            return (
              <div
                key={t.id}
                onClick={() => setSelectedTaskForDetails(t)}
                className="group relative rounded-2xl bg-base-850/80 border border-base-700/70 p-5 hover:border-accent-500/50 hover:bg-base-800 transition-all duration-300 cursor-pointer shadow-lg hover:shadow-accent-500/5 flex flex-col justify-between"
              >
                <div>
                  {/* Badges bar */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md border ${pStyle.bg} ${pStyle.text} ${pStyle.border}`}>
                        {(t.priority || "medium").toUpperCase()}
                      </span>
                      <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-md border flex items-center gap-1 ${sStyle.bg}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sStyle.dot}`} />
                        {sStyle.text}
                      </span>
                    </div>

                    {isOwnerOrAdmin && (
                      <button
                        onClick={(e) => handleDeleteTask(t.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-ink-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                        title="Delete task"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Title & Description */}
                  <h3 className="text-sm font-bold text-ink-100 group-hover:text-accent-400 transition-colors line-clamp-2">
                    {t.title}
                  </h3>
                  {t.description && (
                    <p className="text-xs text-ink-400 mt-1 line-clamp-2 leading-relaxed">
                      {t.description}
                    </p>
                  )}

                  {/* Tags */}
                  {t.tags && t.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {t.tags.map((tag, idx) => (
                        <span key={idx} className="px-2 py-0.5 text-[10px] rounded-full bg-base-750 text-ink-300 font-mono">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-5 pt-4 border-t border-base-700/50 space-y-3">
                  {/* Progress Bar */}
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-medium mb-1">
                      <span className="text-ink-400">Progress</span>
                      <span className="text-accent-400 font-semibold">{t.progress}%</span>
                    </div>
                    <div className="w-full bg-base-950 h-1.5 rounded-full overflow-hidden border border-base-700/40">
                      <div
                        className="h-full bg-gradient-to-r from-accent-500 to-teal-400 transition-all duration-300 rounded-full"
                        style={{ width: `${t.progress}%` }}
                      />
                    </div>
                  </div>

                  {/* Footer metadata */}
                  <div className="flex items-center justify-between text-xs pt-1">
                    {/* Assignee */}
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-accent-500/20 border border-accent-500/30 flex items-center justify-center text-[10px] font-bold text-accent-300 shrink-0">
                        {(t.assignee?.full_name || t.assignee?.email || "U")[0].toUpperCase()}
                      </div>
                      <span className="text-ink-300 text-[11px] font-medium truncate">
                        {t.assignee?.full_name || t.assignee?.email || "Unassigned"}
                      </span>
                    </div>

                    {/* Due Date Indicator */}
                    {t.due_date && (
                      <div className="flex items-center gap-1 text-[11px] shrink-0">
                        {overdue ? (
                          <span className="text-rose-400 font-semibold flex items-center gap-1">
                            <span>⚠</span>
                            {new Date(t.due_date).toLocaleDateString([], { month: "short", day: "numeric" })}
                          </span>
                        ) : dueSoon ? (
                          <span className="text-amber-400 font-semibold flex items-center gap-1">
                            <span>⏳</span>
                            {new Date(t.due_date).toLocaleDateString([], { month: "short", day: "numeric" })}
                          </span>
                        ) : (
                          <span className="text-ink-400">
                            {new Date(t.due_date).toLocaleDateString([], { month: "short", day: "numeric" })}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      <CreateTaskModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onTaskCreated={loadTasksData}
      />

      <TaskDetailsModal
        task={selectedTaskForDetails}
        isOpen={!!selectedTaskForDetails}
        onClose={() => setSelectedTaskForDetails(null)}
        onTaskUpdated={loadTasksData}
      />
    </div>
  );
}
