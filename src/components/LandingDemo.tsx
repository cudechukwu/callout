"use client";

import { useEffect, useRef, useState } from "react";
import { FighterSheet } from "@/components/FighterSheet";
import type { AttributeSelections } from "@/lib/simulation/types";

interface LandingDemoProps {
  name: string;
  selections: AttributeSelections;
  overall: number;
}

/** Plays the fighter reveal when the sheet scrolls into view, so the
 * animation isn't spent while it is still below the fold. */
export function LandingDemo({ name, selections, overall }: LandingDemoProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { threshold: 0.35 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="min-h-[24rem]">
      {seen && <FighterSheet name={name} selections={selections} overall={overall} reveal />}
    </div>
  );
}
