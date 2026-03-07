-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles table
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  full_name text not null default '',
  email text not null default '',
  phone text,
  linkedin_url text,
  location text,
  job_title text not null default '',
  years_of_experience integer not null default 0,
  skills text[] not null default '{}',
  education jsonb not null default '[]',
  work_experience jsonb not null default '[]',
  certifications text[],
  languages text[],
  preferred_tone text not null default 'balanced' check (preferred_tone in ('formal', 'conversational', 'confident', 'balanced')),
  career_intent text not null default 'same_field' check (career_intent in ('same_field', 'career_change', 'promotion', 'freelance')),
  unique_value text not null default '',
  proudest_achievement text not null default '',
  things_to_emphasize text,
  things_to_downplay text,
  cv_url text,
  raw_cv_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Cover letters table
create table if not exists public.cover_letters (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  company_name text not null,
  company_research jsonb,
  matched_skills jsonb,
  cover_letter_text text not null default '',
  version integer not null default 1,
  created_at timestamptz not null default now()
);

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.cover_letters enable row level security;

-- Profiles RLS policies
create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Cover letters RLS policies
create policy "Users can view their own cover letters"
  on public.cover_letters for select
  using (auth.uid() = user_id);

create policy "Users can insert their own cover letters"
  on public.cover_letters for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own cover letters"
  on public.cover_letters for update
  using (auth.uid() = user_id);

create policy "Users can delete their own cover letters"
  on public.cover_letters for delete
  using (auth.uid() = user_id);

-- Auto-update updated_at on profiles
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

-- Auto-create profile on user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Storage bucket for CVs
insert into storage.buckets (id, name, public)
values ('cvs', 'cvs', false)
on conflict do nothing;

-- Storage RLS: users can only access their own CV folder
create policy "Users can upload their own CVs"
  on storage.objects for insert
  with check (bucket_id = 'cvs' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can view their own CVs"
  on storage.objects for select
  using (bucket_id = 'cvs' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can delete their own CVs"
  on storage.objects for delete
  using (bucket_id = 'cvs' and auth.uid()::text = (storage.foldername(name))[1]);
