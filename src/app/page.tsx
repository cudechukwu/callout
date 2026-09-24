import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { LandingDemo } from "@/components/LandingDemo";
import { LiveFight } from "@/components/LiveFight";
import { DEMO_SELECTIONS } from "@/lib/data/demoFighter";
import { computeOverall } from "@/lib/draft/overall";
import { primaryButton } from "@/components/ui";

const HEADLINE = ["Build the", "perfect", "fighter"];
const FACTS = [
  "55 real fighters",
  "8 skills, 8 picks",
  "You never see the numbers",
  "1 fighter, built by you",
  "20 fights in a row",
  "No account needed",
];

const STEPS = [
  {
    title: "Draft",
    body: "Pick one fighter for each of eight skills. You see names and faces, never numbers, so it comes down to what you know.",
    names: ["Kamaru Usman", "Merab Dvalishvili", "Charles Oliveira"],
  },
  {
    title: "Reveal",
    body: "Your fighter's overall lands, and the bars show what carried the build and what held it back.",
    names: [],
  },
  {
    title: "Rampage",
    body: "Twenty fights in a row against fresh CPU builds. Watch each one, or sim the rest and see how far you got.",
    names: [],
  },
];

export default function LandingPage() {
  return (
    <main>
      <section className="relative isolate flex min-h-[100svh] items-center overflow-hidden">
        {/* Arena light and a red slash, all drawn: no photo, nothing to license. */}
        <div aria-hidden="true" className="absolute inset-0 -z-10">
          <div
            className="animate-spot-sway absolute -top-24 left-[58%] h-[130%] w-[90%] -translate-x-1/2"
            style={{
              background:
                "conic-gradient(from 168deg at 50% 0%, transparent 0deg, rgba(255,255,255,0.13) 10deg, transparent 22deg, transparent 36deg, rgba(255,255,255,0.09) 46deg, transparent 58deg)",
              maskImage: "linear-gradient(to bottom, black 20%, transparent 90%)",
            }}
          />
          <div className="absolute top-0 -right-24 h-full w-[46%] skew-x-[-14deg] bg-gradient-to-b from-corner-red/30 via-corner-red/10 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-canvas to-transparent" />
        </div>

        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 pt-24 pb-16 lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:px-10">
          <div>
            <h1 className="font-display text-7xl leading-[0.85] font-black tracking-wide uppercase sm:text-8xl lg:text-9xl">
              {HEADLINE.map((line, index) => (
                <span key={line} className="block overflow-hidden pb-[0.06em]">
                  <span className="animate-line-up block" style={{ animationDelay: `${index * 110}ms` }}>
                    {line}
                  </span>
                </span>
              ))}
            </h1>

            <p className="animate-rise-in mt-6 max-w-md text-lg text-bone/80" style={{ animationDelay: "520ms" }}>
              Pick one fighter for each skill, without seeing their numbers. Then find out how
              good the fighter you built really is, and put them through twenty fights.
            </p>

            <div className="animate-rise-in mt-8" style={{ animationDelay: "680ms" }}>
              <Link href="/draft" className={`${primaryButton} inline-flex`}>
                Build my fighter
              </Link>
            </div>
          </div>

          <div className="animate-rise-in" style={{ animationDelay: "420ms" }}>
            <LiveFight />
          </div>
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

      {/* Light band: the dark brand needs somewhere to breathe. */}
      <section className="bg-paper text-ink">
        <div className="mx-auto max-w-6xl px-4 py-20 lg:px-10">
          <h2 className="font-display text-6xl leading-[0.88] font-black tracking-wide uppercase sm:text-7xl">
            Three steps.
            <br />
            One fighter.
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
          Meet what you&rsquo;ll build
        </h2>
        <p className="mt-3 mb-8 max-w-lg text-chalk">
          Eight picks, one fighter. When the draft ends you see how strong the whole is, and
          which pick carried it and which held it back.
        </p>
        <LandingDemo name="Chiamaka" selections={DEMO_SELECTIONS} overall={computeOverall(DEMO_SELECTIONS)} />
      </section>

      <footer className="border-t border-line px-4 py-8 text-center text-xs text-chalk-faint">
        Five-Star MMA is an independent fan project. It is not affiliated with or endorsed by the UFC,
        any promotion, or any fighter.
      </footer>
    </main>
  );
}
