import Link from "next/link";
import { primaryButton } from "@/components/ui";

/** Shown by account and challenge pages when the site has no Supabase settings. */
export function Unavailable() {
  return (
    <main className="flex min-h-[calc(100svh-3.5rem)] flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="text-lg">Challenges and accounts aren&rsquo;t available right now.</p>
      <Link href="/draft" className={primaryButton}>
        Build your fighter
      </Link>
    </main>
  );
}
