import { useRef, useState, type ReactNode, type MouseEvent } from "react";

export default function TiltCard({
  children,
  className = "",
  glowColor = "34,211,168",
}: {
  children: ReactNode;
  className?: string;
  glowColor?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [transformStyle, setTransformStyle] = useState<string>("perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)");
  const [spotlightStyle, setSpotlightStyle] = useState<string>("transparent");

  function handleMove(e: MouseEvent) {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const midX = rect.width / 2;
    const midY = rect.height / 2;

    const rotateY = ((x - midX) / midX) * 7;
    const rotateX = ((midY - y) / midY) * 7;

    setTransformStyle(`perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`);
    setSpotlightStyle(`radial-gradient(600px circle at ${x}px ${y}px, rgba(${glowColor}, 0.12) 0%, transparent 70%)`);
  }

  function handleLeave() {
    setTransformStyle("perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)");
    setSpotlightStyle("transparent");
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className={`relative overflow-hidden transition-all duration-300 ease-out ${className}`}
      style={{
        transform: transformStyle,
        transformStyle: "preserve-3d",
        willChange: "transform",
      }}
    >
      {/* Liquid spotlight reflection layer */}
      <div
        className="pointer-events-none absolute inset-0 z-10 transition-opacity duration-300"
        style={{ background: spotlightStyle }}
      />
      {children}
    </div>
  );
}
