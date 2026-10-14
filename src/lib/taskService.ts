import { supabase } from "./supabase";

export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TaskStatus = "todo" | "in_progress" | "blocked" | "completed" | "cancelled";

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface Task {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  created_by: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  progress: number; // 0 to 100
  blocked_reason?: string | null;
  start_date: string | null;
  due_date: string | null;
  estimated_hours: number;
  department: string | null;
  tags: string[];
  checklist: ChecklistItem[];
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;

  // Joined profile fields for UI display
  assignee?: {
    id: string;
    full_name: string | null;
    email: string;
    avatar_url?: string | null;
    department?: string | null;
  } | null;
  creator?: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
}

export interface TaskComment {
  id: string;
  organization_id: string;
  task_id: string;
  user_id: string;
  comment: string;
  attachment_url?: string | null;
  attachment_name?: string | null;
  created_at: string;
  user?: {
    full_name: string | null;
    email: string;
    avatar_url?: string | null;
  };
}

export interface TaskActivity {
  id: string;
  organization_id: string;
  task_id: string;
  user_id: string | null;
  action: string;
  metadata: Record<string, any>;
  created_at: string;
  user?: {
    full_name: string | null;
    email: string;
  };
}

// Local storage key for demo resilience
const LOCAL_STORAGE_KEY = "nexora_tasks_store_v1";
const LOCAL_COMMENTS_KEY = "nexora_task_comments_store_v1";
const LOCAL_ACTIVITY_KEY = "nexora_task_activity_store_v1";

function getLocalTasks(orgId: string): Task[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed: Task[] = JSON.parse(raw);
    return parsed.filter((t) => t.organization_id === orgId);
  } catch {
    return [];
  }
}

function saveLocalTask(task: Task) {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    let items: Task[] = raw ? JSON.parse(raw) : [];
    const index = items.findIndex((t) => t.id === task.id);
    if (index >= 0) {
      items[index] = task;
    } else {
      items.unshift(task);
    }
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items));
  } catch (err) {
    console.warn("Failed to write to local task store", err);
  }
}

function deleteLocalTask(taskId: string) {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return;
    let items: Task[] = JSON.parse(raw);
    items = items.filter((t) => t.id !== taskId);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items));
  } catch (err) {
    console.warn("Failed to delete local task", err);
  }
}

// Helper to calculate overdue dynamic status
export function isTaskOverdue(task: Task): boolean {
  if (task.status === "completed" || task.status === "cancelled") return false;
  if (!task.due_date) return false;
  return new Date(task.due_date).getTime() < Date.now();
}

export function isTaskDueSoon(task: Task, daysThreshold = 3): boolean {
  if (task.status === "completed" || task.status === "cancelled") return false;
  if (!task.due_date) return false;
  const dueTime = new Date(task.due_date).getTime();
  const now = Date.now();
  const thresholdMs = daysThreshold * 24 * 60 * 60 * 1000;
  return dueTime >= now && dueTime <= now + thresholdMs;
}

export async function fetchTasks(orgId: string, assignedToUserId?: string): Promise<Task[]> {
  // Profiles map to resolve assignee and creator in all scenarios (Supabase & local fallback)
  const profilesMap = new Map<string, any>();
  try {
    const { data: pData } = await supabase
      .from("profiles")
      .select("id, full_name, email, avatar_url, department")
      .eq("organization_id", orgId);
    if (pData) {
      pData.forEach((p) => profilesMap.set(p.id, p));
    }
  } catch (e) {}

  let tasksList: Task[] = [];
  try {
    let query = supabase
      .from("tasks")
      .select(`
        *,
        assignee:profiles!tasks_assigned_to_fkey(id, full_name, email, avatar_url, department),
        creator:profiles!tasks_created_by_fkey(id, full_name, email)
      `)
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });

    if (assignedToUserId) {
      query = query.eq("assigned_to", assignedToUserId);
    }

    const { data, error } = await query;
    if (!error && data && data.length > 0) {
      tasksList = data as Task[];
    } else {
      // Fallback query without custom relationship name if PostgREST schema cache join fails
      const { data: fallbackData } = await supabase
        .from("tasks")
        .select("*")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });

      if (fallbackData && fallbackData.length > 0) {
        tasksList = fallbackData as Task[];
      } else {
        tasksList = getLocalTasks(orgId);
      }
    }
  } catch (err) {
    tasksList = getLocalTasks(orgId);
  }

  // Ensure assignee and creator objects are ALWAYS populated on each task
  tasksList = tasksList.map((t) => {
    const assigneeObj = t.assignee || (t.assigned_to ? profilesMap.get(t.assigned_to) : null);
    const creatorObj = t.creator || (t.created_by ? profilesMap.get(t.created_by) : null);
    return {
      ...t,
      assignee: assigneeObj || (t.assigned_to ? { id: t.assigned_to, full_name: null, email: "Assigned Member" } : null),
      creator: creatorObj || (t.created_by ? { id: t.created_by, full_name: null, email: "Workspace Admin" } : null),
    };
  });

  if (assignedToUserId) {
    tasksList = tasksList.filter((t) => t.assigned_to === assignedToUserId);
  }

  return tasksList;
}

export async function createTask(
  taskInput: Omit<Task, "id" | "created_at" | "updated_at" | "completed_at" | "completed_by">,
  currentUserId: string
): Promise<Task> {
  const newTask: Task = {
    ...taskInput,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: null,
    completed_by: null,
  };

  // Fetch assigned profile info so task object is immediately complete
  if (newTask.assigned_to) {
    try {
      const { data: p } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url, department")
        .eq("id", newTask.assigned_to)
        .single();
      if (p) newTask.assignee = p;
    } catch (e) {}
  }

  try {
    const { data, error } = await supabase
      .from("tasks")
      .insert([
        {
          id: newTask.id,
          organization_id: newTask.organization_id,
          title: newTask.title,
          description: newTask.description,
          assigned_to: newTask.assigned_to,
          created_by: newTask.created_by || currentUserId,
          priority: newTask.priority,
          status: newTask.status,
          progress: newTask.progress,
          blocked_reason: newTask.blocked_reason,
          start_date: newTask.start_date,
          due_date: newTask.due_date,
          estimated_hours: newTask.estimated_hours,
          department: newTask.department,
          tags: newTask.tags,
          checklist: newTask.checklist,
        },
      ])
      .select(`
        *,
        assignee:profiles!tasks_assigned_to_fkey(id, full_name, email, avatar_url, department),
        creator:profiles!tasks_created_by_fkey(id, full_name, email)
      `)
      .single();

    if (error || !data) {
      console.warn("Supabase task insert warning, saving locally:", error?.message);
      saveLocalTask(newTask);
    } else {
      newTask.id = data.id;
      if (data.assignee) newTask.assignee = data.assignee;
      if (data.creator) newTask.creator = data.creator;
      saveLocalTask(newTask);
    }
  } catch (err) {
    console.warn("Create task exception, saving locally:", err);
    saveLocalTask(newTask);
  }

  // Create audit activity log
  await logTaskActivity(
    newTask.id,
    newTask.organization_id,
    currentUserId,
    "task_created",
    { title: newTask.title, priority: newTask.priority, assigned_to: newTask.assigned_to }
  );

  // Send notification if assigned to employee
  if (newTask.assigned_to) {
    await sendTaskNotification({
      organization_id: newTask.organization_id,
      type: "task_assigned",
      message: `You were assigned a new task: "${newTask.title}" (Priority: ${newTask.priority.toUpperCase()})`,
      target_user_id: newTask.assigned_to,
      created_by: currentUserId,
    });
  }

  return newTask;
}

export async function updateTask(
  taskId: string,
  updates: Partial<Task>,
  currentUserId: string,
  _userRole?: string
): Promise<void> {
  const isCompleting = updates.status === "completed";
  const now = new Date().toISOString();

  const patch: Record<string, any> = {
    ...updates,
    updated_at: now,
  };

  if (isCompleting) {
    patch.completed_at = now;
    patch.completed_by = currentUserId;
    patch.progress = 100;
  }

  try {
    const { error } = await supabase
      .from("tasks")
      .update(patch)
      .eq("id", taskId);

    if (error) {
      console.warn("Supabase updateTask error, local update:", error.message);
    }
  } catch (err) {
    console.warn("Update task exception:", err);
  }

  // Local sync
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const items: Task[] = JSON.parse(raw);
      const idx = items.findIndex((t) => t.id === taskId);
      if (idx >= 0) {
        items[idx] = { ...items[idx], ...patch };
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items));
      }
    }
  } catch (e) {}

  // Log activity
  if (updates.status) {
    await logTaskActivity(taskId, updates.organization_id || "", currentUserId, `status_changed_to_${updates.status}`, {
      status: updates.status,
      blocked_reason: updates.blocked_reason,
    });

    if (updates.status === "completed") {
      // Notify admin/owner that task was completed
      await sendTaskNotification({
        organization_id: updates.organization_id || "",
        type: "task_completed",
        message: `Task completed: "${updates.title || "Task"}"`,
        visibility: "admin",
        created_by: currentUserId,
      });
    }
  } else if (updates.progress !== undefined) {
    await logTaskActivity(taskId, updates.organization_id || "", currentUserId, "progress_updated", {
      progress: updates.progress,
    });
  }
}

export async function deleteTask(taskId: string, _orgId?: string): Promise<void> {
  try {
    await supabase.from("tasks").delete().eq("id", taskId);
  } catch (err) {
    console.warn("Delete task error", err);
  }
  deleteLocalTask(taskId);
}

// Activity Logging Helper
export async function logTaskActivity(
  taskId: string,
  orgId: string,
  userId: string,
  action: string,
  metadata: Record<string, any> = {}
) {
  try {
    await supabase.from("task_activity").insert([
      {
        task_id: taskId,
        organization_id: orgId,
        user_id: userId,
        action,
        metadata,
      },
    ]);
  } catch (err) {
    // Local fallback
    try {
      const raw = localStorage.getItem(LOCAL_ACTIVITY_KEY);
      const items = raw ? JSON.parse(raw) : [];
      items.unshift({
        id: crypto.randomUUID(),
        task_id: taskId,
        organization_id: orgId,
        user_id: userId,
        action,
        metadata,
        created_at: new Date().toISOString(),
      });
      localStorage.setItem(LOCAL_ACTIVITY_KEY, JSON.stringify(items));
    } catch (e) {}
  }
}

export async function fetchTaskActivity(taskId: string): Promise<TaskActivity[]> {
  try {
    const { data, error } = await supabase
      .from("task_activity")
      .select(`
        *,
        user:profiles!task_activity_user_id_fkey(full_name, email)
      `)
      .eq("task_id", taskId)
      .order("created_at", { ascending: false });

    if (!error && data) return data as TaskActivity[];
  } catch (err) {}

  try {
    const raw = localStorage.getItem(LOCAL_ACTIVITY_KEY);
    if (raw) {
      const items: TaskActivity[] = JSON.parse(raw);
      return items.filter((a) => a.task_id === taskId);
    }
  } catch (e) {}
  return [];
}

// Task Comments Service
export async function fetchTaskComments(taskId: string): Promise<TaskComment[]> {
  try {
    const { data, error } = await supabase
      .from("task_comments")
      .select(`
        *,
        user:profiles!task_comments_user_id_fkey(full_name, email, avatar_url)
      `)
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });

    if (!error && data) return data as TaskComment[];
  } catch (err) {}

  try {
    const raw = localStorage.getItem(LOCAL_COMMENTS_KEY);
    if (raw) {
      const items: TaskComment[] = JSON.parse(raw);
      return items.filter((c) => c.task_id === taskId);
    }
  } catch (e) {}
  return [];
}

export async function addTaskComment(
  orgId: string,
  taskId: string,
  userId: string,
  comment: string,
  attachmentUrl?: string,
  attachmentName?: string
): Promise<TaskComment> {
  const newComment: TaskComment = {
    id: crypto.randomUUID(),
    organization_id: orgId,
    task_id: taskId,
    user_id: userId,
    comment,
    attachment_url: attachmentUrl || null,
    attachment_name: attachmentName || null,
    created_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase
      .from("task_comments")
      .insert([
        {
          organization_id: orgId,
          task_id: taskId,
          user_id: userId,
          comment,
          attachment_url: attachmentUrl,
          attachment_name: attachmentName,
        },
      ])
      .select(`
        *,
        user:profiles!task_comments_user_id_fkey(full_name, email, avatar_url)
      `)
      .single();

    if (!error && data) {
      newComment.id = data.id;
    }
  } catch (err) {
    console.warn("Add comment exception, fallback local", err);
  }

  // Local fallback
  try {
    const raw = localStorage.getItem(LOCAL_COMMENTS_KEY);
    const items = raw ? JSON.parse(raw) : [];
    items.push(newComment);
    localStorage.setItem(LOCAL_COMMENTS_KEY, JSON.stringify(items));
  } catch (e) {}

  // Audit log comment added
  await logTaskActivity(taskId, orgId, userId, "comment_added", { comment_snippet: comment.slice(0, 50) });

  return newComment;
}

// Notification Helper
async function sendTaskNotification(payload: {
  organization_id: string;
  type: string;
  message: string;
  target_user_id?: string;
  visibility?: "admin" | "all" | "user";
  created_by?: string;
}) {
  try {
    await supabase.from("notifications").insert([
      {
        organization_id: payload.organization_id,
        type: payload.type,
        message: payload.message,
        visibility: payload.visibility || (payload.target_user_id ? "user" : "admin"),
        target_user_id: payload.target_user_id || null,
        created_by: payload.created_by || null,
      },
    ]);
  } catch (err) {
    console.warn("Could not insert notification", err);
  }
}
