"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChallengeDraft } from "@/components/ChallengeDraft";
import { NameForm } from "@/components/NameForm";
import { primaryButton } from "@/components/ui";
import { mp } from "@/lib/multiplayer/client";
import type { InviteStatus } from "@/lib/multiplayer/types";

const CLOSED_COPY: Record<string, string> = {
  full: "This challenge is full.",
  expired: "This challenge has expired.",
  not_found: "This challenge doesn't exist.",
};

/** A challenge link: join it, or pick up your draft where you left it. */
export default function ChallengePage() {
  const { token } = useParams<{ token: string }>();
  const [invite, setInvite] = useState<InviteStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setInvite(await mp<InviteStatus>("invite", { token }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open the challenge");
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (invite?.status === "participant") return <ChallengeDraft roundId={invite.roundId} />;

  if (invite?.status === "open") {
    return (
      <NameForm
        eyebrow={`${invite.challengerName} challenged you`}
        title="Same cards. Better build."
        submitLabel="Accept challenge"
        onSubmit={async (name) => {
          const { roundId } = await mp<{ roundId: string }>("join", { token, name });
          setInvite({ status: "participant", roundId });
        }}
      />
    );
  }

  return (
    <main className="flex min-h-[calc(100svh-3.5rem)] flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="text-lg">{error ?? (invite ? CLOSED_COPY[invite.status] : "Opening the challenge…")}</p>
      {(error || invite) && (
        <Link href="/challenge" className={primaryButton}>
          Start your own
        </Link>
      )}
    </main>
  );
}
