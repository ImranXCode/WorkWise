import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import { GoogleIcon, EyeIcon, EyeOffIcon, Spinner } from "../components/icons";
import { useAuth } from "../lib/AuthContext";

export default function LoginPage() {
  const navigate = useNavigate();
  const { signInWithPassword, signInWithGoogle } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError("Enter your email and password to continue.");
      return;
    }

    setLoading(true);
    const { error } = await signInWithPassword(email, password);
    setLoading(false);

    if (error) {
      setError(error);
      return;
    }

    sessionStorage.setItem("nexora_just_logged_in", "true");
    navigate("/");
  }

  async function handleGoogle() {
    setError(null);
    setGoogleLoading(true);
    const { error } = await signInWithGoogle();
    setGoogleLoading(false);
    if (error) setError(error);
    // On success, Supabase redirects the browser to Google, then back to /home.
  }

  return (
    <AuthShell>
      <div className="mb-9 animate-fade-in-up">
        <h2 className="font-display text-2xl font-bold text-ink-100 mb-2 tracking-tight">
          Welcome back
        </h2>
        <p className="text-ink-500 text-sm">
          Sign in to your workplace dashboard.
        </p>
      </div>

      <button
        type="button"
        onClick={handleGoogle}
        disabled={googleLoading}
        className="w-full h-11 rounded-xl border border-base-700/40 bg-base-800/40 hover:bg-base-700/60 disabled:opacity-60 transition-all duration-250 flex items-center justify-center gap-3 text-ink-200 text-sm font-medium mb-6 hover:border-base-600/60 animate-fade-in-up"
        style={{ animationDelay: "50ms" }}
      >
        {googleLoading ? <Spinner /> : <GoogleIcon />}
        Continue with Google
      </button>

      <div className="flex items-center gap-3 mb-6">
        <div className="h-px flex-1 bg-base-700/50" />
        <span className="text-ink-500 text-xs font-medium">or continue with email</span>
        <div className="h-px flex-1 bg-base-700/50" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="animate-fade-in-up" style={{ animationDelay: "100ms" }}>
          <label
            htmlFor="email"
            className="block text-xs font-medium text-ink-400 mb-1.5"
          >
            Email address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="off"
            readOnly
            onFocus={(e) => e.currentTarget.removeAttribute("readOnly")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full h-11 rounded-xl bg-base-800/50 border border-base-700/40 px-3.5 text-sm text-ink-100 placeholder:text-ink-500 outline-none focus:border-accent-500/60 focus:ring-1 focus:ring-accent-500/20 transition-all duration-250"
          />
        </div>

        <div className="animate-fade-in-up" style={{ animationDelay: "150ms" }}>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="password"
              className="block text-xs font-medium text-ink-400"
            >
              Password
            </label>
            <Link
              to="/forgot-password"
              className="text-xs text-accent-500 hover:text-accent-400 transition-colors font-medium"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="off"
              readOnly
              onFocus={(e) => e.currentTarget.removeAttribute("readOnly")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
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
              Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </button>
      </form>

      <div className="mt-8 pt-6 border-t border-base-700/40 text-center space-y-3 animate-fade-in-up" style={{ animationDelay: "250ms" }}>
        <p className="text-ink-400 text-xs font-medium uppercase tracking-wider">New to Workwise?</p>
        <div className="grid grid-cols-2 gap-2.5">
          <Link
            to="/signup"
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-base-800/60 border border-base-700/50 hover:bg-base-700/70 hover:border-accent-500/50 text-ink-100 hover:text-accent-300 text-xs font-semibold transition-all group"
          >
            <span className="group-hover:scale-110 transition-transform">🏢</span>
            <span>Create Company</span>
          </Link>
          <Link
            to="/signup"
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-base-800/60 border border-base-700/50 hover:bg-base-700/70 hover:border-cyan-500/50 text-ink-100 hover:text-cyan-300 text-xs font-semibold transition-all group"
          >
            <span className="group-hover:scale-110 transition-transform">🔑</span>
            <span>Join Company</span>
          </Link>
        </div>
        <p className="text-ink-500 text-xs pt-1">
          Don't have an account?{" "}
          <Link
            to="/signup"
            className="text-accent-400 hover:text-accent-300 font-semibold transition-colors"
          >
            Sign up / Register
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
