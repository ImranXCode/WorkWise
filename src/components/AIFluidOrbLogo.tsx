interface AIFluidOrbLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  sizePx?: number;
  isThinking?: boolean;
  className?: string;
}

export default function AIFluidOrbLogo({
  size = "md",
  sizePx,
  isThinking = false,
  className = "",
}: AIFluidOrbLogoProps) {
  // Determine pixel dimensions based on preset size or explicit sizePx
  const getDimensions = () => {
    if (sizePx) return sizePx;
    switch (size) {
      case "sm":
        return 54; // Slightly bigger for floating trigger
      case "md":
        return 64; // Drawer header
      case "lg":
        return 120;
      case "xl":
        return 180; // Hero greeting
      default:
        return 64;
    }
  };

  const dim = getDimensions();

  return (
    <div
      className={`relative flex items-center justify-center shrink-0 select-none group ${
        isThinking ? "ai-orb-thinking" : ""
      } ${className}`}
      style={{ width: `${dim}px`, height: `${dim}px` }}
    >
      {/* Dynamic Animated Liquid Glow Backing */}
      <div
        className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 blur-md opacity-80 animate-pulse-glow transition-transform duration-500 group-hover:scale-110"
        style={{
          boxShadow: isThinking
            ? "0 0 50px rgba(37, 99, 235, 0.95), 0 0 70px rgba(59, 130, 246, 0.85)"
            : "0 0 30px rgba(37, 99, 235, 0.7), 0 0 45px rgba(29, 78, 216, 0.5)",
        }}
      />

      {/* Rotating Fluid Mesh Ring Behind Logo */}
      <div
        className={`absolute inset-1 rounded-full ai-orb-layer-1 blur-sm opacity-90 transition-transform duration-700 ${
          isThinking ? "animate-spin" : "group-hover:rotate-45"
        }`}
      />

      {/* The Exact Graphic Logo Image Uploaded by User */}
      <img
        src="/ai-orb-logo.png"
        alt="Workwise AI Logo"
        className={`relative z-10 w-full h-full object-contain transition-all duration-300 group-hover:scale-105 ${
          isThinking ? "animate-pulse" : ""
        }`}
        style={{
          filter: "drop-shadow(0 0 12px rgba(37, 99, 235, 0.8)) drop-shadow(0 0 20px rgba(29, 78, 216, 0.6))",
        }}
      />
    </div>
  );
}
