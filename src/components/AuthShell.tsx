import { ReactNode } from "react";
import Logo from "./Logo";
import ParticleField from "./ParticleField";

export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-base-950 flex">
      {/* Left brand panel */}
      <div className="hidden lg:flex lg:w-[46%] relative flex-col justify-between px-14 py-12 overflow-hidden border-r border-base-700/30">
        {/* Layered gradient background */}
        <div className="absolute inset-0 noise-veil" />
        <div
          className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full opacity-30 blur-[120px]"
          style={{
            background:
              "radial-gradient(circle, rgba(34,211,168,0.4), transparent 70%)",
          }}
        />
        <div
          className="absolute bottom-[-140px] right-[-100px] w-[450px] h-[450px] rounded-full opacity-25 blur-[120px]"
          style={{
            background:
              "radial-gradient(circle, rgba(59,123,246,0.45), transparent 70%)",
          }}
        />
        {/* Violet accent blob */}
        <div
          className="absolute top-[40%] right-[20%] w-[300px] h-[300px] rounded-full opacity-15 blur-[100px]"
          style={{
            background:
              "radial-gradient(circle, rgba(139,92,246,0.5), transparent 70%)",
            animation: "float 12s ease-in-out infinite",
          }}
        />

        {/* Dot grid overlay */}
        <div className="absolute inset-0 dot-grid opacity-40" />

        {/* Particle network animation */}
        <ParticleField
          count={50}
          color="34,211,168"
          lineColor="34,211,168"
          className="z-[1] opacity-60"
        />

        {/* Floating orbs */}
        <div className="absolute top-[15%] right-[10%] w-36 h-36 rounded-full opacity-15 blur-2xl"
          style={{ background: "conic-gradient(from 0deg, rgba(34,211,168,0.3), transparent, rgba(59,123,246,0.3), transparent)", animation: "face-ring-spin 20s linear infinite" }}
        />
        <div className="absolute bottom-[20%] left-[10%] w-28 h-28 rounded-full opacity-10 blur-2xl"
          style={{ background: "conic-gradient(from 180deg, rgba(59,123,246,0.3), transparent, rgba(34,211,168,0.3), transparent)", animation: "face-ring-spin 25s linear infinite reverse" }}
        />

        <Logo className="relative z-10" />

        <div className="relative z-10 max-w-md animate-fade-in-up">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent-500/8 border border-accent-500/15 mb-5">
            <div className="w-1.5 h-1.5 rounded-full bg-accent-400 glow-breathe" />
            <span className="text-accent-400 text-xs font-semibold tracking-wide uppercase">
              AI-Powered Intelligence
            </span>
          </div>
          <h1 className="font-display text-[2.8rem] leading-[1.06] font-semibold text-ink-100 mb-5">
            One dashboard for{" "}
            <span className="text-gradient animate-gradient-x"
              style={{ backgroundImage: "linear-gradient(135deg, rgb(var(--c-accent-400)), rgb(var(--c-cobalt-400)), rgb(var(--c-accent-400)))", backgroundSize: "200% auto" }}>
              attendance
            </span>
            , wellbeing, and workplace signal.
          </h1>
          <p className="text-ink-400 text-[15px] leading-relaxed">
            Workwise brings verified attendance and stress insight into a
            single, secure view — built for teams who take workplace
            wellbeing seriously.
          </p>

          {/* Trust indicators */}
          <div className="flex items-center gap-4 mt-8 animate-fade-in-up" style={{ animationDelay: "300ms" }}>
            <div className="flex items-center gap-2 text-ink-500 text-xs hover:text-accent-400 transition-colors duration-300 cursor-default group">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-300 group-hover:scale-110">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
              </svg>
              Enterprise security
            </div>
            <div className="w-1 h-1 rounded-full bg-ink-500/50" />
            <div className="flex items-center gap-2 text-ink-500 text-xs hover:text-accent-400 transition-colors duration-300 cursor-default group">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="transition-transform duration-300 group-hover:scale-110">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              Face verified
            </div>
            <div className="w-1 h-1 rounded-full bg-ink-500/50" />
            <div className="flex items-center gap-2 text-ink-500 text-xs hover:text-accent-400 transition-colors duration-300 cursor-default group">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="transition-transform duration-300 group-hover:scale-110">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Privacy first
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-6 text-ink-500 text-xs">
          <span>© 2026 Workwise</span>
        </div>
      </div>

      {/* Right content panel */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 relative overflow-hidden">
        {/* Subtle background */}
        <div className="absolute inset-0 dot-grid opacity-20" />

        {/* Ambient glow on right side */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-[0.03] blur-[120px] pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(34,211,168,0.5), transparent 70%)" }}
        />

        <div className="lg:hidden absolute top-8 left-6 z-10">
          <Logo />
        </div>
        <div className="w-full max-w-[400px] relative z-10 animate-fade-in-up" style={{ animationDelay: "100ms" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
