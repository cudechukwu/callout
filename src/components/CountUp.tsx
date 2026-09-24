"use client";

import { useEffect, useState } from "react";

interface CountUpProps {
  value: number;
  durationMs?: number;
  delayMs?: number;
}

/** Counts from 0 to `value`. Shows the final value straight away for
 * people who prefer reduced motion. */
export function CountUp({ value, durationMs = 1300, delayMs = 0 }: CountUpProps) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return;
    }
    let frame = 0;
    let start = 0;
    const timeout = window.setTimeout(() => {
      const tick = (now: number) => {
        if (!start) start = now;
        const t = Math.min(1, (now - start) / durationMs);
        const eased = 1 - Math.pow(1 - t, 3);
        setShown(Math.round(value * eased));
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }, delayMs);
    return () => {
      window.clearTimeout(timeout);
      cancelAnimationFrame(frame);
    };
  }, [value, durationMs, delayMs]);

  return <span className="font-numeric tabular-nums">{shown}</span>;
}
