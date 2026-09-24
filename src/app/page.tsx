import Link from "next/link";
import { FighterCard } from "@/components/FighterCard";
import { DEMO_SELECTIONS } from "@/lib/data/demoFighter";

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-16 lg:px-10">
      <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <div>
          <p className="font-display text-sm font-semibold tracking-[0.2em] text-accent">
            FIVE-STAR MMA
          </p>

          <h1 className="mt-4 font-display text-6xl leading-[0.95] font-black tracking-tight uppercase sm:text-7xl">
            Build the
            <br />
            perfect fighter.
          </h1>

          <p className="mt-6 max-w-md text-lg text-text-muted">
            Choose the abilities. Enter the cage. See how long you survive.
          </p>

          <Link
            href="/draft"
            className="mt-8 inline-flex items-center bg-accent px-8 py-4 font-display text-lg font-bold tracking-wide text-bg uppercase transition-colors hover:bg-accent-hover"
          >
            Build my fighter
          </Link>

          <p className="mt-6 max-w-md text-sm text-text-faint">
            No account needed. Draft a fighter, take your first fight, then
            run the gauntlet.
          </p>
        </div>

        <div>
          <FighterCard name="Chiamaka" selections={DEMO_SELECTIONS} animateIn />
        </div>
      </div>
    </main>
  );
}
