"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { formatClock, primaryButton, secondaryButton } from "@/components/ui";
import { saveProfile, signOut, type Profile } from "@/lib/account";
import { DRAFT_POOL } from "@/lib/draft/draftPool";
import { mp } from "@/lib/multiplayer/client";
import { DISPLAY_NAME_MAX, type ProfileStats } from "@/lib/multiplayer/types";
import { PROFILE_PICTURES, pictureSrc } from "@/lib/profilePictures";

const FIGHTER_NAME = new Map(DRAFT_POOL.map((f) => [f.id, f.name]));
const METHOD = { KO: "KO", TKO: "TKO", SUB: "Submission", DEC: "Decision" } as const;

const heading = "font-display text-lg font-semibold tracking-[0.07em] uppercase";
const panel = "cut bg-panel/70 backdrop-blur-[3px]";
const quietLink =
  "text-sm font-medium text-chalk underline decoration-chalk/40 underline-offset-4 transition-colors hover:text-bone";

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

interface ProfileScreenProps {
  email: string;
  memberSince: string | undefined;
  profile: Profile;
}

/** A player card: record, stats, rivals, recent fights, then profile settings. */
export function ProfileScreen({ email, memberSince, profile }: ProfileScreenProps) {
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    mp<ProfileStats>("profile")
      .then(setStats)
      .catch(() => setFailed(true));
  }, []);

  const name = profile.displayName || "Your profile";
  const fights = stats ? stats.wins + stats.losses : 0;
  const since = memberSince
    ? new Date(memberSince).toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : null;

  const tiles: { label: string; value: string; gold?: boolean }[] = [
    { label: "Fights", value: stats ? String(fights) : "–" },
    { label: "Win rate", value: stats && fights ? `${Math.round((100 * stats.wins) / fights)}%` : "–" },
    { label: "KO / TKO wins", value: stats ? String(stats.finishes.ko) : "–" },
    { label: "Submission wins", value: stats ? String(stats.finishes.sub) : "–" },
    { label: "Decision wins", value: stats ? String(stats.finishes.dec) : "–" },
    { label: "Best build", value: stats?.builds.bestOverall != null ? String(stats.builds.bestOverall) : "–", gold: true },
    { label: "Average build", value: stats?.builds.averageOverall != null ? String(stats.builds.averageOverall) : "–", gold: true },
    { label: "Left on the table", value: stats?.builds.averageLeft != null ? String(stats.builds.averageLeft) : "–" },
  ];

  return (
    <main className="animate-screen-in mx-auto w-full max-w-5xl px-4 py-8">
      {/* Player card */}
      <section className={`${panel} relative flex flex-col gap-6 overflow-hidden p-5 sm:flex-row sm:items-center sm:p-7`}>
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-corner-red" />
        <Avatar
          name={name}
          corner="red"
          src={pictureSrc(profile.avatarKey)}
          className="cut-sm h-28 w-28 shrink-0 sm:h-36 sm:w-36"
        />
        <div className="min-w-0 flex-1">
          {since && <p className="text-sm text-chalk">Member since {since}</p>}
          <h1 className="mt-1 truncate font-display text-[clamp(1.9rem,5vw,2.9rem)] leading-none font-semibold tracking-[0.07em] uppercase">
            {name}
          </h1>
          <div className="mt-4 flex items-end gap-4">
            <p className="font-numeric text-6xl leading-[0.8] font-bold">
              {stats ? `${stats.wins}–${stats.losses}` : "–"}
            </p>
            <div className="pb-0.5">
              <p className="text-xs text-chalk">Challenge record</p>
              {stats?.streak && (
                <p
                  className={`cut-sm mt-1 inline-block px-2 py-0.5 font-display text-sm font-semibold tracking-[0.08em] ${
                    stats.streak.kind === "W" ? "bg-corner-red text-bone" : "bg-panel-raised text-chalk"
                  }`}
                >
                  {stats.streak.kind}
                  {stats.streak.length} streak
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 gap-3 sm:flex-col">
          <Link href="/challenge" className={`${primaryButton} !px-5 !py-2.5 !text-base text-center`}>
            Challenge a friend
          </Link>
          <a href="#edit" className={`${secondaryButton} !px-5 !py-2.5 !text-base text-center`}>
            Edit profile
          </a>
        </div>
      </section>

      {failed && <p className="mt-4 text-sm text-chalk">Couldn&rsquo;t load your stats. Refresh to try again.</p>}

      {/* Stats */}
      <section aria-label="Stats" className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className={`${panel} px-4 py-3`}>
            <p className="text-xs text-chalk">{tile.label}</p>
            <p className={`mt-1 font-numeric text-3xl leading-none font-bold ${tile.gold ? "text-belt-gold" : ""}`}>
              {tile.value}
            </p>
          </div>
        ))}
      </section>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {/* Rivals */}
        <section className={`${panel} p-5`}>
          <h2 className={heading}>Rivals</h2>
          {stats && stats.rivals.length === 0 ? (
            <div className="mt-3">
              <p className="text-chalk">No rivals yet.</p>
              <Link href="/challenge" className={`${quietLink} mt-2 inline-block`}>
                Send a challenge
              </Link>
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-line/60">
              {(stats?.rivals ?? []).map((rival) => {
                const lead = rival.wins - rival.losses;
                return (
                  <li key={rival.inviteToken}>
                    <Link href={`/c/${rival.inviteToken}`} className="group flex items-center gap-3 py-2.5">
                      <Avatar
                        name={rival.name}
                        corner="white"
                        src={pictureSrc(rival.avatarKey)}
                        className="cut-sm h-11 w-11 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display font-semibold tracking-[0.06em] uppercase group-hover:text-bone">
                          {rival.name}
                        </p>
                        <p className="text-xs text-chalk">
                          {lead > 0 ? "You lead" : lead < 0 ? "They lead" : "Level"}
                          {rival.lastPlayed && ` · ${shortDate(rival.lastPlayed)}`}
                        </p>
                      </div>
                      <p className="font-numeric text-2xl font-bold">
                        {rival.wins}–{rival.losses}
                      </p>
                      <span aria-hidden="true" className="text-chalk transition-transform group-hover:translate-x-0.5">
                        &rarr;
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Recent fights */}
        <section className={`${panel} p-5`}>
          <h2 className={heading}>Recent fights</h2>
          {stats && stats.recent.length === 0 ? (
            <p className="mt-3 text-chalk">No fights yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line/60">
              {(stats?.recent ?? []).map((fight, index) => (
                <li key={index}>
                  <Link href={`/c/${fight.inviteToken}`} className="group flex items-center gap-3 py-2.5">
                    <span
                      className={`cut-sm flex h-9 w-9 shrink-0 items-center justify-center font-display text-lg font-bold ${
                        fight.won ? "bg-corner-red text-bone" : "bg-panel-raised text-chalk"
                      }`}
                    >
                      {fight.won ? "W" : "L"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate">
                        <span className="text-chalk">vs </span>
                        <span className="font-display font-semibold tracking-[0.06em] uppercase group-hover:text-bone">
                          {fight.opponentName}
                        </span>
                      </p>
                      <p className="text-xs text-chalk">
                        {METHOD[fight.method]}
                        {fight.method !== "DEC" && ` · R${fight.round} ${formatClock(fight.time)}`}
                      </p>
                    </div>
                    <p className="text-xs text-chalk">{shortDate(fight.playedAt)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Most drafted: only once a pick repeats, or it's just your last build. */}
      {stats && stats.mostDrafted.some((pick) => pick.count > 1) && (
        <section className={`${panel} mt-4 p-5`}>
          <h2 className={heading}>Most drafted</h2>
          <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {stats.mostDrafted.map((pick) => {
              const fighterName = FIGHTER_NAME.get(pick.fighterId) ?? "Unknown";
              return (
                <li key={pick.fighterId} className="flex items-center gap-2.5">
                  <Avatar name={fighterName} corner="neutral" className="cut-sm h-10 w-10 shrink-0" />
                  <div className="min-w-0">
                    <p className="truncate font-display text-sm font-semibold tracking-[0.05em] uppercase">
                      {fighterName}
                    </p>
                    <p className="text-xs text-chalk">
                      {pick.count} {pick.count === 1 ? "build" : "builds"}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <EditProfile email={email} profile={profile} />
    </main>
  );
}

function EditProfile({ email, profile }: { email: string; profile: Profile }) {
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
    <section id="edit" className={`${panel} mt-4 scroll-mt-20 p-5 sm:p-7`}>
      <h2 className={heading}>Edit profile</h2>

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
