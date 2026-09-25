import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Browser side of friend challenges. Every player has a Supabase session:
 * a guest (anonymous) one unless they later sign in. It lives in this
 * browser's storage, which is what lets a refresh or a closed tab resume.
 */
let browserClient: SupabaseClient<Database> | null = null;

export function supabaseBrowser(): SupabaseClient<Database> {
  browserClient ??= createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
  return browserClient;
}

let pendingSession: Promise<Session> | null = null;

/** The current session, signing in as a guest the first time. */
export function ensureSession(): Promise<Session> {
  pendingSession ??= (async () => {
    const supabase = supabaseBrowser();
    const { data } = await supabase.auth.getSession();
    if (data.session) return data.session;
    const { data: signedIn, error } = await supabase.auth.signInAnonymously();
    if (error || !signedIn.session) throw error ?? new Error("Could not start a session");
    return signedIn.session;
  })().finally(() => {
    pendingSession = null;
  });
  return pendingSession;
}

export class MpRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

/** Calls a challenge command on the server (see app/api/mp). */
export async function mp<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const session = await ensureSession();
  const response = await fetch(`/api/mp/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new MpRequestError(response.status, json.error ?? "error", json.message ?? "Something went wrong");
  }
  return json as T;
}
