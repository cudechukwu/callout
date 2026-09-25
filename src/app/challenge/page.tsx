"use client";

import { useRouter } from "next/navigation";
import { NameForm } from "@/components/NameForm";
import { mp } from "@/lib/multiplayer/client";

export default function CreateChallengePage() {
  const router = useRouter();
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
