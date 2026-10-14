// In-memory sliding window rate limiter for the serverless function instance
const ipRateMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 20;

export default async function handler(req: any, res: any) {
  // Enforce POST method
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    return;
  }

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store, max-age=0");

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey.includes("YOUR_")) {
    res.status(503).json({
      text: "",
      error: "Gemini AI service is not configured on the production host. Please set GEMINI_API_KEY in environment variables.",
    });
    return;
  }

  // Rate limiting by client IP
  const clientIp =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown";

  const now = Date.now();
  const timestamps = ipRateMap.get(clientIp) || [];
  const validTimestamps = timestamps.filter((t) => t > now - RATE_LIMIT_WINDOW_MS);

  if (validTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    res.status(429).json({
      text: "",
      error: "Too many AI requests. Please wait a moment before sending another message.",
    });
    return;
  }

  validTimestamps.push(now);
  ipRateMap.set(clientIp, validTimestamps);

  // Parse and validate body
  const body = req.body || {};
  const { prompt, history, systemInstruction, selectedModel } = body;

  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    res.status(400).json({ text: "", error: "Prompt is required." });
    return;
  }

  if (prompt.length > 5000) {
    res.status(400).json({
      text: "",
      error: "Prompt exceeds maximum allowed length of 5000 characters.",
    });
    return;
  }

  try {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });

    const contents: any[] = (history || []).slice(-10).map((m: any) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content || "").slice(0, 3000) }],
    }));

    contents.push({
      role: "user",
      parts: [{ text: prompt }],
    });

    const primaryModel = selectedModel || "gemini-3.5-flash";
    const candidateModels = Array.from(
      new Set([primaryModel, "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3-flash-preview"])
    );

    let lastError: any = null;

    for (const modelName of candidateModels) {
      const maxRetries = 2;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
          }

          const response = await ai.models.generateContent({
            model: modelName,
            contents,
            config: {
              systemInstruction: systemInstruction ? String(systemInstruction).slice(0, 8000) : undefined,
              temperature: 0.2,
            },
          });

          if (response.text) {
            res.status(200).json({ text: response.text, modelUsed: modelName });
            return;
          }
        } catch (err: any) {
          lastError = err;
          const errMsg = String(err?.message || "").toLowerCase();
          const isTemporary =
            errMsg.includes("503") ||
            errMsg.includes("unavailable") ||
            errMsg.includes("high demand") ||
            errMsg.includes("resource_exhausted") ||
            errMsg.includes("429");

          if (!isTemporary) break;
        }
      }
    }

    // Friendly error handling
    const finalMsg = String(lastError?.message || "").toLowerCase();
    if (finalMsg.includes("429") || finalMsg.includes("quota") || finalMsg.includes("resource_exhausted")) {
      res.status(429).json({
        text: "",
        error: "Gemini API rate limit reached. Please wait a moment before asking another question.",
      });
      return;
    }

    res.status(503).json({
      text: "",
      error: "Gemini is temporarily unavailable. Please try again in a moment.",
    });
  } catch (serverErr) {
    res.status(500).json({
      text: "",
      error: "An unexpected error occurred while processing your request.",
    });
  }
}
