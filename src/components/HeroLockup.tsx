import Link from "next/link";
import { primaryButton } from "@/components/ui";

const STATS = [
  ["55", "real fighters"],
  ["8", "skills"],
  ["20", "fights"],
] as const;

interface HeroLockupProps {
  /** Overrides for the title's weight, width and spacing (used to compare typefaces). */
  titleStyle?: React.CSSProperties;
}

/**
 * The hero text: a title, one line, one button and a row of facts, laid
 * out like a game's store page. The photo carries the hero; the type
 * stays out of its way.
 */
export function HeroLockup({ titleStyle }: HeroLockupProps) {
  return (
    <div className="max-w-xl">
      <h1
        className="animate-rise-in font-display text-[clamp(2.4rem,5.2vw,4.4rem)] leading-[0.95] tracking-[0.07em] uppercase"
        style={{ fontWeight: 500, ...titleStyle }}
      >
        Five-Star MMA
      </h1>

      <p className="animate-rise-in mt-4 max-w-md text-lg text-bone/80" style={{ animationDelay: "160ms" }}>
        Draft eight fighters into one. See what you built. Then take on twenty in a row.
      </p>

      <div className="animate-rise-in mt-6 flex flex-wrap items-center gap-5" style={{ animationDelay: "280ms" }}>
        <Link href="/draft" className={primaryButton}>
          Build your fighter
        </Link>
        <a
          href="#how"
          className="text-sm font-medium text-bone/80 underline decoration-bone/30 underline-offset-4 transition-colors hover:text-bone"
        >
          How it works
        </a>
      </div>

      <dl className="animate-rise-in mt-9 flex gap-8 border-t border-bone/15 pt-4" style={{ animationDelay: "400ms" }}>
        {STATS.map(([value, label]) => (
          <div key={label}>
            <dd className="font-numeric text-3xl leading-none font-medium">{value}</dd>
            <dt className="mt-1 text-xs text-chalk">{label}</dt>
          </div>
        ))}
      </dl>
    </div>
  );
}
