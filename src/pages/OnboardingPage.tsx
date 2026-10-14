import { Link } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import { useAuth } from "../lib/AuthContext";

export default function OnboardingPage() {
  const { user, signOut } = useAuth();
  const displayName =
    user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email;

  return (
    <AuthShell>
      <div className="mb-7 animate-fade-in-up">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-500/10 border border-accent-500/20 text-accent-400 text-xs font-semibold mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-400 animate-pulse" />
          Workspace Setup
        </div>
        <h2 className="font-display text-2xl font-bold text-ink-100 mb-2 tracking-tight">
          Welcome{displayName ? `, ${displayName.split(" ")[0]}` : ""}!
        </h2>
        <p className="text-ink-400 text-sm">
          Please select an option below to proceed:
        </p>
      </div>

      <div className="space-y-4 animate-fade-in-up" style={{ animationDelay: "100ms" }}>
        {/* Option 1: Create a Company */}
        <Link
          to="/create-company"
          className="group relative block rounded-2xl border border-base-700/60 bg-gradient-to-b from-base-800/80 to-base-900/90 p-5 hover:border-accent-500/50 hover:bg-base-800/90 transition-all duration-300 shadow-lg hover:shadow-accent-500/10"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-accent-500/15 border border-accent-500/30 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform duration-300">
              <svg className="w-6 h-6 text-accent-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5m0 0h4m-4 0V14m0-4h.01M9 14h.01M9 10h.01M15 14h.01M15 10h.01" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold tracking-wider text-accent-400 uppercase bg-accent-500/10 px-2.5 py-0.5 rounded-full border border-accent-500/20">
                  Company Owner / Admin
                </span>
                <svg className="w-5 h-5 text-ink-500 group-hover:text-accent-400 group-hover:translate-x-1 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
              <h3 className="text-ink-100 font-semibold text-base group-hover:text-accent-300 transition-colors">
                Create a New Company
              </h3>
              <p className="text-ink-400 text-xs mt-1 leading-relaxed">
                Set up your company workspace, manage attendance, stress monitoring, and invite team members.
              </p>
            </div>
          </div>
        </Link>

        {/* Option 2: Join Existing Company */}
        <Link
          to="/accept-invite"
          className="group relative block rounded-2xl border border-base-700/60 bg-gradient-to-b from-base-800/80 to-base-900/90 p-5 hover:border-cyan-500/50 hover:bg-base-800/90 transition-all duration-300 shadow-lg hover:shadow-cyan-500/10"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform duration-300">
              <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold tracking-wider text-cyan-400 uppercase bg-cyan-500/10 px-2.5 py-0.5 rounded-full border border-cyan-500/20">
                  Employee / Staff
                </span>
                <svg className="w-5 h-5 text-ink-500 group-hover:text-cyan-400 group-hover:translate-x-1 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
              <h3 className="text-ink-100 font-semibold text-base group-hover:text-cyan-300 transition-colors">
                Join an Existing Company
              </h3>
              <p className="text-ink-400 text-xs mt-1 leading-relaxed">
                Enter your employee passcode (e.g. GROK-0012) or invitation link provided by your admin.
              </p>
            </div>
          </div>
        </Link>
      </div>

      <div className="mt-7 pt-5 border-t border-base-700/50 flex items-center justify-between text-xs text-ink-500">
        <span>Signed in as <strong className="text-ink-300 font-medium">{user?.email}</strong></span>
        <button
          onClick={signOut}
          className="text-red-400 hover:text-red-300 font-medium transition-colors"
        >
          Sign out
        </button>
      </div>
    </AuthShell>
  );
}
