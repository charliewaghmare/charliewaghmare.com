-- Phase 2 collection fields. Existing rows keep working.

alter table public.jobs add column if not exists country text;
alter table public.jobs add column if not exists scoring_version text;
alter table public.jobs add column if not exists lifecycle_status text not null default 'active';
alter table public.jobs add column if not exists verification_status text not null default 'verified';
alter table public.jobs add column if not exists miss_count integer not null default 0;
alter table public.jobs add column if not exists work_authorization_note text;
alter table public.jobs add column if not exists raw_metadata jsonb not null default '{}'::jsonb;

alter table public.companies add column if not exists ats_provider text;
alter table public.companies add column if not exists ats_board_id text;
alter table public.companies add column if not exists enabled boolean not null default true;
alter table public.companies add column if not exists last_checked_at timestamptz;
alter table public.companies add column if not exists categories text[] not null default '{}';
alter table public.companies add column if not exists geographic_relevance text;
alter table public.companies add column if not exists monitoring_status text not null default 'pending';

alter table public.search_runs add column if not exists summary jsonb;

create unique index if not exists companies_ats_board_idx
  on public.companies (ats_provider, ats_board_id)
  where ats_board_id is not null;
