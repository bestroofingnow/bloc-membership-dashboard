-- =========================================================================
-- BLOCK 3: Extend business_card_scans to track who scanned + what they scanned
-- Paste into https://supabase.com/dashboard/project/ksmtkisknnvrjdfigsll/sql/new
-- Idempotent (uses IF NOT EXISTS) — safe to re-run.
-- =========================================================================

alter table public.business_card_scans
  add column if not exists scanned_by_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists target_guest_id      uuid references public.guests(id)   on delete set null,
  add column if not exists target_member_id     uuid references public.members(id)  on delete set null,
  add column if not exists email_normalized     text;

-- Backfill normalized email for any pre-existing rows
update public.business_card_scans
set email_normalized = lower(trim(email))
where email_normalized is null and email is not null and email <> '';

-- Indexes for the lookups the API will do on every scan
create index if not exists business_card_scans_email_normalized_idx
  on public.business_card_scans(email_normalized);
create index if not exists business_card_scans_scanned_by_idx
  on public.business_card_scans(scanned_by_profile_id);
create index if not exists business_card_scans_target_member_idx
  on public.business_card_scans(target_member_id);

-- Verify
select column_name, data_type
from information_schema.columns
where table_name = 'business_card_scans'
  and column_name in ('scanned_by_profile_id', 'target_guest_id', 'target_member_id', 'email_normalized')
order by column_name;
