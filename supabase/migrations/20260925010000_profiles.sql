-- Player profiles: the name and picture a player shows everywhere.
--
-- Unlike game state, a profile is the player's own to edit, so it is the
-- one table a client may write, and only its own row, and only these two
-- columns. Names and pictures are visible to every signed-in player (they
-- appear on opponents' screens).

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 1 and 24),
  -- A key from the app's picture list (src/lib/profilePictures.ts), or null.
  avatar_key    text check (avatar_key ~ '^[a-z0-9-]{1,40}$'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant insert (id, display_name, avatar_key) on public.profiles to authenticated;
grant update (display_name, avatar_key) on public.profiles to authenticated;

create policy "signed-in players read profiles"
  on public.profiles for select to authenticated
  using (true);

create policy "players create their own profile"
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));

create policy "players edit their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create function private.touch_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function private.touch_updated_at();
