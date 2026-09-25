"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { NameForm } from "@/components/NameForm";
import { primaryButton } from "@/components/ui";
import { useAccount } from "@/lib/account";
import { mp } from "@/lib/multiplayer/client";

/** Sending a challenge needs an account (the server checks too). */
export default function CreateChallengePage() {
  const router = useRouter();
  const account = useAccount();

  if (account.loading) {
    return <main className="min-h-[calc(100svh-3.5rem)]" />;
  }

  if (!account.signedIn) {
    return (
      <main className="animate-screen-in mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-md flex-col justify-center px-4 py-10">
        <h1 className="font-display text-[clamp(1.9rem,6vw,2.75rem)] leading-none font-semibold tracking-[0.07em] uppercase">
          Challenge a friend
        </h1>
        <p className="mt-3 text-chalk">Create an account to send a challenge. Your friend just needs the link.</p>
        <Link href="/account?next=/challenge" className={`${primaryButton} mt-6 text-center`}>
          Create account
        </Link>
        <Link
          href="/account?next=/challenge&mode=signin"
          className="mt-4 text-center text-sm font-medium text-chalk underline decoration-chalk/40 underline-offset-4 hover:text-bone"
        >
          I have an account
        </Link>
      </main>
    );
  }

  return (
    <NameForm
      title="Challenge a friend"
      submitLabel="Create challenge"
      onSubmit={async (name) => {
        const { inviteToken } = await mp<{ inviteToken: string }>("create", { name });
        router.replace(`/c/${inviteToken}`);
      }}
    />
  );
}
