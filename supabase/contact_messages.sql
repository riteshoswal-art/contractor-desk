-- The "Contact us" form's table. Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Row-Level Security is ON. The public (anon) key used by the website can only
-- INSERT new rows; it can never read, change or delete them. You read them in
-- the Supabase dashboard (Table Editor), which bypasses RLS for the owner.

create table if not exists public.contact_messages (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name       text not null check (char_length(name) between 2 and 80),
  email      text not null check (char_length(email) between 3 and 254),
  message    text not null check (char_length(message) between 10 and 2000),
  source     text not null default 'website' check (source in ('website'))
);

alter table public.contact_messages enable row level security;

drop policy if exists "website can insert messages" on public.contact_messages;
create policy "website can insert messages"
  on public.contact_messages
  for insert
  to anon
  with check (true);

-- Newer Supabase projects do not grant table privileges to anon automatically:
-- allow INSERT only (no SELECT), so the website can add rows but never read them.
grant insert on table public.contact_messages to anon;

-- No SELECT, UPDATE or DELETE policy: with RLS on, those are refused for anon.
