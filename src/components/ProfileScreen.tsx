"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { formatClock, primaryButton } from "@/components/ui";
import { saveProfile, signOut, type Profile } from "@/lib/account";
import { DRAFT_POOL } from "@/lib/draft/draftPool";
import { mp } from "@/lib/multiplayer/client";
import { DISPLAY_NAME_MAX, type ProfileStats } from "@/lib/multiplayer/types";
import { PROFILE_PICTURES, pictureSrc } from "@/lib/profilePictures";

const FIGHTER_NAME = new Map(DRAFT_POOL.map((f) => [f.id, f.name]));
const METHOD = { KO: "KO", TKO: "TKO", SUB: "Submission", DEC: "Decision" } as const;

const heading = "font-display text-lg font-semibold tracking-[0.07em] uppercase";
const quietLink =
  "text-sm font-medium text-chalk underline decoration-chalk/40 underline-offset-4 transition-colors hover:text-bone";
const smallButton = "!px-4 !py-2 !text-sm";

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

interface ProfileScreenProps {
  email: string;
  memberSince: string | undefined;
  profile: Profile;
}

/**
 * A fighter's page, not a dashboard: the player card leads (picture, name,
 * record, four headline numbers), then rivals, fight history and a little
 * about how they win and draft. Settings live behind Edit profile.
 */
export function ProfileScreen({ email, memberSince, profile }: ProfileScreenProps) {
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    mp<ProfileStats>("profile")
      .then(setStats)
      .catch(() => setFailed(true));
  }, []);

  const name = profile.displayName || "Your profile";
  const fights = stats ? stats.wins + stats.losses : 0;
  const finishes = stats ? stats.finishes.ko + stats.finishes.sub : 0;
  const since = memberSince
    ? new Date(memberSince).toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : null;
  const repeated = stats?.mostDrafted.filter((pick) => pick.count > 1) ?? [];

  const headline: { label: string; value: string; gold?: boolean }[] = [
    { label: "Fights", value: stats ? String(fights) : "–" },
    { label: "Win rate", value: stats && fights ? `${Math.round((100 * stats.wins) / fights)}%` : "–" },
    { label: "Finishes", value: stats ? String(finishes) : "–" },
    { label: "Best build", value: stats?.builds.bestOverall != null ? String(stats.builds.bestOverall) : "–", gold: true },
  ];

  return (
    <main className="animate-screen-in mx-auto w-full max-w-5xl px-4 pt-8 pb-16">
      {/* Player card */}
      <section className="cut relative overflow-hidden bg-panel/75 backdrop-blur-[3px]">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(90%_120%_at_0%_0%,rgba(232,52,63,0.22),transparent_60%)]"
        />
        <div className="relative flex flex-col gap-6 p-5 sm:flex-row sm:p-8">
          <Avatar
            name={name}
            corner="red"
            src={pictureSrc(profile.avatarKey)}
            player
            className="cut-sm aspect-square w-36 shrink-0 sm:w-52"
          />
          <div className="flex min-w-0 flex-1 flex-col">
            {since && <p className="text-sm text-chalk">Member since {since}</p>}
            <h1 className="mt-1 font-display text-[clamp(2rem,5vw,3.2rem)] leading-[0.95] font-semibold tracking-[0.07em] break-words uppercase">
              {name}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <p className="font-numeric text-5xl leading-none font-bold sm:text-6xl">
                {stats ? `${stats.wins}–${stats.losses}` : "–"}
              </p>
              {stats?.streak && (
                <p
                  className={`cut-sm px-2 py-0.5 font-display text-sm font-semibold tracking-[0.08em] ${
                    stats.streak.kind === "W" ? "bg-corner-red text-bone" : "bg-panel-raised text-chalk"
                  }`}
                >
                  {stats.streak.kind}
                  {stats.streak.length}
                </p>
              )}
            </div>

            <dl className="mt-6 grid grid-cols-4 border-t border-bone/10 pt-4">
              {headline.map((stat, i) => (
                <div key={stat.label} className={i > 0 ? "border-l border-bone/10 pl-3 sm:pl-5" : ""}>
                  <dt className="text-xs text-chalk">{stat.label}</dt>
                  <dd className={`mt-1 font-numeric text-2xl leading-none font-bold sm:text-3xl ${stat.gold ? "text-belt-gold" : ""}`}>
                    {stat.value}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-6 flex flex-wrap items-center gap-5">
              <Link href="/challenge" className={`${primaryButton} ${smallButton}`}>
                Challenge a friend
              </Link>
              <button onClick={() => setEditing((v) => !v)} className={quietLink}>
                {editing ? "Back to profile" : "Edit profile"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {failed && <p className="mt-4 text-sm text-chalk">Couldn&rsquo;t load your stats. Refresh to try again.</p>}

      {editing ? (
        <EditProfile email={email} profile={profile} onDone={() => setEditing(false)} />
      ) : (
        <div className="mt-10 grid gap-x-12 gap-y-10 lg:grid-cols-[1.35fr_1fr]">
          <div className="flex flex-col gap-10">
            {/* Rivals */}
            <section>
              <h2 className={heading}>Rivals</h2>
              {stats && stats.rivals.length === 0 ? (
                <p className="mt-3 text-chalk">
                  No rivals yet.{" "}
                  <Link href="/challenge" className={quietLink}>
                    Send a challenge
                  </Link>
                </p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {(stats?.rivals ?? []).map((rival) => {
                    const lead = rival.wins - rival.losses;
                    return (
                      <li key={rival.inviteToken} className="cut-sm flex items-center gap-4 bg-panel/60 p-3 pr-4">
                        <Avatar
                          name={rival.name}
                          corner="white"
                          src={pictureSrc(rival.avatarKey)}
                          player
                          className="cut-sm h-14 w-14 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-display text-lg leading-tight font-semibold tracking-[0.06em] uppercase">
                            {rival.name}
                          </p>
                          <p className="text-sm text-chalk">
                            {lead > 0 ? "You lead" : lead < 0 ? "They lead" : "Level"}
                            {rival.lastPlayed && ` · ${shortDate(rival.lastPlayed)}`}
                          </p>
                        </div>
                        <p className="font-numeric text-3xl leading-none font-bold">
                          {rival.wins}–{rival.losses}
                        </p>
                        <Link href={`/c/${rival.inviteToken}`} className={`${primaryButton} ${smallButton} shrink-0`}>
                          Run it back
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Fight history */}
            <section>
              <h2 className={heading}>Fight history</h2>
              {stats && stats.recent.length === 0 ? (
                <p className="mt-3 text-chalk">No fights yet.</p>
              ) : (
                <ul className="mt-2 divide-y divide-line/50">
                  {(stats?.recent ?? []).map((fight, index) => (
                    <li key={index}>
                      <Link href={`/c/${fight.inviteToken}`} className="group flex items-center gap-4 py-2.5">
                        <span
                          className={`w-6 font-display text-lg font-bold ${fight.won ? "text-corner-red-bright" : "text-chalk"}`}
                        >
                          {fight.won ? "W" : "L"}
                        </span>
                        <p className="min-w-0 flex-1 truncate">
                          <span className="text-chalk">vs </span>
                          <span className="font-display font-semibold tracking-[0.06em] uppercase group-hover:text-bone">
                            {fight.opponentName}
                          </span>
                        </p>
                        <p className="text-sm text-chalk">
                          {METHOD[fight.method]}
                          {fight.method !== "DEC" && ` · R${fight.round} ${formatClock(fight.time)}`}
                        </p>
                        <p className="hidden w-16 text-right text-sm text-chalk-faint sm:block">
                          {shortDate(fight.playedAt)}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="flex flex-col gap-10">
            {/* Wins by method */}
            <section>
              <h2 className={heading}>Wins by method</h2>
              <div className="mt-3 flex flex-col gap-3">
                {(
                  [
                    ["KO / TKO", stats?.finishes.ko ?? 0],
                    ["Submission", stats?.finishes.sub ?? 0],
                    ["Decision", stats?.finishes.dec ?? 0],
                  ] as const
                ).map(([label, count]) => (
                  <div key={label}>
                    <div className="flex justify-between text-sm">
                      <span className="text-chalk">{label}</span>
                      <span className="font-numeric font-bold">{count}</span>
                    </div>
                    <div className="mt-1 h-1.5 bg-line/70">
                      <div
                        className="h-full bg-corner-red"
                        style={{ width: `${stats?.wins ? (100 * count) / stats.wins : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Drafting */}
            <section>
              <h2 className={heading}>Drafting</h2>
              <dl className="mt-3 grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-xs text-chalk">Average build</dt>
                  <dd className="mt-1 font-numeric text-3xl leading-none font-bold text-belt-gold">
                    {stats?.builds.averageOverall ?? "–"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-chalk">Left on the table</dt>
                  <dd className="mt-1 font-numeric text-3xl leading-none font-bold">
                    {stats?.builds.averageLeft ?? "–"}
                  </dd>
                </div>
              </dl>
              {repeated.length > 0 && (
                <>
                  <p className="mt-5 text-xs text-chalk">Go-to picks</p>
                  <ul className="mt-2 flex flex-col gap-2">
                    {repeated.map((pick) => {
                      const fighterName = FIGHTER_NAME.get(pick.fighterId) ?? "Unknown";
                      return (
                        <li key={pick.fighterId} className="flex items-center gap-3">
                          <Avatar name={fighterName} corner="neutral" className="cut-sm h-9 w-9 shrink-0" />
                          <p className="min-w-0 flex-1 truncate font-display font-semibold tracking-[0.05em] uppercase">
                            {fighterName}
                          </p>
                          <p className="text-sm text-chalk">{pick.count} builds</p>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </section>
          </div>
        </div>
      )}
    </main>
  );
}

function EditProfile({ email, profile, onDone }: { email: string; profile: Profile; onDone: () => void }) {
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
    <section className="animate-screen-in mt-8">
      <div className="flex items-center justify-between">
        <h2 className={heading}>Edit profile</h2>
        <button onClick={onDone} className={quietLink}>
          Done
        </button>
      </div>

      <p className="mt-5 text-sm text-chalk">Picture</p>
      <div className="mt-2 grid grid-cols-5 gap-2 sm:grid-cols-10">
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
                chosen ? "outline-2 outline-offset-2 outline-bone" : "opacity-70 hover:opacity-100"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={picture.src} alt="" className="h-full w-full object-cover object-top" />
            </button>
          );
        })}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="profile-name" className="text-sm text-chalk">
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
            className="cut-sm mt-1 w-full bg-panel-raised px-4 py-3 text-lg text-bone focus:outline-2 focus:outline-belt-gold"
          />
        </div>
        <div>
          <p className="text-sm text-chalk">Email</p>
          <p className="mt-1 truncate px-1 py-3 text-lg text-chalk">{email}</p>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-4">
        <button onClick={save} disabled={busy || !dirty} className={`${primaryButton} min-w-40`}>
          Save
        </button>
        {status && <p className="text-sm text-chalk">{status}</p>}
        <button onClick={() => void signOut()} className={`${quietLink} ml-auto`}>
          Sign out
        </button>
      </div>
    </section>
  );
}
