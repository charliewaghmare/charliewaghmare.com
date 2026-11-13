-- Saved timestamp for the To Apply shortlist. Application dates stay on applied_on.
-- Service role writes this. Visitors cannot read user_job_status.

alter table public.user_job_status
  add column if not exists saved_at timestamptz;
