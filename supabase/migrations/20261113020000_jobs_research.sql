-- Query history for AI research. Service role writes it. Visitors cannot read it.

create table if not exists public.search_queries (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.search_runs (id) on delete set null,
  track text not null,
  query text not null,
  ran_at timestamptz not null default now(),
  candidate_count integer not null default 0,
  verified_count integer not null default 0
);

create index if not exists search_queries_ran_at_idx
  on public.search_queries (ran_at desc);

alter table public.search_queries enable row level security;
revoke all on public.search_queries from anon, authenticated;
