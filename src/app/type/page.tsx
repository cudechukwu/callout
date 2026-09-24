import type { Metadata } from "next";
import { Archivo, Barlow_Condensed, Oswald, Rajdhani, Saira_Semi_Condensed } from "next/font/google";
import { HeroBackdrop } from "@/components/HeroBackdrop";
import { HeroLockup } from "@/components/HeroLockup";

// Temporary comparison page: the same hero in five typefaces. Delete once one is chosen.
export const metadata: Metadata = { title: "Typeface comparison", robots: { index: false, follow: false } };

const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], display: "swap" });
const barlow = Barlow_Condensed({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });
const saira = Saira_Semi_Condensed({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });
const oswald = Oswald({ subsets: ["latin"], weight: ["300", "400", "500"], display: "swap" });
const rajdhani = Rajdhani({ subsets: ["latin"], weight: ["500", "600", "700"], display: "swap" });

const OPTIONS = [
  { key: "A", name: "Archivo, extra wide and light", font: archivo, title: { fontWeight: 300, fontStretch: "125%", letterSpacing: "0.1em" } },
  { key: "B", name: "Barlow Condensed, medium", font: barlow, title: { fontWeight: 500, letterSpacing: "0.08em" } },
  { key: "C", name: "Saira Semi Condensed, medium", font: saira, title: { fontWeight: 500, letterSpacing: "0.08em" } },
  { key: "D", name: "Oswald, regular", font: oswald, title: { fontWeight: 400, letterSpacing: "0.07em" } },
  { key: "E", name: "Rajdhani, semi-bold", font: rajdhani, title: { fontWeight: 600, letterSpacing: "0.08em" } },
] as const;

export default function TypePage() {
  return (
    <main>
      {OPTIONS.map(({ key, name, font, title }) => (
        <section
          key={key}
          className="relative isolate flex min-h-[88svh] items-end overflow-hidden border-b border-line"
          style={{ "--font-display": font.style.fontFamily } as React.CSSProperties}
        >
          <HeroBackdrop />
          <p className="absolute top-20 left-4 z-10 bg-canvas/80 px-3 py-1.5 text-sm text-bone lg:left-10">
            Option {key}: {name}
          </p>
          <div className="mx-auto w-full max-w-6xl px-4 pt-28 pb-14 lg:px-10 lg:pb-16">
            <HeroLockup titleStyle={title} />
          </div>
        </section>
      ))}
    </main>
  );
}
