import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import { Spinner } from "../components/icons";
import { useAuth } from "../lib/AuthContext";

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function CreateCompanyPage() {
  const navigate = useNavigate();
  const { createOrganization, user } = useAuth();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleNameChange(value: string) {
    setName(value);
    if (!slugEdited) setSlug(slugify(value));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !slug.trim()) {
      setError("Enter a company name and workspace URL.");
      return;
    }

    setLoading(true);
    const { error } = await createOrganization(name.trim(), slug.trim());
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
          Create your company workspace
        </h2>
        <p className="text-ink-500 text-sm">
          You'll be the owner of this workspace.
        </p>
        {user?.email && (
          <p className="text-ink-500 text-xs mt-2">
            Signed in as <span className="text-ink-300">{user.email}</span>
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="name"
            className="block text-xs font-medium text-ink-300 mb-1.5"
          >
            Company name
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Acme Technologies"
            className="w-full h-11 rounded-lg bg-base-800 border border-base-600 px-3.5 text-sm text-ink-100 placeholder:text-ink-500 outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500/40 transition-colors"
          />
        </div>

        <div>
          <label
            htmlFor="slug"
            className="block text-xs font-medium text-ink-300 mb-1.5"
          >
            Workspace URL
          </label>
          <div className="flex items-center h-11 rounded-lg bg-base-800 border border-base-600 focus-within:border-accent-500 focus-within:ring-1 focus-within:ring-accent-500/40 transition-colors overflow-hidden">
            <span className="pl-3.5 text-ink-500 text-sm">workwise.app/</span>
            <input
              id="slug"
              type="text"
              value={slug}
              onChange={(e) => {
                setSlugEdited(true);
                setSlug(slugify(e.target.value));
              }}
              placeholder="acme-technologies"
              className="flex-1 h-full bg-transparent pr-3.5 text-sm text-ink-100 placeholder:text-ink-500 outline-none"
            />
          </div>
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
              Creating workspace…
            </>
          ) : (
            "Create workspace"
          )}
        </button>
      </form>

      <p className="text-center text-ink-500 text-sm mt-7">
        <Link
          to="/onboarding"
          className="text-accent-500 hover:text-accent-400 font-medium transition-colors"
        >
          Back
        </Link>
      </p>
    </AuthShell>
  );
}
