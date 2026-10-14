import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import { Spinner } from "../components/icons";
import { useAuth } from "../lib/AuthContext";
import { supabase } from "../lib/supabase";

// Accepts either a bare token or a full invite link and returns just the
// token, since people will naturally paste whichever they were given.
function extractToken(input: string): string {
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    const fromUrl = url.searchParams.get("token");
    if (fromUrl) return fromUrl;
  } catch {
    // Not a URL -- treat the whole input as the token itself.
  }
  return trimmed;
}

export default function AcceptInvitePage() {
  const navigate = useNavigate();
  const { acceptInvitation, user } = useAuth();
  const [searchParams] = useSearchParams();

  const urlToken = searchParams.get("token");
  const storedToken = sessionStorage.getItem("pending_invite_token");

  // If we arrived via a real link (token in the URL, or remembered from
  // one just before a login redirect), accept it automatically -- the
  // person shouldn't have to paste anything back in. Manual entry is only
  // for someone who received the code as plain text, not a clickable link.
  const [mode, setMode] = useState<"auto" | "manual">(
    urlToken || storedToken ? "auto" : "manual"
  );
  const [token, setToken] = useState(() => urlToken ?? storedToken ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoAttempted, setAutoAttempted] = useState(false);

  useEffect(() => {
    if (urlToken) {
      sessionStorage.setItem("pending_invite_token", urlToken);
    }
  }, [urlToken]);

  const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

  async function attemptAccept(rawToken: string) {
    setError(null);
    const cleanToken = extractToken(rawToken);

    if (!cleanToken) {
      setError("Enter your invitation passcode or link.");
      return;
    }

    setLoading(true);

    let tokenToSubmit = cleanToken;

    // Check if input is a 36-char UUID. If not, it's a short employee passcode (e.g. GROK-0012)
    if (!UUID_REGEX.test(cleanToken.trim())) {
      const upperCode = cleanToken.trim().toUpperCase();
      const cachedToken = localStorage.getItem(`nexora_passcode_${upperCode}`);

      if (cachedToken) {
        tokenToSubmit = cachedToken;
      } else {
        // Try the lookup_invite_token RPC to resolve passcode → UUID
        try {
          const { data: resolvedFromRpc, error: rpcErr } = await supabase.rpc("lookup_invite_token", {
            p_code: cleanToken.trim(),
          });

          if (!rpcErr && resolvedFromRpc) {
            tokenToSubmit = resolvedFromRpc;
          } else {
            // If lookup failed (permission, doesn't exist, etc.), submit the
            // passcode directly — accept_invitation(text) handles both UUIDs
            // and employee_code passcodes natively in the database.
            tokenToSubmit = cleanToken.trim();
          }
        } catch {
          // Network error or RPC doesn't exist yet — submit passcode directly
          tokenToSubmit = cleanToken.trim();
        }
      }
    }

    const { error } = await acceptInvitation(tokenToSubmit);
    setLoading(false);

    if (error) {
      setError(error);
      return;
    }
    sessionStorage.removeItem("pending_invite_token");
    navigate("/");
  }

  // Run automatically once, as soon as we know who's signed in.
  useEffect(() => {
    if (mode === "auto" && !autoAttempted && user) {
      setAutoAttempted(true);
      attemptAccept(token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, autoAttempted, user]);

  async function handleManualSubmit(e: FormEvent) {
    e.preventDefault();
    attemptAccept(token);
  }

  if (mode === "auto") {
    return (
      <AuthShell>
        <div className="mb-9">
          <h2 className="font-display text-2xl font-semibold text-ink-100 mb-2">
            Joining your company workspace
          </h2>
          {user?.email && (
            <p className="text-ink-500 text-xs">
              Signed in as{" "}
              <span className="text-ink-300">{user.email}</span>
            </p>
          )}
        </div>

        {loading || !autoAttempted ? (
          <div className="flex items-center gap-2.5 text-ink-400 text-sm py-2">
            <Spinner />
            Verifying your invitation…
          </div>
        ) : error ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-[13px] text-red-300">
              {error}
            </div>
            <button
              onClick={() => attemptAccept(token)}
              className="w-full h-11 rounded-lg bg-accent-500 hover:bg-accent-400 transition-colors text-base-950 text-sm font-semibold"
            >
              Try again
            </button>
            <button
              onClick={() => setMode("manual")}
              className="w-full text-center text-ink-500 hover:text-ink-300 text-sm transition-colors"
            >
              Enter a different invitation code
            </button>
          </div>
        ) : null}

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

  return (
    <AuthShell>
      <div className="mb-9">
        <h2 className="font-display text-2xl font-semibold text-ink-100 mb-2">
          Join your company workspace
        </h2>
        <p className="text-ink-500 text-sm">
          Paste the invitation link or code your admin sent you.
        </p>
        {user?.email && (
          <p className="text-ink-500 text-xs mt-2">
            Signed in as <span className="text-ink-300">{user.email}</span>.
            The invite must have been sent to this address.
          </p>
        )}
      </div>

      <form onSubmit={handleManualSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="token"
            className="block text-xs font-medium text-ink-300 mb-1.5"
          >
            Invitation link or code
          </label>
          <input
            id="token"
            type="text"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste the link or code here"
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
              Joining…
            </>
          ) : (
            "Join workspace"
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
