import { supabase } from "./supabase";
import { UserRole } from "./AuthContext";

export type UserContext = {
  userId: string;
  organizationId: string;
  role: UserRole;
  userName?: string;
  email?: string;
};

// Helper: Formats Date into YYYY-MM-DD in local time
export function formatDateISO(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Helper: Returns date bounds for natural expressions
export function resolveDateRange(dateExpr?: string): { startDate: string; endDate: string } {
  const now = new Date();
  const todayStr = formatDateISO(now);

  if (!dateExpr || dateExpr.toLowerCase() === "today") {
    return { startDate: todayStr, endDate: todayStr };
  }

  const expr = dateExpr.toLowerCase().trim();

  if (expr === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const yStr = formatDateISO(y);
    return { startDate: yStr, endDate: yStr };
  }

  if (expr === "tomorrow") {
    const t = new Date(now);
    t.setDate(t.getDate() + 1);
    const tStr = formatDateISO(t);
    return { startDate: tStr, endDate: tStr };
  }

  if (expr.includes("this week")) {
    const dayOfWeek = now.getDay(); // 0 is Sunday
    const distanceToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - distanceToMonday);
    return { startDate: formatDateISO(startOfWeek), endDate: todayStr };
  }

  if (expr.includes("last week")) {
    const dayOfWeek = now.getDay();
    const distanceToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const endOfLastWeek = new Date(now);
    endOfLastWeek.setDate(now.getDate() - distanceToMonday - 1);
    const startOfLastWeek = new Date(endOfLastWeek);
    startOfLastWeek.setDate(endOfLastWeek.getDate() - 6);
    return { startDate: formatDateISO(startOfLastWeek), endDate: formatDateISO(endOfLastWeek) };
  }

  if (expr.includes("this month")) {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return { startDate: formatDateISO(startOfMonth), endDate: todayStr };
  }

  if (expr.includes("last month")) {
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    return { startDate: formatDateISO(startOfLastMonth), endDate: formatDateISO(endOfLastMonth) };
  }

  // Parse YYYY-MM-DD directly if valid
  if (/^\d{4}-\d{2}-\d{2}$/.test(expr)) {
    return { startDate: expr, endDate: expr };
  }

  // Parse strings like "September 20" or "September 20, 2026"
  const parsed = new Date(expr);
  if (!isNaN(parsed.getTime())) {
    const pStr = formatDateISO(parsed);
    return { startDate: pStr, endDate: pStr };
  }

  // Fallback to today
  return { startDate: todayStr, endDate: todayStr };
}

// ------------------------------------------------------------
// TOOL 1: get_attendance_summary
// ------------------------------------------------------------
export async function getAttendanceSummary(ctx: UserContext, dateExpr?: string) {
  const { startDate, endDate } = resolveDateRange(dateExpr);

  // Get total employee profiles in company
  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("organization_id", ctx.organizationId);

  if (pErr) return { error: pErr.message };
  const totalEmployees = profiles?.length || 0;

  // Query attendance for range
  let query = supabase
    .from("attendance")
    .select("id, employee_id, date, status, check_in, check_out, attendance_type, approval_status, wfh_reason")
    .eq("organization_id", ctx.organizationId)
    .gte("date", startDate)
    .lte("date", endDate);

  if (ctx.role === "employee") {
    query = query.eq("employee_id", ctx.userId);
  }

  let { data: records, error: aErr } = await query;
  if (aErr && aErr.message.includes("attendance_type")) {
    const fallback = await supabase
      .from("attendance")
      .select("id, employee_id, date, status, check_in, check_out")
      .eq("organization_id", ctx.organizationId)
      .gte("date", startDate)
      .lte("date", endDate);
    records = fallback.data as any;
    aErr = fallback.error;
  }
  if (aErr) return { error: aErr.message };

  const presentCount = records?.filter((r: any) => r.status === "present" || r.status === "late").length || 0;
  const lateCount = records?.filter((r: any) => r.status === "late").length || 0;
  const wfhCount = records?.filter((r: any) => r.attendance_type === "WORK_FROM_HOME").length || 0;
  const workplaceCount = Math.max(0, presentCount - wfhCount);
  
  let absentCount = 0;
  if (startDate === endDate) {
    absentCount = Math.max(0, totalEmployees - presentCount);
  } else {
    absentCount = records?.filter((r: any) => r.status === "absent").length || 0;
  }

  const attendanceRate = totalEmployees > 0 ? Math.round((presentCount / totalEmployees) * 100) : 0;

  return {
    dateRange: { startDate, endDate },
    totalEmployees: ctx.role === "employee" ? 1 : totalEmployees,
    presentCount,
    workplaceCount,
    workFromHomeCount: wfhCount,
    absentCount: ctx.role === "employee" ? (presentCount > 0 ? 0 : 1) : absentCount,
    lateCount,
    attendanceRate: ctx.role === "employee" ? (presentCount > 0 ? 100 : 0) : attendanceRate,
    recordCount: records?.length || 0,
    userRole: ctx.role,
  };
}

// ------------------------------------------------------------
// TOOL 2: get_employee_attendance
// ------------------------------------------------------------
export async function getEmployeeAttendance(ctx: UserContext, dateExpr?: string, statusFilter?: string) {
  const { startDate, endDate } = resolveDateRange(dateExpr);

  // Get profiles in org
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email, department, designation, employee_code")
    .eq("organization_id", ctx.organizationId);

  const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

  let query = supabase
    .from("attendance")
    .select("id, employee_id, date, check_in, check_out, status, attendance_type, approval_status, wfh_reason")
    .eq("organization_id", ctx.organizationId)
    .gte("date", startDate)
    .lte("date", endDate);

  if (ctx.role === "employee") {
    query = query.eq("employee_id", ctx.userId);
  }

  let { data: records, error } = await query;
  if (error && error.message.includes("attendance_type")) {
    const fallback = await supabase
      .from("attendance")
      .select("id, employee_id, date, check_in, check_out, status")
      .eq("organization_id", ctx.organizationId)
      .gte("date", startDate)
      .lte("date", endDate);
    records = fallback.data as any;
    error = fallback.error;
  }
  if (error) return { error: error.message };

  const presentEmployeeIds = new Set((records || []).map((r) => r.employee_id));

  let results = (records || []).map((r: any) => {
    const p = profileMap.get(r.employee_id);
    return {
      employeeName: ctx.role === "employee" ? ctx.userName || "You" : p?.full_name || p?.email || "Unknown",
      employeeCode: p?.employee_code || "N/A",
      department: p?.department || "N/A",
      date: r.date,
      status: r.status,
      attendanceType: r.attendance_type || "WORKPLACE",
      approvalStatus: r.approval_status || "approved",
      wfhReason: r.wfh_reason || null,
      checkIn: r.check_in ? new Date(r.check_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null,
      checkOut: r.check_out ? new Date(r.check_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null,
    };
  });

  // Calculate absentees for single-date query
  let absentEmployees: Array<{ employeeName: string; employeeCode: string; department: string; status: string }> = [];
  if (ctx.role !== "employee" && startDate === endDate) {
    (profiles || []).forEach((p) => {
      if (!presentEmployeeIds.has(p.id)) {
        absentEmployees.push({
          employeeName: p.full_name || p.email,
          employeeCode: p.employee_code || "N/A",
          department: p.department || "Unassigned",
          status: "absent",
        });
      }
    });
  }

  if (statusFilter) {
    const sf = statusFilter.toLowerCase();
    if (sf === "absent" && startDate === endDate) {
      results = absentEmployees as any;
    } else {
      results = results.filter((r) => r.status.toLowerCase() === sf);
    }
  }

  return {
    dateRange: { startDate, endDate },
    recordsFound: results.length,
    records: results,
    absentEmployees: statusFilter === "absent" || !statusFilter ? absentEmployees : [],
    userRole: ctx.role,
  };
}

// ------------------------------------------------------------
// TOOL 3: get_stress_summary
// ------------------------------------------------------------
export async function getStressSummary(ctx: UserContext, dateExpr?: string) {
  const { startDate, endDate } = resolveDateRange(dateExpr);

  const startIso = `${startDate}T00:00:00.000Z`;
  const endIso = `${endDate}T23:59:59.999Z`;

  let query = supabase
    .from("stress_records")
    .select("id, employee_id, predicted_class, confidence, stress_score, event_type, baseline_comparison, created_at")
    .eq("organization_id", ctx.organizationId)
    .gte("created_at", startIso)
    .lte("created_at", endIso);

  if (ctx.role === "employee") {
    query = query.eq("employee_id", ctx.userId);
  }

  const { data: records, error } = await query;
  if (error) return { error: error.message };

  const totalScans = records?.length || 0;
  let elevatedScans = 0;
  let normalScans = 0;
  const eventBreakdown: Record<string, number> = {
    LOGIN: 0,
    ATTENDANCE: 0,
    BREAK_START: 0,
    BREAK_END: 0,
    LOGOUT: 0,
    MANUAL: 0,
  };

  const stressedEmployeeSet = new Set<string>();

  (records || []).forEach((r) => {
    const cls = r.predicted_class || "non_stress";
    const ev = r.event_type || "MANUAL";
    eventBreakdown[ev] = (eventBreakdown[ev] || 0) + 1;

    if (cls === "stress") {
      elevatedScans++;
      if (r.employee_id) stressedEmployeeSet.add(r.employee_id);
    } else {
      normalScans++;
    }
  });

  return {
    dateRange: { startDate, endDate },
    totalScans,
    elevatedDetectionsCount: elevatedScans,
    normalDetectionsCount: normalScans,
    eventBreakdown,
    employeesWithElevatedCuesCount: ctx.role === "employee" ? (elevatedScans > 0 ? 1 : 0) : stressedEmployeeSet.size,
    userRole: ctx.role,
  };
}

// ------------------------------------------------------------
// TOOL 4: get_employee_stress
// ------------------------------------------------------------
export async function getEmployeeStress(ctx: UserContext, dateExpr?: string, eventFilter?: string) {
  const { startDate, endDate } = resolveDateRange(dateExpr);
  const startIso = `${startDate}T00:00:00.000Z`;
  const endIso = `${endDate}T23:59:59.999Z`;

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email, department")
    .eq("organization_id", ctx.organizationId);

  const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

  let query = supabase
    .from("stress_records")
    .select("id, employee_id, predicted_class, confidence, stress_score, event_type, baseline_comparison, model_version, created_at")
    .eq("organization_id", ctx.organizationId)
    .gte("created_at", startIso)
    .lte("created_at", endIso);

  if (ctx.role === "employee") {
    query = query.eq("employee_id", ctx.userId);
  }

  if (eventFilter) {
    query = query.eq("event_type", eventFilter.toUpperCase());
  }

  const { data: records, error } = await query;
  if (error) return { error: error.message };

  const list = (records || []).map((r) => {
    const p = profileMap.get(r.employee_id);
    const cls = r.predicted_class || "non_stress";
    return {
      employeeName: ctx.role === "employee" ? ctx.userName || "You" : p?.full_name || p?.email || "Unknown",
      department: p?.department || "Unassigned",
      eventType: r.event_type || "MANUAL",
      aiEstimate: cls === "stress" ? "Elevated Indicator" : "Normal Baseline",
      stressScore: r.stress_score,
      confidencePercentage: Math.round((r.confidence || 0.85) * 100),
      modelVersion: r.model_version || "stress_model_v1.0",
      baselineComparison: r.baseline_comparison || "Logged into timeline",
      detectedAt: r.created_at ? new Date(r.created_at).toLocaleString() : "Recently",
    };
  });

  return {
    dateRange: { startDate, endDate },
    totalRecords: list.length,
    records: list,
    userRole: ctx.role,
  };
}

// ------------------------------------------------------------
// TOOL 5: get_task_summary
// ------------------------------------------------------------
export async function getTaskSummary(ctx: UserContext) {
  let query = supabase
    .from("tasks")
    .select("id, title, status, priority, due_date, assigned_to, created_by")
    .eq("organization_id", ctx.organizationId);

  if (ctx.role === "employee") {
    query = query.or(`assigned_to.eq.${ctx.userId},created_by.eq.${ctx.userId}`);
  }

  const { data: tasks, error } = await query;
  if (error) return { error: error.message };

  const nowIso = new Date().toISOString();

  let todo = 0;
  let inProgress = 0;
  let blocked = 0;
  let completed = 0;
  let overdue = 0;

  (tasks || []).forEach((t) => {
    if (t.status === "todo") todo++;
    else if (t.status === "in_progress") inProgress++;
    else if (t.status === "blocked") blocked++;
    else if (t.status === "completed") completed++;

    if (t.due_date && t.due_date < nowIso && t.status !== "completed" && t.status !== "cancelled") {
      overdue++;
    }
  });

  return {
    totalTasks: tasks?.length || 0,
    todoCount: todo,
    inProgressCount: inProgress,
    blockedCount: blocked,
    completedCount: completed,
    overdueCount: overdue,
    pendingTotal: todo + inProgress + blocked,
    userRole: ctx.role,
  };
}

// ------------------------------------------------------------
// TOOL 6: get_employee_tasks
// ------------------------------------------------------------
export async function getEmployeeTasks(ctx: UserContext, statusFilter?: string, isOverdueOnly?: boolean) {
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("organization_id", ctx.organizationId);

  const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

  let query = supabase
    .from("tasks")
    .select("id, title, description, status, priority, progress, due_date, assigned_to, created_by, blocked_reason")
    .eq("organization_id", ctx.organizationId);

  if (ctx.role === "employee") {
    query = query.or(`assigned_to.eq.${ctx.userId},created_by.eq.${ctx.userId}`);
  }

  const { data: tasks, error } = await query;
  if (error) return { error: error.message };

  const nowIso = new Date().toISOString();

  let filtered = tasks || [];

  if (statusFilter) {
    const sf = statusFilter.toLowerCase();
    filtered = filtered.filter((t) => t.status.toLowerCase() === sf);
  }

  if (isOverdueOnly) {
    filtered = filtered.filter(
      (t) => t.due_date && t.due_date < nowIso && t.status !== "completed" && t.status !== "cancelled"
    );
  }

  const list = filtered.map((t) => {
    const assignee = profileMap.get(t.assigned_to);
    const creator = profileMap.get(t.created_by);
    const isOverdue = !!(t.due_date && t.due_date < nowIso && t.status !== "completed" && t.status !== "cancelled");

    return {
      taskId: t.id,
      title: t.title,
      description: t.description || "",
      assignedTo: assignee ? assignee.full_name || assignee.email : "Unassigned",
      createdBy: creator ? creator.full_name || creator.email : "System",
      status: t.status,
      priority: t.priority,
      progressPercentage: t.progress,
      dueDate: t.due_date ? new Date(t.due_date).toLocaleDateString() : "No deadline",
      isOverdue,
      blockedReason: t.blocked_reason || null,
    };
  });

  return {
    tasksFound: list.length,
    tasks: list,
    userRole: ctx.role,
  };
}

// ------------------------------------------------------------
// TOOL 7: get_employee_count
// ------------------------------------------------------------
export async function getEmployeeCount(ctx: UserContext) {
  if (ctx.role === "employee") {
    const { count } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", ctx.organizationId);
    return {
      totalEmployeesInOrg: count || 1,
      userRole: ctx.role,
      message: "Total employee count in workspace.",
    };
  }

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, department, designation")
    .eq("organization_id", ctx.organizationId);

  if (error) return { error: error.message };

  const deptCounts: Record<string, number> = {};
  (profiles || []).forEach((p) => {
    const dept = p.department || "General";
    deptCounts[dept] = (deptCounts[dept] || 0) + 1;
  });

  return {
    totalEmployees: profiles?.length || 0,
    departmentBreakdown: deptCounts,
    userRole: ctx.role,
  };
}

// ------------------------------------------------------------
// TOOL 8: get_workplace_summary
// ------------------------------------------------------------
export async function getWorkplaceSummary(ctx: UserContext, dateExpr?: string) {
  const attendance = await getAttendanceSummary(ctx, dateExpr);
  const stress = await getStressSummary(ctx, dateExpr);
  const tasks = await getTaskSummary(ctx);

  return {
    date: dateExpr || "today",
    userRole: ctx.role,
    attendance,
    stress,
    tasks,
  };
}
