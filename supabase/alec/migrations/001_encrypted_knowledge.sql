-- Apply only to the designated ALEC Supabase project after review.
begin;
create table public.alec_knowledge_backups (
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  backup_id uuid not null default gen_random_uuid(),
  envelope text not null check (char_length(envelope) between 56 and 1398200),
  created_at timestamptz not null default now(),
  primary key (owner_id, backup_id)
);
alter table public.alec_knowledge_backups enable row level security;
alter table public.alec_knowledge_backups force row level security;
revoke all on public.alec_knowledge_backups from anon, authenticated;
grant select, insert, delete on public.alec_knowledge_backups to authenticated;
create policy alec_backup_select on public.alec_knowledge_backups for select to authenticated using (owner_id = (select auth.uid()));
create policy alec_backup_insert on public.alec_knowledge_backups for insert to authenticated with check (owner_id = (select auth.uid()));
create policy alec_backup_delete on public.alec_knowledge_backups for delete to authenticated using (owner_id = (select auth.uid()));
commit;
