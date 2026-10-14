import {
  UserContext,
  getAttendanceSummary,
  getEmployeeAttendance,
  getStressSummary,
  getEmployeeStress,
  getTaskSummary,
  getEmployeeTasks,
  getEmployeeCount,
  getWorkplaceSummary,
} from "./geminiTools";
import { supabase } from "./supabase";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

// Checks server health to verify Gemini AI service readiness without exposing the API key to the client
export async function checkGeminiAvailable(): Promise<boolean> {
  try {
    const res = await fetch("/api/gemini/health");
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.available;
  } catch {
    return false;
  }
}

// Determines relevant data tool execution based on user message intent
async function fetchRelevantDataForPrompt(prompt: string, ctx: UserContext) {
  const lower = prompt.toLowerCase();
  const dataPayload: Record<string, any> = {};

  const isAttendance =
    lower.includes("absent") ||
    lower.includes("present") ||
    lower.includes("attendance") ||
    lower.includes("late") ||
    lower.includes("check-in") ||
    lower.includes("checked in") ||
    lower.includes("wfh") ||
    lower.includes("remote") ||
    lower.includes("home");
  const isStress = lower.includes("stress") || lower.includes("stressed") || lower.includes("anxiety") || lower.includes("wellbeing");
  const isTask = lower.includes("task") || lower.includes("tasks") || lower.includes("overdue") || lower.includes("pending") || lower.includes("completed") || lower.includes("todo") || lower.includes("to-do");
  const isSummary = lower.includes("summary") || lower.includes("workplace") || lower.includes("overview") || lower.includes("report") || lower.includes("today") || (isAttendance && isStress && isTask);
  const isEmployeeQuery = lower.includes("employee") || lower.includes("team") || lower.includes("active") || lower.includes("department") || lower.includes("staff");

  // Determine date context from natural expression
  let dateExpr = "today";
  if (lower.includes("yesterday")) dateExpr = "yesterday";
  else if (lower.includes("tomorrow")) dateExpr = "tomorrow";
  else if (lower.includes("this week")) dateExpr = "this week";
  else if (lower.includes("last week")) dateExpr = "last week";
  else if (lower.includes("this month")) dateExpr = "this month";
  else if (lower.includes("last month")) dateExpr = "last month";
  else if (lower.includes("monday")) dateExpr = "monday";
  else if (lower.includes("friday")) dateExpr = "friday";

  // Regex date extract e.g. 2026-09-20 or September 20
  const dateMatch = lower.match(/(\d{4}-\d{2}-\d{2}|[a-z]+\s+\d{1,2}(?:,\s*\d{4})?)/i);
  if (dateMatch) {
    dateExpr = dateMatch[0];
  }

  // 1. Overall Workplace Summary requested or combined query
  if (isSummary || (isAttendance && isStress) || (isAttendance && isTask) || (isStress && isTask)) {
    dataPayload.workplaceSummary = await getWorkplaceSummary(ctx, dateExpr);
    dataPayload.employeeAttendanceList = await getEmployeeAttendance(ctx, dateExpr);
    dataPayload.employeeTaskList = await getEmployeeTasks(ctx, undefined, lower.includes("overdue"));
  } else {
    // 2. Attendance specific
    if (isAttendance) {
      dataPayload.attendanceSummary = await getAttendanceSummary(ctx, dateExpr);
      dataPayload.attendanceRecords = await getEmployeeAttendance(
        ctx,
        dateExpr,
        lower.includes("absent") ? "absent" : lower.includes("late") ? "late" : lower.includes("present") ? "present" : undefined
      );
    }

    // 3. Stress specific
    if (isStress) {
      dataPayload.stressSummary = await getStressSummary(ctx, dateExpr);
      dataPayload.stressRecords = await getEmployeeStress(ctx, dateExpr);
    }

    // 4. Task specific
    if (isTask) {
      dataPayload.taskSummary = await getTaskSummary(ctx);
      dataPayload.taskList = await getEmployeeTasks(
        ctx,
        lower.includes("completed") ? "completed" : lower.includes("pending") ? "todo" : lower.includes("in progress") ? "in_progress" : undefined,
        lower.includes("overdue")
      );
    }

    // 5. Employee count / org query
    if (isEmployeeQuery && ctx.role !== "employee") {
      dataPayload.employeeCount = await getEmployeeCount(ctx);
    }
  }

  // Fallback: If no specific domain was matched, fetch workplace summary so AI has contextual company stats
  if (Object.keys(dataPayload).length === 0) {
    dataPayload.workplaceSummary = await getWorkplaceSummary(ctx, "today");
  }

  return { dateExpr, dataPayload };
}

// Formats prompt context & executes Gemini API model request via server endpoint
export async function sendGeminiChatMessage(
  prompt: string,
  history: ChatMessage[],
  ctx: UserContext,
  selectedModel?: string
): Promise<{ text: string; error?: string }> {
  try {
    // Fetch authorized real data payload for prompt based on user role and RLS
    const { dateExpr, dataPayload } = await fetchRelevantDataForPrompt(prompt, ctx);

    // Format role-based security context
    const rolePermissions =
      ctx.role === "employee"
        ? `EMPLOYEE PRIVACY POLICY (STRICT):
- The logged-in user is an Employee named "${ctx.userName || ctx.email}".
- They are ONLY authorized to access THEIR OWN attendance, stress history, and assigned tasks.
- If they ask for company-wide sensitive details, absenteeism lists of other staff, or individual stress data of co-workers, politely inform them that co-worker data is restricted under workplace privacy rules.`
        : `ADMIN / OWNER ACCESS:
- The logged-in user is an ${ctx.role.toUpperCase()} named "${ctx.userName || ctx.email}".
- They have full authorization to view organization-wide attendance (including Work From Home requests), stress analytics, employee task progress, and workplace reports.`;

    const systemInstruction = `You are Workwise Workplace Assistant, an intelligent, professional workplace telemetry chatbot embedded inside a modern Smart Workplace SaaS.

USER CONTEXT:
- Name: ${ctx.userName || ctx.email}
- Role: ${ctx.role.toUpperCase()}
- Date Context: Today is ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
- Requested Time Frame: ${dateExpr}

${rolePermissions}

DATA INTEGRITY RULES (CRITICAL):
1. Rely EXCLUSIVELY on the real database data provided in the JSON payload below.
2. NEVER invent employee counts, attendance figures, stress numbers, task counts, percentages, employee names, or dates.
3. If data is missing or empty (e.g. 0 records found for a date), explicitly state that data is unavailable for that date.
4. DO NOT describe AI stress monitoring as a medical diagnosis or invent medical terms. Use standard terms like "Stress Detections" and "Non-Stress Detections".
5. Understand both Workplace (🏢) and Work From Home (🏠 WFH) attendance modes.
6. Use clear, sleek Markdown formatting (bold key stats, bullet points, headers, tables, code blocks where appropriate).
7. Provide concise, direct answers first, followed by clean structured breakdowns.

FETCHED REAL DATABASE DATA FOR QUERY:
\`\`\`json
${JSON.stringify(dataPayload, null, 2)}
\`\`\`
`;

    // Execute server-side endpoint with automatic retry, exponential backoff, and fallback
    const res = await fetch("/api/gemini", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        history,
        systemInstruction,
        selectedModel: selectedModel || "gemini-3.5-flash",
      }),
    });

    if (!res.ok) {
      return {
        text: "",
        error: "Gemini is temporarily unavailable. Please try again in a moment.",
      };
    }

    const data = await res.json();

    if (data.error) {
      return { text: "", error: data.error };
    }

    const responseText = data.text || "I was unable to process your request. Please try again.";

    // Persist conversation to Supabase if tables exist
    saveChatMessageToDatabase(prompt, responseText, ctx).catch(() => {});

    return { text: responseText };
  } catch (err: any) {
    console.error("Gemini Assistant Service Error:", err?.message || err);
    return {
      text: "",
      error: "Gemini is temporarily unavailable. Please try again in a moment.",
    };
  }
}

// Saves message to Supabase ai_messages table
async function saveChatMessageToDatabase(userMsg: string, aiMsg: string, ctx: UserContext) {
  try {
    let { data: conv } = await supabase
      .from("ai_conversations")
      .select("id")
      .eq("user_id", ctx.userId)
      .eq("organization_id", ctx.organizationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!conv) {
      const { data: newConv } = await supabase
        .from("ai_conversations")
        .insert({
          user_id: ctx.userId,
          organization_id: ctx.organizationId,
          title: "Workplace AI Assistant Chat",
        })
        .select("id")
        .single();
      conv = newConv;
    }

    if (conv?.id) {
      await supabase.from("ai_messages").insert([
        {
          conversation_id: conv.id,
          role: "user",
          content: userMsg,
        },
        {
          conversation_id: conv.id,
          role: "assistant",
          content: aiMsg,
        },
      ]);
    }
  } catch {
    // Non-blocking persistence
  }
}
