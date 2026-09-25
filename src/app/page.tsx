import { Avatar } from "@/components/Avatar";
import { HeroBackdrop } from "@/components/HeroBackdrop";
import { HeroLockup } from "@/components/HeroLockup";
import { LandingDemo } from "@/components/LandingDemo";
import { LiveFight } from "@/components/LiveFight";
import { DEMO_SELECTIONS } from "@/lib/data/demoFighter";
import { computeOverall } from "@/lib/draft/overall";

const FACTS = [
  "55 real fighters",
  "8 skills",
  "8 picks",
  "20 fights in a row",
  "Hidden ratings",
  "No account needed",
];

const STEPS = [
  {
    title: "Draft",
    body: "Pick a fighter for each of eight skills. Names only, so go with what you know.",
    names: ["Kamaru Usman", "Merab Dvalishvili", "Charles Oliveira"],
  },
  {
    title: "Reveal",
    body: "See your overall rating, your style and what it's built from.",
    names: [],
  },
  {
    title: "Rampage",
    body: "Take on 20 opponents in a row. Watch every fight or sim the rest.",
    names: [],
  },
];

export default function LandingPage() {
  return (
    <main>
      <section className="relative isolate flex min-h-[100svh] items-end overflow-hidden">
        <HeroBackdrop />
        <div className="mx-auto w-full max-w-6xl px-4 pt-28 pb-14 lg:px-10 lg:pb-16">
          <HeroLockup />
        </div>
      </section>

      {/* Ticker: plain facts about the game. */}
      <div className="overflow-hidden bg-corner-red py-3 text-bone" aria-label="About the game">
        <div className="animate-marquee flex w-max gap-10 whitespace-nowrap font-display text-2xl leading-none font-extrabold tracking-wide uppercase">
          {[...FACTS, ...FACTS].map((fact, index) => (
            <span key={index} className="flex items-center gap-10" aria-hidden={index >= FACTS.length}>
              {fact}
              <span aria-hidden="true">★</span>
            </span>
          ))}
        </div>
      </div>

      <section className="mx-auto max-w-6xl px-4 py-20 lg:px-10">
        <div className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
          <div>
            <h2 className="font-display text-6xl leading-[0.88] font-black tracking-wide uppercase sm:text-7xl">
              Fight night
            </h2>
            <p className="mt-4 max-w-md text-chalk">
              Chiamaka, {computeOverall(DEMO_SELECTIONS)} overall, takes on a new CPU every fight.
              Build yours and see how it does.
            </p>
          </div>
          <LiveFight />
        </div>
      </section>

      {/* Light band: the dark brand needs somewhere to breathe. */}
      <section id="how" className="bg-paper text-ink">
        <div className="mx-auto max-w-6xl px-4 py-20 lg:px-10">
          <h2 className="font-display text-6xl leading-[0.88] font-black tracking-wide uppercase sm:text-7xl">
            How it works
          </h2>
          <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <p className="font-display text-7xl leading-none font-black text-corner-red">{index + 1}</p>
                <h3 className="mt-3 font-display text-4xl leading-none font-extrabold tracking-wide uppercase">
                  {step.title}
                </h3>
                <p className="mt-3 max-w-sm text-ink/70">{step.body}</p>
                <div className="mt-5" aria-hidden="true">
                  {step.title === "Draft" && (
                    <div className="flex gap-2">
                      {step.names.map((name) => (
                        <Avatar key={name} name={name} corner="neutral" className="cut-sm h-16 w-14" />
                      ))}
                    </div>
                  )}
                  {step.title === "Reveal" && (
                    <div className="flex items-end gap-4">
                      <p className="font-display text-6xl leading-[0.8] font-black text-belt-gold">91</p>
                      <div className="flex w-32 flex-col gap-1.5 pb-1">
                        {[92, 78, 96, 64].map((w) => (
                          <span key={w} className="block h-1.5 bg-ink/15">
                            <span className="block h-full bg-corner-red" style={{ width: `${w}%` }} />
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {step.title === "Rampage" && (
                    <div className="flex w-56 gap-[3px]">
                      {Array.from({ length: 20 }, (_, i) => (
                        <span
                          key={i}
                          className={`h-3 flex-1 skew-x-[-18deg] ${[3, 7, 11, 14, 17].includes(i) ? "bg-ink/25" : "bg-corner-red"}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-20 lg:px-10">
        <h2 className="font-display text-5xl leading-[0.9] font-black tracking-wide uppercase sm:text-6xl">
          The reveal
        </h2>
        <p className="mt-3 mb-8 max-w-lg text-chalk">
          Every build ends with an overall rating, a style, and the eight fighters it is built from.
        </p>
        <LandingDemo name="Chiamaka" selections={DEMO_SELECTIONS} overall={computeOverall(DEMO_SELECTIONS)} />
      </section>

      <footer className="border-t border-line px-4 py-8 text-center text-xs text-chalk-faint">
        Five-Star MMA is an independent fan project. Not affiliated with or endorsed by the UFC,
        any promotion or any fighter.
      </footer>
    </main>
  );
}
