import Link from "next/link";
import { LandingDemo } from "@/components/LandingDemo";
import { DEMO_SELECTIONS } from "@/lib/data/demoFighter";
import { computeOverall } from "@/lib/draft/overall";
import { primaryButton } from "@/components/ui";

export default function LandingPage() {
  return (
    <main>
      <section className="relative isolate flex min-h-[100svh] items-end overflow-hidden sm:items-center">
        {/* Background art. If the file is missing, the gradient still holds. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-20 bg-cover"
          style={{ backgroundImage: "url(/avatars/hero.png)", backgroundPosition: "82% top" }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-gradient-to-t from-canvas via-canvas/75 to-transparent sm:bg-gradient-to-r sm:from-canvas sm:via-canvas/70 sm:to-transparent"
        />

        <div className="mx-auto w-full max-w-6xl px-4 pt-28 pb-14 lg:px-10">
          <h1 className="font-display text-7xl leading-[0.85] font-black tracking-wide uppercase sm:text-8xl lg:text-9xl">
            Build the
            <br />
            perfect
            <br />
            fighter
          </h1>

          <p className="mt-6 max-w-md text-lg text-bone/80">
            Pick one fighter for each skill, without seeing their numbers. Then find out how
            good the fighter you built really is, and put them through twenty fights.
          </p>

          <Link href="/draft" className={`${primaryButton} mt-8 inline-flex`}>
            Build my fighter
          </Link>

          <p className="mt-5 max-w-md text-sm text-chalk">
            No account needed. Draft a fighter, take your first fight, then run the gauntlet.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-16 lg:px-10">
        <h2 className="font-display text-5xl leading-[0.9] font-black tracking-wide uppercase sm:text-6xl">
          Meet what you&rsquo;ll build
        </h2>
        <p className="mt-3 mb-8 max-w-lg text-chalk">
          Eight picks, one fighter. When the draft ends you see how strong the whole is, and
          which pick carried it and which held it back.
        </p>
        <LandingDemo
          name="Chiamaka"
          selections={DEMO_SELECTIONS}
          overall={computeOverall(DEMO_SELECTIONS)}
        />
      </section>
    </main>
  );
}
