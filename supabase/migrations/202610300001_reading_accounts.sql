-- Run once in the Supabase SQL Editor. No service-role key is used in the browser.
create table if not exists public.reading_libraries (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  constraint valid_library check (
    jsonb_typeof(payload) = 'object' and payload->>'version' = '1'
    and jsonb_typeof(payload->'books') = 'array'
    and jsonb_typeof(payload->'settings') = 'object'
    and octet_length(payload::text) <= 52428800
  )
);
alter table public.reading_libraries enable row level security;
revoke all on public.reading_libraries from anon, authenticated;
grant select on public.reading_libraries to authenticated;
drop policy if exists "Read own library" on public.reading_libraries;
create policy "Read own library" on public.reading_libraries for select to authenticated
  using ((select auth.uid()) = user_id);

-- Atomic compare-and-swap: a stale device cannot silently overwrite a newer library.
create or replace function public.save_reading_library(p_payload jsonb, p_expected_revision bigint, p_user_id uuid)
returns bigint language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); next_revision bigint;
begin
  if owner_id is null or owner_id is distinct from p_user_id then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'Invalid revision' using errcode = '22023';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or p_payload->>'version' is distinct from '1'
    or jsonb_typeof(p_payload->'books') is distinct from 'array'
    or jsonb_typeof(p_payload->'settings') is distinct from 'object'
    or octet_length(p_payload::text) > 52428800 then
    raise exception 'Invalid library' using errcode = '22023';
  end if;
  if p_expected_revision = 0 then
    insert into public.reading_libraries(user_id,payload) values(owner_id,p_payload)
      on conflict(user_id) do nothing returning revision into next_revision;
  else
    update public.reading_libraries set payload=p_payload,revision=revision+1,updated_at=now()
      where user_id=owner_id and revision=p_expected_revision returning revision into next_revision;
  end if;
  if next_revision is null then raise exception 'Library conflict' using errcode = '40001'; end if;
  return next_revision;
end;
$$;
revoke all on function public.save_reading_library(jsonb,bigint,uuid) from public,anon;
grant execute on function public.save_reading_library(jsonb,bigint,uuid) to authenticated;
