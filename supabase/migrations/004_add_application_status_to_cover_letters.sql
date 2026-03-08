alter table public.cover_letters
  add column if not exists application_status text;

update public.cover_letters
set application_status = 'generated'
where application_status is null;

alter table public.cover_letters
  alter column application_status set default 'generated',
  alter column application_status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'cover_letters_application_status_check'
  ) then
    alter table public.cover_letters
      add constraint cover_letters_application_status_check
      check (application_status in ('generated', 'applied', 'interview', 'accepted', 'rejected'));
  end if;
end;
$$;

create index if not exists cover_letters_user_id_application_status_idx
  on public.cover_letters (user_id, application_status);
