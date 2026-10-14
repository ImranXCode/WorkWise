import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import { Spinner } from "../components/icons";
import { useAuth } from "../lib/AuthContext";

export default function SetNamePage() {
  const navigate = useNavigate();
  const { updateFullName } = useAuth();

  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Enter your full name to continue.");
      return;
    }

    setLoading(true);
    const { error } = await updateFullName(name.trim());
    setLoading(false);

    if (error) {
      setError(error);
      return;
    }
    navigate("/");
  }

  return (
    <AuthShell>
      <div className="mb-9">
        <h2 className="font-display text-2xl font-semibold text-ink-100 mb-2">
          What's your name?
        </h2>
        <p className="text-ink-500 text-sm">
          We'll use this to identify you across your workspace.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="name"
            className="block text-xs font-medium text-ink-300 mb-1.5"
          >
            Full name
          </label>
          <input
            id="name"
            type="text"
            autoComplete="name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Doe"
            className="w-full h-11 rounded-lg bg-base-800 border border-base-600 px-3.5 text-sm text-ink-100 placeholder:text-ink-500 outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500/40 transition-colors"
          />
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-[13px] text-red-300">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full h-11 rounded-lg bg-accent-500 hover:bg-accent-400 disabled:opacity-60 disabled:cursor-not-allowed transition-colors text-base-950 text-sm font-semibold flex items-center justify-center gap-2 shadow-glow"
        >
          {loading ? (
            <>
              <Spinner />
              Saving…
            </>
          ) : (
            "Continue"
          )}
        </button>
      </form>
    </AuthShell>
  );
}
