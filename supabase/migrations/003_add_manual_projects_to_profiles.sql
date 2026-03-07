alter table public.profiles
add column if not exists manual_projects jsonb not null default '[]'::jsonb;
