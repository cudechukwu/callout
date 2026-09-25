"use client";

import { useEffect, useState } from "react";
import { useAccount } from "@/lib/account";
import { DISPLAY_NAME_MAX } from "@/lib/multiplayer/types";
import { primaryButton } from "@/components/ui";

interface NameFormProps {
  eyebrow?: string;
  title: string;
  submitLabel: string;
  onSubmit: (name: string) => Promise<void>;
}

/** One name field and one button: the whole of creating or joining a challenge. */
export function NameForm({ eyebrow, title, submitLabel, onSubmit }: NameFormProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Signed in: start from the profile name.
  const profileName = useAccount().profile?.displayName;
  useEffect(() => {
    if (profileName) setName((current) => current || profileName);
  }, [profileName]);

  return (
    <main className="animate-screen-in mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-md flex-col justify-center px-4 py-10">
      {eyebrow && <p className="mb-1 text-chalk">{eyebrow}</p>}
      <h1 className="font-display text-[clamp(1.9rem,6vw,2.75rem)] leading-none font-semibold tracking-[0.07em] uppercase">
        {title}
      </h1>
      <form
        className="mt-6"
        noValidate
        onSubmit={async (event) => {
          event.preventDefault();
          const trimmed = name.trim();
          if (!trimmed) {
            setError("Enter your name.");
            return;
          }
          setBusy(true);
          try {
            await onSubmit(trimmed);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Something went wrong");
            setBusy(false);
          }
        }}
      >
        <label htmlFor="player-name" className="text-sm text-chalk">
          Your name
        </label>
        <input
          id="player-name"
          autoFocus
          value={name}
          maxLength={DISPLAY_NAME_MAX}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          className="cut-sm mt-1 w-full bg-panel px-4 py-3 font-display text-2xl font-semibold tracking-wide text-bone focus:bg-panel-raised focus:outline-2 focus:outline-belt-gold"
        />
        {error && <p className="mt-2 text-sm text-corner-red-bright">{error}</p>}
        <button type="submit" disabled={busy} className={`${primaryButton} mt-4 w-full`}>
          {submitLabel}
        </button>
      </form>
    </main>
  );
}
