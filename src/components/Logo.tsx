import AIFluidOrbLogo from "./AIFluidOrbLogo";

export default function Logo({ className = "", hideText = false }: { className?: string; hideText?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Sleek Circular Cybernetic Neon Logo Badge */}
      <div className="relative shrink-0 select-none group flex items-center justify-center">
        <AIFluidOrbLogo sizePx={38} />
      </div>

      {!hideText && (
        <div className="flex flex-col">
          <span className="font-spacex text-[14px] font-black text-ink-100 tracking-[0.22em] leading-tight"
            style={{ textShadow: "0 0 20px rgba(255,255,255,0.15)" }}>
            WORKWISE
          </span>
          <span className="text-[8px] font-bold text-accent-400 tracking-[0.18em] uppercase leading-tight mt-0.5 font-spacex">
            AI WORKPLACE PLATFORM
          </span>
        </div>
      )}
    </div>
  );
}

