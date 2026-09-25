"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/multiplayer/client";

/**
 * Accounts. Everyone who plays a challenge has a Supabase session; until
 * they sign up it's a guest (anonymous) one tied to this browser. Signing
 * up upgrades that same user, so their challenges and record come along,
 * and from then on they can sign in anywhere.
 */
export interface Profile {
  readonly displayName: string;
  readonly avatarKey: string | null;
}

export interface AccountState {
  readonly loading: boolean;
  readonly session: Session | null;
  /** True for a real account, false for a guest or nobody. */
  readonly signedIn: boolean;
  readonly profile: Profile | null;
}

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabaseBrowser()
    .from("profiles")
    .select("display_name, avatar_key")
    .eq("id", userId)
    .maybeSingle();
  return data ? { displayName: data.display_name, avatarKey: data.avatar_key } : null;
}

const listeners = new Set<() => void>();
/** Tell every useAccount() on the page to reload (after a profile save). */
export function notifyAccountChanged() {
  listeners.forEach((listener) => listener());
}

export function useAccount(): AccountState {
  const [state, setState] = useState<AccountState>({ loading: true, session: null, signedIn: false, profile: null });

  useEffect(() => {
    const supabase = supabaseBrowser();
    let alive = true;
    // Loads can overlap (a sign-up fires an auth event and a profile save
    // right after); only the newest one may set state.
    let latest = 0;
    const load = async (session: Session | null) => {
      const ticket = ++latest;
      const signedIn = Boolean(session && !session.user.is_anonymous);
      const profile = session ? await loadProfile(session.user.id) : null;
      if (alive && ticket === latest) setState({ loading: false, session, signedIn, profile });
    };
    void supabase.auth.getSession().then(({ data }) => load(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      // Defer: Supabase warns against awaiting its own calls inside this callback.
      window.setTimeout(() => void load(session), 0);
    });
    const reload = () => void supabase.auth.getSession().then(({ data }) => load(data.session));
    listeners.add(reload);
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
      listeners.delete(reload);
    };
  }, []);

  return state;
}

/**
 * Players may insert their own profile and update only its name and
 * picture (column grants), so this is an update, or an insert when there
 * is no row yet. An upsert would also try to update `id` and be refused.
 */
async function saveProfileFor(userId: string, profile: Profile) {
  const supabase = supabaseBrowser();
  const fields = { display_name: profile.displayName, avatar_key: profile.avatarKey };
  const updated = await supabase.from("profiles").update(fields).eq("id", userId).select("id");
  if (updated.error) throw new Error("Couldn't save your profile");
  if (updated.data.length > 0) return;
  const inserted = await supabase.from("profiles").insert({ id: userId, ...fields });
  if (inserted.error) throw new Error("Couldn't save your profile");
}

function friendly(message: string): string {
  if (/already registered|already been registered|already exists/i.test(message)) return "That email already has an account. Sign in instead.";
  if (/invalid login credentials/i.test(message)) return "Wrong email or password.";
  if (/password/i.test(message) && /least|short|weak/i.test(message)) return "Password needs at least 6 characters.";
  if (/email/i.test(message) && /invalid/i.test(message)) return "That email doesn't look right.";
  return message;
}

/**
 * Creates an account. A guest who has already played is upgraded in place
 * (same user id), keeping their challenges.
 */
export async function signUp(name: string, email: string, password: string): Promise<void> {
  const supabase = supabaseBrowser();
  const { data } = await supabase.auth.getSession();
  let userId: string;
  if (data.session?.user.is_anonymous) {
    const { data: updated, error } = await supabase.auth.updateUser({ email, password });
    if (error) throw new Error(friendly(error.message));
    userId = updated.user.id;
  } else {
    const { data: created, error } = await supabase.auth.signUp({ email, password });
    if (error) throw new Error(friendly(error.message));
    if (!created.user) throw new Error("Couldn't create the account");
    userId = created.user.id;
  }
  const existing = await loadProfile(userId);
  await saveProfileFor(userId, { displayName: name, avatarKey: existing?.avatarKey ?? null });
  notifyAccountChanged();
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
  if (error) throw new Error(friendly(error.message));
  notifyAccountChanged();
}

export async function signOut(): Promise<void> {
  await supabaseBrowser().auth.signOut();
  notifyAccountChanged();
}

export async function saveProfile(profile: Profile): Promise<void> {
  const { data } = await supabaseBrowser().auth.getSession();
  if (!data.session) throw new Error("Sign in first");
  await saveProfileFor(data.session.user.id, profile);
  notifyAccountChanged();
}
