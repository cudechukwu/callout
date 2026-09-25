import { HeroBackdrop } from "@/components/HeroBackdrop";
import { HeroLockup } from "@/components/HeroLockup";

export default function LandingPage() {
  return (
    <main>
      <section className="relative isolate flex min-h-[100svh] items-end overflow-hidden">
        <HeroBackdrop />
        <div className="mx-auto w-full max-w-6xl px-4 pt-28 pb-14 lg:px-10 lg:pb-16">
          <HeroLockup />
        </div>
      </section>

      <footer className="border-t border-line px-4 py-8 text-center text-xs text-chalk-faint">
        Five-Star MMA is an independent fan project. Not affiliated with or endorsed by the UFC,
        any promotion or any fighter.
      </footer>
    </main>
  );
}
