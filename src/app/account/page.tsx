"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { primaryButton } from "@/components/ui";
import { saveProfile, signIn, signOut, signUp, useAccount, type Profile } from "@/lib/account";
import { DISPLAY_NAME_MAX } from "@/lib/multiplayer/types";
import { PROFILE_PICTURES, pictureSrc } from "@/lib/profilePictures";

const field =
  "cut-sm mt-1 w-full bg-panel px-4 py-3 text-lg text-bone focus:bg-panel-raised focus:outline-2 focus:outline-belt-gold";
const label = "mt-4 block text-sm text-chalk";
const title =
  "font-display text-[clamp(1.9rem,6vw,2.75rem)] leading-none font-semibold tracking-[0.07em] uppercase";

/** Only same-site paths, so ?next= can't send anyone off the site. */
function safeNext(raw: string | null): string | null {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : null;
}

export default function AccountPage() {
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
    <ProfileEditor
      email={account.session.user.email ?? ""}
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

function ProfileEditor({ email, profile }: { email: string; profile: Profile }) {
  const [name, setName] = useState(profile.displayName);
  const [avatarKey, setAvatarKey] = useState(profile.avatarKey);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(profile.displayName);
    setAvatarKey(profile.avatarKey);
  }, [profile.displayName, profile.avatarKey]);

  const dirty = name.trim() !== profile.displayName || avatarKey !== profile.avatarKey;

  async function save() {
    if (!name.trim()) return setStatus("Enter your name.");
    setBusy(true);
    try {
      await saveProfile({ displayName: name.trim(), avatarKey });
      setStatus("Saved");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Couldn't save");
    }
    setBusy(false);
  }

  return (
    <main className="animate-screen-in mx-auto w-full max-w-2xl px-4 py-10">
      <div className="flex items-center gap-5">
        <Avatar name={name || "You"} corner="red" src={pictureSrc(avatarKey)} className="cut-sm h-24 w-24 shrink-0" />
        <div className="min-w-0">
          <h1 className={`${title} truncate`}>{name || "Your profile"}</h1>
          <p className="mt-1 truncate text-sm text-chalk">{email}</p>
        </div>
      </div>

      <h2 className="mt-8 font-display text-lg font-semibold tracking-[0.07em] uppercase">Picture</h2>
      {PROFILE_PICTURES.length === 0 ? (
        <p className="mt-2 text-chalk">Pictures are on the way.</p>
      ) : (
        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
          {PROFILE_PICTURES.map((picture) => {
            const chosen = picture.key === avatarKey;
            return (
              <button
                key={picture.key}
                type="button"
                onClick={() => {
                  setAvatarKey(picture.key);
                  setStatus(null);
                }}
                aria-label={`Picture ${picture.key}`}
                aria-pressed={chosen}
                className={`relative aspect-square overflow-hidden transition-transform hover:-translate-y-0.5 ${
                  chosen ? "outline-2 outline-offset-2 outline-bone" : "opacity-80 hover:opacity-100"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={picture.src} alt="" className="h-full w-full object-cover" />
              </button>
            );
          })}
        </div>
      )}

      <label htmlFor="profile-name" className={`${label} mt-8`}>
        Name
      </label>
      <input
        id="profile-name"
        value={name}
        maxLength={DISPLAY_NAME_MAX}
        onChange={(e) => {
          setName(e.target.value);
          setStatus(null);
        }}
        className={field}
      />

      <div className="mt-6 flex items-center gap-4">
        <button onClick={save} disabled={busy || !dirty} className={`${primaryButton} flex-1`}>
          Save
        </button>
        {status && <p className="text-sm text-chalk">{status}</p>}
      </div>
      <button
        onClick={() => void signOut()}
        className="mt-8 text-sm font-medium text-chalk underline decoration-chalk/40 underline-offset-4 hover:text-bone"
      >
        Sign out
      </button>
    </main>
  );
}
