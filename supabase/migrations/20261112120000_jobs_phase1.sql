-- Phase 1 jobs dashboard. Personal tables. Service role is used only by the Next.js server.
-- Anonymous visitors can read active jobs and company cards. They cannot write or read status,
-- suppressions, preferences, search runs, or PIN attempts.

create extension if not exists pgcrypto;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website text,
  careers_url text,
  industry text,
  location text,
  logo_url text,
  description text,
  why_interesting text,
  discovery_status text not null default 'target'
    check (discovery_status in ('target', 'watching', 'contacted')),
  has_verified_opening boolean not null default false,
  is_sample boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_id text,
  source_url text,
  application_url text,
  title text not null,
  company_id uuid not null references public.companies (id),
  location text,
  work_arrangement text check (work_arrangement in ('onsite', 'hybrid', 'remote')),
  description text,
  responsibilities jsonb not null default '[]'::jsonb,
  qualifications jsonb not null default '[]'::jsonb,
  skills text[] not null default '{}',
  salary_min integer,
  salary_max integer,
  salary_currency text,
  salary_period text,
  employment_type text,
  work_term text,
  posted_on date,
  discovered_at timestamptz not null default now(),
  last_verified_at timestamptz,
  match_score integer not null check (match_score between 0 and 100),
  score_breakdown jsonb not null default '{}'::jsonb,
  recommendation text,
  skill_gaps text[] not null default '{}',
  deadline date,
  category_tags text[] not null default '{}',
  active boolean not null default true,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index jobs_source_identity_idx
  on public.jobs (source, source_id)
  where source_id is not null;

create unique index jobs_source_url_idx
  on public.jobs (source, source_url)
  where source_url is not null;

create index jobs_active_score_idx
  on public.jobs (match_score desc)
  where active;

create table public.user_job_status (
  job_id uuid primary key references public.jobs (id) on delete cascade,
  saved boolean not null default false,
  applied boolean not null default false,
  applied_on date,
  notes text,
  stage text check (stage in ('applied', 'interview', 'offer', 'rejected', 'withdrawn')),
  updated_at timestamptz not null default now()
);

create table public.job_suppressions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs (id) on delete set null,
  source text not null,
  source_id text,
  source_url text,
  suppressed_at timestamptz not null default now()
);

create unique index job_suppressions_identity_idx
  on public.job_suppressions (source, source_id)
  where source_id is not null;

create unique index job_suppressions_url_idx
  on public.job_suppressions (source, source_url)
  where source_url is not null;

create table public.search_preferences (
  id integer primary key default 1 check (id = 1),
  weights jsonb not null,
  interests jsonb not null,
  locations jsonb not null,
  work_terms text[] not null,
  min_score integer not null default 50 check (min_score between 0 and 100),
  strategy text not null,
  feedback_adaptation text not null,
  updated_at timestamptz not null default now()
);

create table public.search_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  run_type text not null,
  status text not null,
  discovered_count integer not null default 0,
  added_count integer not null default 0,
  updated_count integer not null default 0,
  error text,
  prompt text
);

create index search_runs_status_idx
  on public.search_runs (status, completed_at desc);

create table public.pin_attempts (
  id bigint generated always as identity primary key,
  attempted_at timestamptz not null default now(),
  success boolean not null,
  ip_hash text not null
);

create index pin_attempts_recent_idx
  on public.pin_attempts (attempted_at desc);

insert into public.search_preferences (
  id, weights, interests, locations, work_terms, min_score, strategy, feedback_adaptation
) values (
  1,
  '{"interest":35,"location":20,"qualifications":20,"career":20,"compensation":5}'::jsonb,
  '[]'::jsonb,
  '{"ideal":["Toronto and GTA","Vancouver and Lower Mainland"],"good":["Collingwood","Thornbury","Meaford","Wasaga Beach","Owen Sound","Surrounding Georgian Bay region"],"remote":["Remote opportunities within Canada"],"exceptionalOnly":["Other Canadian locations"]}'::jsonb,
  array['Summer 2027', 'Fall 2027', 'Winter 2028', 'Rolling or flexible start'],
  50,
  'Exploratory discovery, including conventional internships, niche teams, small companies, startups and unusual roles.',
  'Moderate adaptation from saved, applied and ignored jobs. Explicit preferences stay authoritative.'
);

alter table public.companies enable row level security;
alter table public.jobs enable row level security;
alter table public.user_job_status enable row level security;
alter table public.job_suppressions enable row level security;
alter table public.search_preferences enable row level security;
alter table public.search_runs enable row level security;
alter table public.pin_attempts enable row level security;

revoke all on public.companies from anon, authenticated;
revoke all on public.jobs from anon, authenticated;
revoke all on public.user_job_status from anon, authenticated;
revoke all on public.job_suppressions from anon, authenticated;
revoke all on public.search_preferences from anon, authenticated;
revoke all on public.search_runs from anon, authenticated;
revoke all on public.pin_attempts from anon, authenticated;

grant select on public.companies to anon, authenticated;
grant select on public.jobs to anon, authenticated;

create policy companies_public_read
  on public.companies
  for select
  to anon, authenticated
  using (true);

create policy jobs_public_read
  on public.jobs
  for select
  to anon, authenticated
  using (active = true);

-- No policies on private tables: anon and authenticated cannot read or write them.
-- The Next.js server uses the service role after the edit-session cookie is verified.
