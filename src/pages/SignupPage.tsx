import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import { EyeIcon, EyeOffIcon, Spinner } from "../components/icons";
import { useAuth } from "../lib/AuthContext";
import { supabase } from "../lib/supabase";

export default function SignupPage() {
  const { signUpWithPassword } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!fullName.trim() || !email || !password) {
      setError("Enter your name, email, and password to continue.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    const { error, needsConfirmation } = await signUpWithPassword(
      email,
      password,
      fullName.trim()
    );
    setLoading(false);

    if (error) {
      setError(error);
      return;
    }

    if (needsConfirmation) {
      setSubmitted(true);
    } else {
      // Auto-confirmed — go straight to onboarding
      navigate("/onboarding");
    }
  }

  async function handleResendConfirmation() {
    setResending(true);
    setResendMsg(null);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
    });
    setResending(false);
    if (error) {
      setResendMsg("Failed to resend. Please try again in a minute.");
    } else {
      setResendMsg("Confirmation email resent! Check your inbox and spam folder.");
    }
  }

  if (submitted) {
    return (
      <AuthShell>
        <div className="text-center animate-fade-in-up">
          <h2 className="font-display text-2xl font-bold text-ink-100 mb-2">
            Check your inbox
          </h2>
          <p className="text-ink-500 text-sm mb-4">
            We sent a confirmation link to <strong className="text-ink-200">{email}</strong>.
            Confirm your email, then sign in.
          </p>
          <p className="text-ink-500 text-xs mb-6">
            Didn't receive it? Check your spam folder, or click below to resend.
          </p>

          <button
            onClick={handleResendConfirmation}
            disabled={resending}
            className="w-full h-11 rounded-xl bg-base-800/40 border border-base-700/40 hover:bg-base-700/50 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-250 text-ink-200 text-sm font-medium flex items-center justify-center gap-2 mb-3"
          >
            {resending ? (
              <>
                <Spinner />
                Resending…
              </>
            ) : (
              "Resend confirmation email"
            )}
          </button>

          {resendMsg && (
            <div className={`rounded-xl border px-3.5 py-2.5 text-[13px] mb-4 ${
              resendMsg.includes("resent")
                ? "border-green-500/20 bg-green-500/8 text-green-300"
                : "border-red-500/20 bg-red-500/8 text-red-300"
            }`}>
              {resendMsg}
            </div>
          )}

          <Link
            to="/login"
            className="inline-block h-11 leading-[44px] px-6 rounded-xl text-sm font-semibold transition-all duration-300"
            style={{
              background: "linear-gradient(135deg, rgb(var(--c-accent-500)), rgb(var(--c-accent-400)))",
              color: "rgb(var(--c-base-950))",
              boxShadow: "0 0 30px -8px rgba(var(--c-accent-500), 0.3)",
            }}
          >
            Back to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="mb-7 animate-fade-in-up">
        <h2 className="font-display text-2xl font-bold text-ink-100 mb-2 tracking-tight">
          Create your account
        </h2>
        <p className="text-ink-400 text-sm">
          Sign up to create a new company workspace or join an existing team.
        </p>
        <div className="flex items-center gap-2 mt-3.5">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-accent-500/10 border border-accent-500/20 text-accent-300 text-[11px] font-semibold">
            🏢 Create Company (Owner)
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-[11px] font-semibold">
            🔑 Join Company (Employee)
          </span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="animate-fade-in-up" style={{ animationDelay: "50ms" }}>
          <label
            htmlFor="fullName"
            className="block text-xs font-medium text-ink-400 mb-1.5"
          >
            Full name
          </label>
          <input
            id="fullName"
            type="text"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jane Doe"
            className="w-full h-11 rounded-xl bg-base-800/50 border border-base-700/40 px-3.5 text-sm text-ink-100 placeholder:text-ink-500 outline-none focus:border-accent-500/60 focus:ring-1 focus:ring-accent-500/20 transition-all duration-250"
          />
        </div>

        <div className="animate-fade-in-up" style={{ animationDelay: "100ms" }}>
          <label
            htmlFor="email"
            className="block text-xs font-medium text-ink-400 mb-1.5"
          >
            Work email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full h-11 rounded-xl bg-base-800/50 border border-base-700/40 px-3.5 text-sm text-ink-100 placeholder:text-ink-500 outline-none focus:border-accent-500/60 focus:ring-1 focus:ring-accent-500/20 transition-all duration-250"
          />
        </div>

        <div className="animate-fade-in-up" style={{ animationDelay: "150ms" }}>
          <label
            htmlFor="password"
            className="block text-xs font-medium text-ink-400 mb-1.5"
          >
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="w-full h-11 rounded-xl bg-base-800/50 border border-base-700/40 px-3.5 pr-11 text-sm text-ink-100 placeholder:text-ink-500 outline-none focus:border-accent-500/60 focus:ring-1 focus:ring-accent-500/20 transition-all duration-250"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-300 transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/8 px-3.5 py-2.5 text-[13px] text-red-300 animate-scale-in">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full h-11 rounded-xl disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-300 text-sm font-semibold flex items-center justify-center gap-2 animate-fade-in-up"
          style={{
            animationDelay: "200ms",
            background: "linear-gradient(135deg, rgb(var(--c-accent-500)), rgb(var(--c-accent-400)))",
            color: "rgb(var(--c-base-950))",
            boxShadow: loading ? "none" : "0 0 40px -8px rgba(var(--c-accent-500), 0.35)",
          }}
        >
          {loading ? (
            <>
              <Spinner />
              Creating account…
            </>
          ) : (
            "Create account"
          )}
        </button>
      </form>

      <p className="text-center text-ink-500 text-sm mt-7 animate-fade-in-up" style={{ animationDelay: "250ms" }}>
        Already have an account?{" "}
        <Link
          to="/login"
          className="text-accent-500 hover:text-accent-400 font-medium transition-colors"
        >
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
