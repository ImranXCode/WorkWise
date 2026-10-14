import { useState, useEffect, FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthContext";
import { createTask, TaskPriority, ChecklistItem } from "../lib/taskService";

interface EmployeeOption {
  id: string;
  full_name: string | null;
  email: string;
  department: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onTaskCreated: () => void;
}

export default function CreateTaskModal({ isOpen, onClose, onTaskCreated }: Props) {
  const { organization, user } = useAuth();

  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [department, setDepartment] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [estimatedHours, setEstimatedHours] = useState<number>(0);
  const [tagsInput, setTagsInput] = useState("");
  const [checklistItems, setChecklistItems] = useState<string[]>([]);
  const [checkInput, setCheckInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && organization) {
      loadOrganizationEmployees();
    }
  }, [isOpen, organization]);

  async function loadOrganizationEmployees() {
    setLoadingEmployees(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, department")
        .eq("organization_id", organization!.id)
        .order("full_name", { ascending: true });

      if (!error && data) {
        setEmployees(data);
      }
    } catch (err) {
      console.warn("Could not load employees for task modal", err);
    } finally {
      setLoadingEmployees(false);
    }
  }

  if (!isOpen) return null;

  function handleAddSubtask() {
    if (!checkInput.trim()) return;
    setChecklistItems([...checklistItems, checkInput.trim()]);
    setCheckInput("");
  }

  function handleRemoveSubtask(idx: number) {
    setChecklistItems(checklistItems.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Task title is required.");
      return;
    }
    if (!organization || !user) {
      setError("Organization or session error.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const parsedTags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const formattedChecklist: ChecklistItem[] = checklistItems.map((text) => ({
      id: crypto.randomUUID(),
      text,
      completed: false,
    }));

    try {
      await createTask(
        {
          organization_id: organization.id,
          title: title.trim(),
          description: description.trim() || null,
          assigned_to: assignedTo || null,
          created_by: user.id,
          priority,
          status: "todo",
          progress: 0,
          blocked_reason: null,
          start_date: new Date().toISOString(),
          due_date: dueDate ? new Date(dueDate).toISOString() : null,
          estimated_hours: estimatedHours || 0,
          department: department.trim() || null,
          tags: parsedTags,
          checklist: formattedChecklist,
        },
        user.id
      );

      // Reset form
      setTitle("");
      setDescription("");
      setAssignedTo("");
      setDepartment("");
      setPriority("medium");
      setDueDate("");
      setEstimatedHours(0);
      setTagsInput("");
      setChecklistItems([]);
      setCheckInput("");

      onTaskCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to create task.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="glass-modal-backdrop" onClick={onClose}>
      <div
        className="w-full max-w-xl bg-base-900 border border-base-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-base-700/60 bg-base-900/60 backdrop-blur-md flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-spacex font-bold text-ink-100 uppercase tracking-wider">Create New Task</h3>
              <p className="text-[11px] text-ink-400">Assign work, set deadlines, and track completion</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-ink-400 hover:text-ink-100 hover:bg-base-700/40 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              {error}
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-[11px] font-semibold text-ink-300 uppercase tracking-wider mb-1.5">
              Task Title <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Prepare Q4 Security Audit & Access Logs"
              className="glass-input"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-[11px] font-semibold text-ink-300 uppercase tracking-wider mb-1.5">Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detailed instructions, requirements, and deliverables..."
              className="glass-input resize-none py-2.5 h-24"
            />
          </div>

          {/* Grid: Assignee & Department */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-ink-300 uppercase tracking-wider mb-1.5">Assign To Employee</label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="glass-input"
              >
                <option value="" className="bg-base-900 text-ink-100">{loadingEmployees ? "Loading employees..." : "-- Select Employee --"}</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id} className="bg-base-900 text-ink-100">
                    {emp.full_name || emp.email} {emp.department ? `(${emp.department})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-ink-300 uppercase tracking-wider mb-1.5">Department (Optional)</label>
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g. Engineering, Operations"
                className="glass-input"
              />
            </div>
          </div>

          {/* Grid: Priority & Due Date */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-ink-300 uppercase tracking-wider mb-1.5">Priority Level</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="glass-input"
              >
                <option value="low" className="bg-base-900 text-ink-100">Low Priority</option>
                <option value="medium" className="bg-base-900 text-ink-100">Medium Priority</option>
                <option value="high" className="bg-base-900 text-ink-100">High Priority</option>
                <option value="urgent" className="bg-base-900 text-ink-100">Urgent</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-ink-300 uppercase tracking-wider mb-1.5">Due Date & Time</label>
              <input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="glass-input"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-ink-300 uppercase tracking-wider mb-1.5">Est. Hours</label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={estimatedHours || ""}
                onChange={(e) => setEstimatedHours(Number(e.target.value))}
                placeholder="e.g. 4"
                className="glass-input"
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-[11px] font-semibold text-ink-300 uppercase tracking-wider mb-1.5">
              Tags <span className="text-ink-500 font-normal lowercase">(comma separated)</span>
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="e.g. Urgent, Security, Q4, Internal"
              className="glass-input"
            />
          </div>

          {/* Subtask Checklist */}
          <div>
            <label className="block text-[11px] font-semibold text-ink-300 uppercase tracking-wider mb-1.5">
              Subtasks / Checklist Items
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={checkInput}
                onChange={(e) => setCheckInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddSubtask();
                  }
                }}
                placeholder="Add subtask step..."
                className="glass-input flex-1"
              />
              <button
                type="button"
                onClick={handleAddSubtask}
                className="btn-glass px-3.5 py-2 text-xs"
              >
                + Add Step
              </button>
            </div>

            {checklistItems.length > 0 && (
              <div className="space-y-1.5 pt-1">
                {checklistItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-base-800/50 border border-base-700/50 text-xs text-ink-200"
                  >
                    <span>• {item}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveSubtask(idx)}
                      className="text-rose-400 hover:text-rose-300 text-xs font-bold px-1"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-base-700/60">
            <button
              type="button"
              onClick={onClose}
              className="btn-glass px-4 py-2 text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn-glass-primary px-5 py-2 text-xs"
            >
              {submitting ? "Creating Task..." : "Assign Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

}
