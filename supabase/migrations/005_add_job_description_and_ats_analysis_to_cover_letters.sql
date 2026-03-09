alter table public.cover_letters
  add column if not exists job_description text,
  add column if not exists job_url text,
  add column if not exists ats_analysis jsonb;
