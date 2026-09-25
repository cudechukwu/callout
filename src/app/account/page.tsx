"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { primaryButton } from "@/components/ui";
import { signIn, signUp, useAccount } from "@/lib/account";
import { DISPLAY_NAME_MAX } from "@/lib/multiplayer/types";
import { supabaseConfigured } from "@/lib/multiplayer/client";
import { Unavailable } from "@/components/Unavailable";
import { ProfileScreen } from "@/components/ProfileScreen";

const field =
  "cut-sm mt-1 w-full bg-panel px-4 py-3 text-lg text-bone focus:bg-panel-raised focus:outline-2 focus:outline-belt-gold";
const label = "mt-4 block text-sm text-chalk";

/** Only same-site paths, so ?next= can't send anyone off the site. */
function safeNext(raw: string | null): string | null {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : null;
}

export default function AccountPage() {
  if (!supabaseConfigured) return <Unavailable />;
  return (
    <Suspense>
      <AccountScreen />
    </Suspense>
  );
}

function AccountScreen() {
  const account = useAccount();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const mode = params.get("mode");

  // Sent here to sign in first (e.g. to send a challenge): go back once done.
  useEffect(() => {
    if (!account.loading && account.signedIn && next) router.replace(next);
  }, [account.loading, account.signedIn, next, router]);

  if (account.loading) {
    return (
      <main className="flex min-h-[calc(100svh-3.5rem)] items-center justify-center">
        <p className="text-chalk">Loading…</p>
      </main>
    );
  }
  if (account.signedIn && next) return null;
  return account.signedIn && account.session ? (
    <ProfileScreen
      email={account.session.user.email ?? ""}
      memberSince={account.session.user.created_at}
      profile={account.profile ?? { displayName: "", avatarKey: null }}
    />
  ) : (
    <AuthForm guest={Boolean(account.session?.user.is_anonymous)} startWith={mode === "signin" ? "signin" : "create"} />
  );
}

function AuthForm({ guest, startWith }: { guest: boolean; startWith: "create" | "signin" }) {
  const [mode, setMode] = useState<"create" | "signin">(startWith);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (mode === "create" && !name.trim()) return setError("Enter your name.");
    if (!email.trim() || !password) return setError("Enter your email and password.");
    setBusy(true);
    setError(null);
    try {
      if (mode === "create") await signUp(name.trim(), email.trim(), password);
      else await signIn(email.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  }

  const tab = (value: typeof mode, text: string) => (
    <button
      type="button"
      onClick={() => {
        setMode(value);
        setError(null);
      }}
      className={`pb-1 font-display text-lg font-semibold tracking-[0.07em] uppercase ${
        mode === value ? "border-b-2 border-bone text-bone" : "text-chalk hover:text-bone"
      }`}
    >
      {text}
    </button>
  );

  return (
    <main className="animate-screen-in mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="flex gap-6">
        {tab("create", "Create account")}
        {tab("signin", "Sign in")}
      </div>
      <form onSubmit={submit} noValidate className="mt-4">
        {mode === "create" && (
          <>
            <label htmlFor="name" className={label}>
              Name
            </label>
            <input id="name" value={name} maxLength={DISPLAY_NAME_MAX} onChange={(e) => setName(e.target.value)} className={field} autoComplete="nickname" />
          </>
        )}
        <label htmlFor="email" className={label}>
          Email
        </label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} autoComplete="email" />
        <label htmlFor="password" className={label}>
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={field}
          autoComplete={mode === "create" ? "new-password" : "current-password"}
        />
        {error && <p className="mt-3 text-sm text-corner-red-bright">{error}</p>}
        <button type="submit" disabled={busy} className={`${primaryButton} mt-6 w-full`}>
          {mode === "create" ? "Create account" : "Sign in"}
        </button>
        {guest && (
          <p className="mt-3 text-center text-sm text-chalk">
            {mode === "create"
              ? "Your challenges and record come with you."
              : "Challenges you played here as a guest stay with the guest."}
          </p>
        )}
      </form>
    </main>
  );
}
