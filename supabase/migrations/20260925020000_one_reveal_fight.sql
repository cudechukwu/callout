-- Exactly one reveal fight per draft round, and one fight per accepted
-- rematch request, enforced by the database.
--
-- The series-wide unique fight number alone was not enough: two requests
-- that both saw "no fight yet" could count the fights at slightly different
-- moments, pick different numbers, and both insert.

alter table public.fights
  add column request_id uuid unique references public.series_requests (id) on delete set null;

-- A fight with no request is the one the reveal creates.
create unique index fights_one_reveal_fight_per_round
  on public.fights (draft_round_id)
  where request_id is null;
