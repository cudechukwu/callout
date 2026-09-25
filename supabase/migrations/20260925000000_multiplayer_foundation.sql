-- Multiplayer foundation (MULTIPLAYER_DESIGN.md §8 and §10).
--
-- Trust model: clients may only READ, and only what the design allows.
-- Every write goes through server code using the secret key, which bypasses
-- row-level security. So there are no INSERT/UPDATE/DELETE policies at all,
-- and the client roles' table privileges are reduced to SELECT on the
-- columns they may see.
--
-- Anonymous (guest) sign-ins use the `authenticated` role, like any user.
-- The `anon` role (no session at all) can read nothing.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.series (
  id            uuid primary key default gen_random_uuid(),
  invite_token  text not null unique,             -- 128-bit random; the real credential; never client-readable
  status        text not null default 'open' check (status in ('open', 'active', 'closed')),
  created_by    uuid not null references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '7 days'
);

create table public.series_participants (
  series_id     uuid not null references public.series (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  seat          smallint not null check (seat in (1, 2)),
  display_name  text not null check (char_length(display_name) between 1 and 24),
  joined_at     timestamptz not null default now(),
  primary key (series_id, user_id),
  unique (series_id, seat)
);
create index series_participants_user_idx on public.series_participants (user_id);

create table public.draft_rounds (
  id               uuid primary key default gen_random_uuid(),
  series_id        uuid not null references public.series (id) on delete cascade,
  round_number     int  not null check (round_number >= 1),
  draft_seed       text not null,                  -- never client-readable
  draft_plan       jsonb not null,                 -- never client-readable; the immutable plan
  draft_version    int  not null,
  pool_version     int  not null,
  ratings_version  int  not null,
  engine_version   text not null,
  status           text not null default 'drafting' check (status in ('drafting', 'revealed', 'abandoned')),
  created_at       timestamptz not null default now(),
  revealed_at      timestamptz,
  unique (series_id, round_number)
);

-- What both players may see about each other while drafting.
create table public.draft_participants (
  draft_round_id  uuid not null references public.draft_rounds (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  progress        smallint not null default 0 check (progress between 0 and 8),
  locked_at       timestamptz,
  primary key (draft_round_id, user_id)
);

-- Private per-player draft state: the owner only, until the round is revealed.
-- (Split from draft_participants because a row policy cannot hide columns.)
create table public.draft_builds (
  draft_round_id  uuid not null references public.draft_rounds (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  rerolls_left    smallint not null default 2 check (rerolls_left between 0 and 2),
  offer_index     smallint not null default 0 check (offer_index between 0 and 2),
  actual_ovr      smallint,
  best_seen_ovr   smallint,
  build_snapshot  jsonb,                          -- frozen at lock
  primary key (draft_round_id, user_id),
  foreign key (draft_round_id, user_id)
    references public.draft_participants (draft_round_id, user_id) on delete cascade
);

-- Append-only: the truth of what each player saw and chose.
create table public.draft_actions (
  id              bigint generated always as identity primary key,
  draft_round_id  uuid not null references public.draft_rounds (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  sequence        int  not null check (sequence >= 1),
  action_type     text not null check (action_type in ('reroll', 'pick')),
  round_index     smallint not null check (round_index between 0 and 7),
  offer_index     smallint not null check (offer_index between 0 and 2),
  fighter_id      int,
  created_at      timestamptz not null default now(),
  unique (draft_round_id, user_id, sequence),
  check ((action_type = 'pick') = (fighter_id is not null))
);

-- One pick per player per round, even if two pick requests race.
create unique index draft_actions_one_pick_per_round
  on public.draft_actions (draft_round_id, user_id, round_index)
  where action_type = 'pick';

create table public.fights (
  id              uuid primary key default gen_random_uuid(),
  series_id       uuid not null references public.series (id) on delete cascade,
  draft_round_id  uuid not null references public.draft_rounds (id) on delete cascade,
  fight_number    int  not null check (fight_number >= 1),   -- series-wide
  fight_seed      text not null,
  engine_version  text not null,
  winner_user_id  uuid references auth.users (id) on delete set null,
  method          text not null check (method in ('KO', 'TKO', 'SUB', 'DEC')),
  finish_round    smallint not null,
  finish_time     smallint not null,
  result_json     jsonb not null,                 -- full event log + stats: playback never re-simulates
  created_at      timestamptz not null default now(),
  unique (series_id, fight_number)
);
create index fights_draft_round_idx on public.fights (draft_round_id);

-- Consent for rivalry fights.
create table public.series_requests (
  id              uuid primary key default gen_random_uuid(),
  series_id       uuid not null references public.series (id) on delete cascade,
  kind            text not null check (kind in ('run_it_back', 'redraft')),
  after_fight_id  uuid not null references public.fights (id) on delete cascade,
  requested_by    uuid not null references auth.users (id) on delete cascade,
  status          text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'expired')),
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz
);

-- At most one open request per series at a time.
create unique index series_requests_one_pending
  on public.series_requests (series_id)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- Helpers for policies. SECURITY DEFINER so a policy on series_participants
-- can ask about series_participants without recursing through its own RLS.
-- They live in `private`, which the API does not expose.
-- ---------------------------------------------------------------------------

create function private.is_series_participant(p_series_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.series_participants
    where series_id = p_series_id and user_id = (select auth.uid())
  );
$$;

create function private.is_round_participant(p_round_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.draft_rounds r
    join public.series_participants p on p.series_id = r.series_id
    where r.id = p_round_id and p.user_id = (select auth.uid())
  );
$$;

create function private.is_round_revealed(p_round_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.draft_rounds where id = p_round_id and status = 'revealed'
  );
$$;

grant usage on schema private to authenticated;
grant execute on function
  private.is_series_participant(uuid),
  private.is_round_participant(uuid),
  private.is_round_revealed(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Privileges: SELECT only, and only on client-visible columns.
-- ---------------------------------------------------------------------------

revoke all on
  public.series, public.series_participants, public.draft_rounds,
  public.draft_participants, public.draft_builds, public.draft_actions,
  public.fights, public.series_requests
  from anon, authenticated;

grant select (id, status, created_by, created_at, expires_at)
  on public.series to authenticated;                     -- not invite_token
grant select on public.series_participants to authenticated;
grant select (id, series_id, round_number, draft_version, pool_version, ratings_version,
              engine_version, status, created_at, revealed_at)
  on public.draft_rounds to authenticated;               -- not draft_seed / draft_plan
grant select on public.draft_participants to authenticated;
grant select on public.draft_builds to authenticated;
grant select on public.draft_actions to authenticated;
grant select on public.fights to authenticated;
grant select on public.series_requests to authenticated;

-- Tables created later in `public` get no client access by default.
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security: SELECT policies only.
-- ---------------------------------------------------------------------------

alter table public.series              enable row level security;
alter table public.series_participants enable row level security;
alter table public.draft_rounds        enable row level security;
alter table public.draft_participants  enable row level security;
alter table public.draft_builds        enable row level security;
alter table public.draft_actions       enable row level security;
alter table public.fights              enable row level security;
alter table public.series_requests     enable row level security;

create policy "participants read their series"
  on public.series for select to authenticated
  using (private.is_series_participant(id));

create policy "participants read who is in their series"
  on public.series_participants for select to authenticated
  using (private.is_series_participant(series_id));

create policy "participants read their draft rounds"
  on public.draft_rounds for select to authenticated
  using (private.is_series_participant(series_id));

create policy "participants read both players' progress"
  on public.draft_participants for select to authenticated
  using (private.is_round_participant(draft_round_id));

create policy "own build, or both after reveal"
  on public.draft_builds for select to authenticated
  using (
    user_id = (select auth.uid())
    or (private.is_round_revealed(draft_round_id) and private.is_round_participant(draft_round_id))
  );

create policy "own actions, or both after reveal"
  on public.draft_actions for select to authenticated
  using (
    user_id = (select auth.uid())
    or (private.is_round_revealed(draft_round_id) and private.is_round_participant(draft_round_id))
  );

create policy "participants read their fights"
  on public.fights for select to authenticated
  using (private.is_series_participant(series_id));

create policy "participants read their requests"
  on public.series_requests for select to authenticated
  using (private.is_series_participant(series_id));

-- ---------------------------------------------------------------------------
-- Realtime (UX only; the database stays the source of truth). Postgres
-- changes respect the policies above.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table
  public.series_participants,
  public.draft_participants,
  public.fights,
  public.series_requests;
