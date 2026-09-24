import Image from "next/image";
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
    body: "See your overall rating, your best pick and your weak link.",
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
      <section className="relative isolate flex min-h-[100svh] items-end overflow-hidden sm:items-center">
        {/* The photo starts below the top of the hero (and is anchored to its own top edge), so the
            fighter's head always clears the site bar; the crop trims the floor, never the head. */}
        <div aria-hidden="true" className="animate-hero-drift absolute inset-x-0 top-[12svh] -bottom-[12svh] -z-20 origin-[75%_20%]"
          style={{
            maskImage: "linear-gradient(to bottom, transparent 0%, black 7%)",
            WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 7%)",
          }}
        >
          <Image
            src="/avatars/hero2.jpg"
            alt=""
            fill
            priority
            quality={80}
            sizes="100vw"
            className="object-cover object-[76%_top] brightness-[1.12] sm:object-[70%_top]"
          />
        </div>
        {/* Keep the headline readable and settle the photo into the page. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-gradient-to-t from-canvas via-canvas/55 to-transparent sm:bg-gradient-to-r sm:from-canvas sm:via-canvas/55 sm:to-transparent"
        />
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 -z-10 h-1/4 bg-gradient-to-t from-canvas to-transparent" />

        <div className="mx-auto w-full max-w-6xl px-4 pt-28 pb-16 lg:px-10">
          <h1 className="font-display text-7xl leading-[0.85] font-black tracking-wide uppercase sm:text-8xl lg:text-9xl">
            {HEADLINE.map((line, index) => (
              <span key={line} className="block overflow-hidden pb-[0.06em]">
                <span className="animate-line-up block" style={{ animationDelay: `${index * 110}ms` }}>
                  {line}
                </span>
              </span>
            ))}
          </h1>

          <p className="animate-rise-in mt-6 max-w-md text-lg text-bone/85" style={{ animationDelay: "520ms" }}>
            Draft eight fighters into one. See what you built. Then take on twenty in a row.
          </p>

          <div className="animate-rise-in mt-8" style={{ animationDelay: "680ms" }}>
            <Link href="/draft" className={`${primaryButton} inline-flex`}>
              Build your fighter
            </Link>
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
      <section className="bg-paper text-ink">
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
          Every build ends with an overall rating, a best pick and a weak link.
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
