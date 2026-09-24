import Link from "next/link";
import { FighterSheet } from "@/components/FighterSheet";
import { DEMO_SELECTIONS } from "@/lib/data/demoFighter";
import { computeOverall } from "@/lib/draft/overall";
import { primaryButton } from "@/components/ui";

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-4 py-12 lg:px-10">
      <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.15fr] lg:gap-14">
        <div>
          <h1 className="font-display text-7xl leading-[0.85] font-black tracking-wide uppercase sm:text-8xl lg:text-9xl">
            Build the
            <br />
            perfect
            <br />
            fighter
          </h1>

          <p className="mt-6 max-w-md text-lg text-chalk">
            Pick one fighter for each skill, without seeing their numbers. Then find out
            how good the fighter you built really is, and put them through twenty fights.
          </p>

          <Link href="/draft" className={`${primaryButton} mt-8 inline-flex`}>
            Build my fighter
          </Link>

          <p className="mt-5 max-w-md text-sm text-chalk-faint">
            No account needed. Draft a fighter, take your first fight, then run the gauntlet.
          </p>
        </div>

        <FighterSheet
          name="Chiamaka"
          selections={DEMO_SELECTIONS}
          overall={computeOverall(DEMO_SELECTIONS)}
          reveal
        />
      </div>
    </main>
  );
}
