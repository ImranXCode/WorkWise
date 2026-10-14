import { useEffect, useRef, useState } from "react";

/**
 * Animates a number counting up from 0 to `value` over `duration` ms.
 * Uses easeOutExpo for a satisfying deceleration.
 */
export default function AnimatedCounter({
  value,
  duration = 1200,
  className = "",
}: {
  value: number;
  duration?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(0);
  const startTime = useRef<number | null>(null);
  const animFrame = useRef<number>(0);

  useEffect(() => {
    startTime.current = null;

    function easeOutExpo(t: number): number {
      return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    }

    function tick(now: number) {
      if (startTime.current === null) startTime.current = now;
      const elapsed = now - startTime.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutExpo(progress);

      setDisplay(Math.round(eased * value));

      if (progress < 1) {
        animFrame.current = requestAnimationFrame(tick);
      }
    }

    animFrame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrame.current);
  }, [value, duration]);

  return <span className={className}>{display}</span>;
}
