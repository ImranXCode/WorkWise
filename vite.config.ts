import { defineConfig, loadEnv, Plugin } from "vite";
import react from "@vitejs/plugin-react";

function geminiServerPlugin(): Plugin {
  let envConfig: Record<string, string> = {};

  function getApiKey() {
    const raw = process.env.GEMINI_API_KEY || envConfig.GEMINI_API_KEY;
    if (raw && raw.trim() !== "" && !raw.includes("YOUR_")) {
      return raw.trim();
    }
    return null;
  }

  // Simple in-memory sliding window rate limiter
  const requestTimestamps: number[] = [];
  const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
  const MAX_REQUESTS_PER_WINDOW = 30;

  function registerMiddleware(middlewares: any) {
    middlewares.use(async (req: any, res: any, next: any) => {
      const url = req.url ? req.url.split("?")[0] : "";

      // Health endpoint (returns whether AI is configured without exposing key)
      if (url === "/api/gemini/health" && req.method === "GET") {
        const key = getApiKey();
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ available: !!key }));
        return;
      }

      // Chat query endpoint (runs Gemini strictly server-side)
      if (url === "/api/gemini" && req.method === "POST") {
        const apiKey = getApiKey();
        if (!apiKey) {
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              text: "",
              error:
                "Gemini API key is not configured on the server. Please add GEMINI_API_KEY to your .env file and restart.",
            })
          );
          return;
        }

        // Check rate limit
        const now = Date.now();
        while (requestTimestamps.length > 0 && requestTimestamps[0] < now - RATE_LIMIT_WINDOW_MS) {
          requestTimestamps.shift();
        }
        if (requestTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
          res.statusCode = 429;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              text: "",
              error: "Rate limit reached. Please wait a moment before sending more messages.",
            })
          );
          return;
        }
        requestTimestamps.push(now);

        try {
          let bodyStr = "";
          let byteCount = 0;
          const MAX_BODY_BYTES = 100 * 1024; // 100KB max payload

          req.on("data", (chunk: any) => {
            byteCount += chunk.length;
            if (byteCount > MAX_BODY_BYTES) {
              req.destroy();
              res.statusCode = 413;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ text: "", error: "Request payload too large." }));
              return;
            }
            bodyStr += chunk;
          });

          req.on("end", async () => {
            try {
              const body = bodyStr ? JSON.parse(bodyStr) : {};
              const { prompt, history, systemInstruction, selectedModel } = body;

              if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ text: "", error: "Prompt is required." }));
                return;
              }

              if (prompt.length > 5000) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ text: "", error: "Prompt exceeds maximum allowed length of 5000 characters." }));
                return;
              }

              const result = await handleGeminiExecution({
                apiKey,
                prompt,
                history,
                systemInstruction,
                selectedModel,
              });

              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(result));
            } catch (err: any) {
              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  text: "",
                  error: "Gemini is temporarily unavailable. Please try again in a moment.",
                })
              );
            }
          });
          return;
        } catch {
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              text: "",
              error: "Gemini is temporarily unavailable. Please try again in a moment.",
            })
          );
          return;
        }
      }

      next();
    });
  }

  return {
    name: "gemini-server-plugin",
    configResolved(config) {
      envConfig = loadEnv(config.mode, process.cwd(), "");
    },
    configureServer(server) {
      registerMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      registerMiddleware(server.middlewares);
    },
  };
}

async function handleGeminiExecution({
  apiKey,
  prompt,
  history,
  systemInstruction,
  selectedModel,
}: {
  apiKey: string;
  prompt: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  systemInstruction?: string;
  selectedModel?: string;
}) {
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey });

  const contents: any[] = (history || []).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  contents.push({
    role: "user",
    parts: [{ text: prompt }],
  });

  // Priority: selected model first, followed by tested stable free-tier fallbacks
  const primaryModel = selectedModel || "gemini-3.5-flash";
  const candidateModels = Array.from(
    new Set([primaryModel, "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3-flash-preview"])
  );

  let lastError: any = null;

  for (const modelName of candidateModels) {
    const maxRetries = 2; // Total up to 3 attempts (attempt 0, 1, 2)
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delayMs = attempt * 1000; // Attempt 1: 1s, Attempt 2: 2s
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }

        const response = await ai.models.generateContent({
          model: modelName,
          contents,
          config: {
            systemInstruction,
            temperature: 0.2,
          },
        });

        if (response.text) {
          return { text: response.text, modelUsed: modelName };
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

        // Non-temporary errors (e.g. 404 deprecated model) should immediately try the next model
        if (!isTemporary) {
          break;
        }
      }
    }
  }

  // Handle final error cleanly without exposing technical JSON or stack traces
  const finalMsg = String(lastError?.message || "").toLowerCase();
  if (
    finalMsg.includes("503") ||
    finalMsg.includes("unavailable") ||
    finalMsg.includes("high demand") ||
    finalMsg.includes("spikes in demand")
  ) {
    return {
      text: "",
      error: "Gemini is temporarily unavailable. Please try again in a moment.",
    };
  } else if (finalMsg.includes("429") || finalMsg.includes("quota") || finalMsg.includes("resource_exhausted")) {
    return {
      text: "",
      error: "Gemini API free tier rate limit reached. Please wait a moment before asking another question.",
    };
  } else if (finalMsg.includes("api_key") || finalMsg.includes("api key") || finalMsg.includes("invalid argument")) {
    return {
      text: "",
      error: "Invalid or expired Gemini API key. Please check your GEMINI_API_KEY environment variable.",
    };
  }

  return {
    text: "",
    error: "Gemini is temporarily unavailable. Please try again in a moment.",
  };
}

export default defineConfig({
  plugins: [react(), geminiServerPlugin()],
  server: {
    host: true,
    port: 5173,
  },
});
