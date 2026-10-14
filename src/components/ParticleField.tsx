import { useEffect, useRef } from "react";

type Particle3D = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  r: number;
  alpha: number;
};

export default function ParticleField({
  count = 60,
  color = "34,211,168",
  lineColor = "59,130,246",
  className = "",
}: {
  count?: number;
  color?: string;
  lineColor?: string;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle3D[]>([]);
  const animationId = useRef<number>(0);
  const mousePos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function resize() {
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx?.scale(dpr, dpr);
    }

    resize();
    window.addEventListener("resize", resize);

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mousePos.current = {
        x: (e.clientX - rect.left - rect.width / 2) * 0.05,
        y: (e.clientY - rect.top - rect.height / 2) * 0.05,
      };
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });

    // Initialize 3D particles with z depth
    const rect = canvas.getBoundingClientRect();
    particles.current = Array.from({ length: count }, () => ({
      x: (Math.random() - 0.5) * rect.width * 1.2,
      y: (Math.random() - 0.5) * rect.height * 1.2,
      z: Math.random() * 400 + 100,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      vz: (Math.random() - 0.5) * 0.2,
      r: Math.random() * 2.5 + 1,
      alpha: Math.random() * 0.6 + 0.2,
    }));

    function draw() {
      if (!canvas || !ctx) return;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const cx = w / 2 + mousePos.current.x;
      const cy = h / 2 + mousePos.current.y;

      ctx.clearRect(0, 0, w, h);

      const pts = particles.current;
      const focalLength = 300;

      // Project 3D points
      const projected = pts.map((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.z += p.vz;

        if (p.x < -w) p.x = w;
        if (p.x > w) p.x = -w;
        if (p.y < -h) p.y = h;
        if (p.y > h) p.y = -h;
        if (p.z < 50) p.z = 500;
        if (p.z > 500) p.z = 50;

        const scale = focalLength / (focalLength + p.z);
        const px = cx + p.x * scale;
        const py = cy + p.y * scale;
        const pr = Math.max(0.5, p.r * scale * 1.5);
        return { px, py, pr, scale, alpha: p.alpha * scale };
      });

      // Draw constellation trajectory connections
      const maxDist = 130;
      for (let i = 0; i < projected.length; i++) {
        for (let j = i + 1; j < projected.length; j++) {
          const dx = projected[i].px - projected[j].px;
          const dy = projected[i].py - projected[j].py;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < maxDist) {
            const opacity = (1 - dist / maxDist) * 0.25 * projected[i].scale;
            ctx.strokeStyle = `rgba(${lineColor},${opacity})`;
            ctx.lineWidth = 0.8 * projected[i].scale;
            ctx.beginPath();
            ctx.moveTo(projected[i].px, projected[i].py);
            ctx.lineTo(projected[j].px, projected[j].py);
            ctx.stroke();
          }
        }
      }

      // Render glowing 3D nodes
      for (const p of projected) {
        ctx.beginPath();
        ctx.arc(p.px, p.py, p.pr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color},${p.alpha})`;
        ctx.shadowColor = `rgba(${color},0.5)`;
        ctx.shadowBlur = p.pr * 4;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      animationId.current = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(animationId.current);
    };
  }, [count, color, lineColor]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
    />
  );
}
