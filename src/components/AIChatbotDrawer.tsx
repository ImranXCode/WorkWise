import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAuth } from "../lib/AuthContext";
import { sendGeminiChatMessage, ChatMessage, checkGeminiAvailable } from "../lib/geminiService";
import { Spinner } from "./icons";
import AIFluidOrbLogo from "./AIFluidOrbLogo";

const ADMIN_SUGGESTED_PROMPTS = [
  "Give me today's workplace summary",
  "How many employees were absent today?",
  "How many employees are working from home today?",
  "How many employees were stressed today?",
  "Show overdue tasks",
  "How many employees are currently in the company?",
];

const EMPLOYEE_SUGGESTED_PROMPTS = [
  "Show my attendance",
  "Show my pending tasks",
  "What is my stress history?",
  "Give me today's workplace summary",
];

const AVAILABLE_MODELS = [
  { id: "gemini-3.5-flash", label: "3.5-Flash", desc: "Standard Free Tier • Stable & Fast" },
  { id: "gemini-3.5-flash-lite", label: "3.5-Flash-Lite", desc: "Ultra-Fast Free Tier" },
  { id: "gemini-3.8-flash", label: "3.8-Flash", desc: "Latest Preview • High Intelligence" },
];

export default function AIChatbotDrawer() {
  const { user, profile, organization } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState<string>("");
  const [hasApiKey, setHasApiKey] = useState(true);
  const [showPromptsMenu, setShowPromptsMenu] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>("gemini-3.5-flash");
  const [isListening, setIsListening] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  const userRole = profile?.role || "employee";
  const firstName = profile?.full_name ? profile.full_name.split(" ")[0] : "there";
  const suggestedPrompts = userRole === "employee" ? EMPLOYEE_SUGGESTED_PROMPTS : ADMIN_SUGGESTED_PROMPTS;

  useEffect(() => {
    checkGeminiAvailable().then(setHasApiKey);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      checkGeminiAvailable().then(setHasApiKey);
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Voice speech recognition initialization
  const toggleVoiceInput = () => {
    if (isListening) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setErrorMessage("Voice speech recognition is not supported in your current browser.");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (e: any) => {
        const transcript = Array.from(e.results)
          .map((r: any) => r[0].transcript)
          .join("");
        setInput(transcript);
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
    }
  };

  const handleSend = async (textToSend?: string) => {
    const queryText = (textToSend || input).trim();
    if (!queryText || loading) return;

    if (!user || !profile || !organization?.id) {
      setErrorMessage("Please complete organization onboarding to use AI Assistant.");
      return;
    }

    setErrorMessage(null);
    setLastQuery(queryText);
    setShowPromptsMenu(false);
    setShowModelDropdown(false);
    setInput("");

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: queryText,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    const userContext = {
      userId: user.id,
      organizationId: organization.id,
      role: profile.role,
      userName: profile.full_name || user.email || undefined,
      email: user.email || undefined,
    };

    const res = await sendGeminiChatMessage(queryText, messages, userContext, selectedModel);

    setLoading(false);

    if (res.error) {
      setErrorMessage(res.error);
    } else {
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: res.text,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    }
  };

  const handleClearHistory = () => {
    setMessages([]);
    setErrorMessage(null);
  };

  const currentModelLabel = AVAILABLE_MODELS.find((m) => m.id === selectedModel)?.label || "3.5-Flash";

  return (
    <>
      {/* Circle-Only Floating Gemini AI Liquid Orb Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-40 group p-1 rounded-full bg-base-950/90 backdrop-blur-2xl shadow-[0_0_35px_rgba(6,182,212,0.4)] hover:shadow-[0_0_50px_rgba(236,72,153,0.6)] hover:scale-110 active:scale-95 transition-all duration-300 border border-white/20 hover:border-cyan-400 flex items-center justify-center cursor-pointer"
        title="Open Gemini AI Assistant"
      >
        <AIFluidOrbLogo size="sm" isThinking={loading} />
      </button>

      {/* Slide-over Backdrop & Drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
          {/* Ambient Backdrop */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-lg transition-opacity animate-fade-in"
            onClick={() => setIsOpen(false)}
          />

          {/* Gemini-Style Chat Drawer Panel */}
          <aside className="relative w-full max-w-xl bg-gradient-to-b from-[#0f172a] via-[#090d16] to-[#05070b] border-l border-white/10 shadow-2xl flex flex-col h-full z-10 animate-slide-left overflow-hidden">
            {/* Ambient Background Aura */}
            <div className="absolute inset-0 liquid-aurora-bg opacity-30 pointer-events-none" />

            {/* Header */}
            <div className="relative z-10 px-6 py-4 border-b border-white/10 bg-base-950/70 backdrop-blur-2xl flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <AIFluidOrbLogo size="md" isThinking={loading} />
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-ink-100">Workwise Assistant</h2>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-accent-500/15 text-accent-400 border border-accent-500/30 uppercase tracking-wider">
                      {userRole}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button
                    onClick={handleClearHistory}
                    className="p-2 rounded-xl text-ink-400 hover:text-ink-100 hover:bg-white/10 transition-colors"
                    title="Clear Chat History"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 rounded-xl text-ink-400 hover:text-ink-100 hover:bg-white/10 transition-colors"
                  title="Close AI Assistant"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>

            {/* API Key Banner */}
            {!hasApiKey && (
              <div className="relative z-10 m-4 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2.5">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                </svg>
                <div>
                  <strong>Gemini Key Required:</strong> Add <code className="bg-base-950 px-1 py-0.5 rounded border border-amber-500/30">GEMINI_API_KEY=your_key</code> to <code className="bg-base-950 px-1 py-0.5 rounded border border-amber-500/30">.env</code> and restart dev server.
                </div>
              </div>
            )}

            {/* Error Notification with Clean Message & Retry */}
            {errorMessage && (
              <div className="relative z-10 mx-4 mt-3 p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-3 shadow-lg">
                <div className="flex items-center gap-2">
                  <span className="text-base shrink-0">⚠️</span>
                  <span>{errorMessage}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {lastQuery && (
                    <button
                      onClick={() => handleSend(lastQuery)}
                      disabled={loading}
                      className="px-2.5 py-1 rounded-lg bg-rose-500/25 hover:bg-rose-500/40 text-rose-200 border border-rose-500/40 font-semibold text-[11px] transition-colors cursor-pointer disabled:opacity-50"
                    >
                      Retry
                    </button>
                  )}
                  <button
                    onClick={() => setErrorMessage(null)}
                    className="text-rose-400 hover:text-rose-200 font-bold px-1"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            {/* Chat Messages Stream */}
            <div className="relative z-10 flex-1 overflow-y-auto p-6 space-y-6">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-4 py-10 space-y-5 animate-scale-in">
                  {/* Glowing Hero Fluid Orb Logo */}
                  <AIFluidOrbLogo size="xl" isThinking={loading} className="mb-2" />

                  {/* Google Gemini Large Native Greeting */}
                  <h1 className="text-2xl sm:text-3xl font-light text-ink-100 tracking-tight">
                    What's next, <span className="font-semibold text-accent-400">{firstName}</span>?
                  </h1>

                  <p className="text-xs text-ink-400 max-w-sm leading-relaxed">
                    Ask questions about your workplace attendance, AI stress records, overdue tasks, or team performance.
                  </p>

                  {/* Suggested Quick Prompt Chips */}
                  <div className="w-full max-w-md pt-4 space-y-2.5">
                    <p className="text-[10px] font-bold text-ink-500 uppercase tracking-[0.2em] text-left px-1 font-spacex">
                      Suggested Prompts
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {suggestedPrompts.map((promptText, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSend(promptText)}
                          className="group p-3 rounded-2xl glass-card hover:border-accent-500/40 text-left transition-all duration-300 flex items-center gap-3 cursor-pointer"
                        >
                          <div className="w-7 h-7 rounded-xl bg-accent-500/10 border border-accent-500/20 text-accent-400 flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:bg-accent-500/20 transition-all">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                            </svg>
                          </div>
                          <span className="text-xs font-medium text-ink-200 group-hover:text-ink-100 line-clamp-2">
                            {promptText}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                  >
                    <div className="flex items-center gap-1.5 mb-1.5 px-1">
                      <span className="text-[10px] font-semibold text-ink-500 uppercase tracking-wider">
                        {msg.role === "user" ? "You" : "Work Vise AI"}
                      </span>
                      <span className="text-[10px] text-ink-600">• {msg.timestamp}</span>
                    </div>

                    <div
                      className={`max-w-[90%] rounded-3xl px-5 py-3.5 text-xs leading-relaxed ${
                        msg.role === "user"
                          ? "bg-gradient-to-r from-accent-500 to-accent-600 text-base-950 font-medium rounded-tr-none shadow-lg shadow-accent-500/10"
                          : "bg-white/5 border border-white/10 text-ink-100 rounded-tl-none backdrop-blur-md prose-dark"
                      }`}
                    >
                      {msg.role === "user" ? (
                        msg.content
                      ) : (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      )}
                    </div>
                  </div>
                ))
              )}

              {/* Typing / Processing animation */}
              {loading && (
                <div className="flex flex-col items-start space-y-1">
                  <div className="flex items-center gap-1.5 px-1">
                    <span className="text-[10px] font-semibold text-accent-400 uppercase">Work Vise AI</span>
                    <span className="text-[10px] text-ink-500">• Processing query using {currentModelLabel}...</span>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-3xl rounded-tl-none px-5 py-3.5 text-xs text-ink-300 flex items-center gap-2.5 backdrop-blur-md">
                    <Spinner />
                    <span>Analyzing live database telemetry & generating response...</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Google Gemini Native Floating Search Capsule */}
            <div className="relative z-20 p-5 border-t border-white/10 bg-base-950/80 backdrop-blur-2xl shrink-0">
              {/* Quick Prompts Popover Menu when + clicked */}
              {showPromptsMenu && (
                <div className="mb-3 p-3 rounded-2xl bg-base-900 border border-white/10 shadow-2xl space-y-1.5 animate-fade-in-up">
                  <div className="flex items-center justify-between px-1 pb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-accent-400">Suggested Prompts</span>
                    <button onClick={() => setShowPromptsMenu(false)} className="text-ink-400 hover:text-ink-100 text-xs">✕</button>
                  </div>
                  {suggestedPrompts.map((p, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSend(p)}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-ink-200 hover:text-ink-100 hover:bg-white/10 transition-colors"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}

              {/* Model Dropdown Menu */}
              {showModelDropdown && (
                <div className="mb-3 p-3 rounded-2xl bg-base-900 border border-white/10 shadow-2xl space-y-1 animate-fade-in-up">
                  <div className="flex items-center justify-between px-2 pb-1 border-b border-white/10">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-accent-400">Select Gemini Model</span>
                    <button onClick={() => setShowModelDropdown(false)} className="text-ink-400 hover:text-ink-100 text-xs">✕</button>
                  </div>
                  {AVAILABLE_MODELS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setSelectedModel(m.id);
                        setShowModelDropdown(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-colors ${
                        selectedModel === m.id
                          ? "bg-accent-500/15 text-accent-400 font-semibold border border-accent-500/30"
                          : "text-ink-200 hover:bg-white/10"
                      }`}
                    >
                      <div>
                        <div className="font-semibold">{m.label}</div>
                        <div className="text-[10px] text-ink-400">{m.desc}</div>
                      </div>
                      {selectedModel === m.id && <span className="text-accent-400 font-bold">✓</span>}
                    </button>
                  ))}
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="relative flex items-center h-14 rounded-full bg-[#1e2330]/90 border border-white/15 px-3.5 shadow-xl transition-all duration-300 focus-within:border-accent-500/60 focus-within:ring-1 focus-within:ring-accent-500/40"
              >
                {/* Left + Button */}
                <button
                  type="button"
                  onClick={() => {
                    setShowPromptsMenu(!showPromptsMenu);
                    setShowModelDropdown(false);
                  }}
                  className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center text-ink-400 hover:text-ink-100 transition-colors shrink-0"
                  title="Suggested Prompts Menu"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>

                {/* Main Search Input */}
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask Workwise AI"
                  disabled={loading || !hasApiKey}
                  className="flex-1 h-full bg-transparent px-3 text-sm text-ink-100 placeholder:text-ink-400 font-display font-medium outline-none disabled:opacity-50"
                />

                {/* Right controls: Interactive Model Selector Capsule + Microphone */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModelDropdown(!showModelDropdown);
                      setShowPromptsMenu(false);
                    }}
                    className="px-3 py-1.5 rounded-full bg-white/5 border border-white/15 hover:bg-white/15 hover:border-accent-400/50 text-[11px] font-semibold text-ink-200 hover:text-ink-100 flex items-center gap-1.5 transition-all cursor-pointer"
                    title="Change Gemini Model"
                  >
                    <span>{currentModelLabel}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  {/* Speech Microphone Button */}
                  <button
                    type="button"
                    onClick={toggleVoiceInput}
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                      isListening
                        ? "bg-rose-500 text-white animate-pulse"
                        : "text-ink-400 hover:text-ink-100 hover:bg-white/10"
                    }`}
                    title={isListening ? "Listening... click to stop" : "Start Voice Speech Input"}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="22" />
                    </svg>
                  </button>

                  {/* Send Button */}
                  <button
                    type="submit"
                    disabled={loading || !input.trim() || !hasApiKey}
                    className="w-9 h-9 rounded-full bg-accent-500 hover:bg-accent-400 disabled:opacity-30 text-base-950 font-bold flex items-center justify-center transition-all shrink-0 shadow-lg shadow-accent-500/20"
                    title="Send message"
                  >
                    {loading ? (
                      <Spinner />
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                    )}
                  </button>
                </div>
              </form>

              <p className="text-[10px] text-ink-500 text-center mt-2 font-medium">
                🔒 Your data is secure.
              </p>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
