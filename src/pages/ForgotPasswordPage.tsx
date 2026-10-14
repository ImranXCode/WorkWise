import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import { Spinner, CheckIcon } from "../components/icons";
import { useAuth } from "../lib/AuthContext";

export default function ForgotPasswordPage() {
  const { sendPasswordReset } = useAuth();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email) {
      setError("Enter your account email.");
      return;
    }

    setLoading(true);
    const { error } = await sendPasswordReset(email);
    setLoading(false);

    if (error) {
      setError(error);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <AuthShell>
        <div className="text-center animate-fade-in-up">
          <div className="w-11 h-11 rounded-xl bg-accent-500/10 text-accent-400 flex items-center justify-center mx-auto mb-5" style={{ border: "1px solid rgba(var(--c-accent-500), 0.15)" }}>
            <CheckIcon />
          </div>
          <h2 className="font-display text-2xl font-bold text-ink-100 mb-2 tracking-tight">
            Reset link sent
          </h2>
          <p className="text-ink-500 text-sm mb-8">
            If an account exists for <strong className="text-ink-200">{email}</strong>,
            a password reset link is on its way.
          </p>
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
      <div className="mb-9 animate-fade-in-up">
        <h2 className="font-display text-2xl font-bold text-ink-100 mb-2 tracking-tight">
          Reset your password
        </h2>
        <p className="text-ink-500 text-sm">
          Enter your account email and we'll send you a reset link.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="animate-fade-in-up" style={{ animationDelay: "50ms" }}>
          <label
            htmlFor="email"
            className="block text-xs font-medium text-ink-400 mb-1.5"
          >
            Email address
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
            animationDelay: "100ms",
            background: "linear-gradient(135deg, rgb(var(--c-accent-500)), rgb(var(--c-accent-400)))",
            color: "rgb(var(--c-base-950))",
            boxShadow: loading ? "none" : "0 0 40px -8px rgba(var(--c-accent-500), 0.35)",
          }}
        >
          {loading ? (
            <>
              <Spinner />
              Sending…
            </>
          ) : (
            "Send reset link"
          )}
        </button>
      </form>

      <p className="text-center text-ink-500 text-sm mt-7 animate-fade-in-up" style={{ animationDelay: "150ms" }}>
        <Link
          to="/login"
          className="text-accent-500 hover:text-accent-400 font-medium transition-colors"
        >
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
