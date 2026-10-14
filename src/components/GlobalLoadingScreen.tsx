import { useEffect, useState, useRef } from "react";
import AIFluidOrbLogo from "./AIFluidOrbLogo";



const loadingSteps = [
  "INITIALIZING WORKSPACE TELEMETRY...",
  "CONNECTING SECURE SIGNAL PIPELINE...",
  "VERIFYING SESSION CRYPTOGRAPHY...",
  "LOADING AI INTELLIGENCE CORE...",
  "PREPARING WORKWISE DASHBOARD...",
];

/* ── Mini particle canvas for the loading screen ─── */
function LoadingParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    type P = { x: number; y: number; vx: number; vy: number; r: number; o: number; hue: number };
    const particles: P[] = Array.from({ length: 60 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.8,
      vy: (Math.random() - 0.5) * 0.8,
      r: Math.random() * 2 + 0.5,
      o: Math.random() * 0.4 + 0.1,
      hue: Math.random() * 30 + 210, // Electric dark blue range (210-240)
    }));

    function draw() {
      if (!canvas || !ctx) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;
      }

      // Lines
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            const op = (1 - dist / 150) * 0.15;
            ctx.strokeStyle = `rgba(59, 130, 246, ${op})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      // Dots
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 85%, 60%, ${p.o})`;
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
}

export default function GlobalLoadingScreen({ message }: { message?: string }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStepIndex((prev) => (prev + 1) % loadingSteps.length);
    }, 800);
    return () => clearInterval(interval);
  }, []);

  // Smooth progress animation
  useEffect(() => {
    let frame: number;
    let start: number | null = null;
    const duration = 4000;

    function animate(ts: number) {
      if (start === null) start = ts;
      const elapsed = ts - start;
      const pct = Math.min(100, (elapsed / duration) * 100);
      setProgress(pct);
      if (pct < 100) {
        frame = requestAnimationFrame(animate);
      }
    }

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="fixed inset-0 z-[100] bg-[rgb(6,8,16)] flex flex-col items-center justify-center overflow-hidden select-none">
      {/* Background Particle Field */}
      <LoadingParticles />

      {/* Background Ambient Glow */}
      <div className="absolute inset-0 noise-veil opacity-60 pointer-events-none" />

      {/* Large floating ambient dark blue orbs */}
      <div
        className="absolute top-[15%] left-[20%] w-[500px] h-[500px] rounded-full opacity-20 blur-[120px] pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(37,99,235,0.45), transparent 70%)",
          animation: "float 8s ease-in-out infinite",
        }}
      />
      <div
        className="absolute bottom-[15%] right-[15%] w-[400px] h-[400px] rounded-full opacity-20 blur-[100px] pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(29,78,216,0.4), transparent 70%)",
          animation: "float 10s ease-in-out infinite reverse",
        }}
      />
      <div
        className="absolute top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-15 blur-[150px] pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(30,58,138,0.5), transparent 70%)",
          animation: "pulse-glow 6s ease-in-out infinite",
        }}
      />

      {/* Main Loader Container */}
      <div className="relative z-10 flex flex-col items-center max-w-sm px-6 text-center">
        {/* Animated Cybernetic Orb Container */}
        <div className="relative w-32 h-32 mb-10 flex items-center justify-center animate-fade-in-up">
          {/* Outer Conic Rotating Dark Blue Halo */}
          <div
            className="absolute inset-0 rounded-full opacity-90"
            style={{
              background:
                "conic-gradient(from 0deg, rgba(37,99,235,0.9), rgba(29,78,216,0.95), rgba(30,58,138,0.9), rgba(59,130,246,0.85), rgba(37,99,235,0.9))",
              animation: "face-ring-spin 4s linear infinite",
              filter: "blur(2px)",
            }}
          />

          {/* Secondary Counter-Rotating Ring */}
          <div
            className="absolute inset-3 rounded-full border border-dashed border-blue-400/40"
            style={{ animation: "face-ring-spin 12s linear infinite reverse" }}
          />

          {/* Third Accent Ring */}
          <div
            className="absolute inset-5 rounded-full border border-dotted border-blue-500/30"
            style={{ animation: "face-ring-spin 8s linear infinite" }}
          />

          {/* Inner Glass Core */}
          <div className="relative w-24 h-24 rounded-full bg-[rgb(6,8,16)]/90 border border-blue-400/50 backdrop-blur-xl flex items-center justify-center overflow-hidden"
            style={{ boxShadow: "0 0 40px rgba(37,99,235,0.4), inset 0 0 20px rgba(29,78,216,0.2)" }}>
            {/* Laser Scanning Line */}
            <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-blue-400 to-transparent animate-scan-laser"
              style={{ boxShadow: "0 0 16px #3b82f6" }} />

            <AIFluidOrbLogo sizePx={72} />
          </div>
        </div>

        {/* Brand Name */}
        <h2 className="font-spacex text-2xl font-black text-ink-100 tracking-[0.3em] mb-1.5 animate-fade-in-up"
          style={{ animationDelay: "100ms", textShadow: "0 0 30px rgba(255,255,255,0.15)" }}>
          WORKWISE
        </h2>
        <span className="text-[10px] font-bold text-blue-400 tracking-[0.25em] uppercase mb-8 animate-fade-in-up"
          style={{ animationDelay: "200ms" }}>
          AI WORKPLACE PLATFORM
        </span>

        {/* Premium Loading Progress Bar */}
        <div className="w-64 h-1 rounded-full bg-base-800/80 border border-base-700/30 overflow-hidden mb-4 animate-fade-in-up"
          style={{ animationDelay: "300ms" }}>
          <div
            className="h-full rounded-full transition-all duration-300 ease-out relative"
            style={{
              width: `${progress}%`,
              background: "linear-gradient(90deg, #1d4ed8, #2563eb, #3b82f6)",
              boxShadow: "0 0 16px rgba(59,130,246,0.7)",
            }}
          >
            {/* Shimmer overlay */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"
              style={{ backgroundSize: "200% 100%" }} />
          </div>
        </div>

        {/* Percentage */}
        <p className="text-[11px] font-mono font-bold text-blue-400 mb-2 animate-fade-in-up"
          style={{ animationDelay: "350ms" }}>
          {Math.round(progress)}%
        </p>

        {/* Animated Telemetry Step Ticker */}
        <p className="text-[11px] font-mono font-medium text-ink-400 tracking-wider h-4 truncate animate-fade-in-up"
          style={{ animationDelay: "400ms" }}>
          {message || loadingSteps[stepIndex]}
        </p>
      </div>
    </div>
  );
}
