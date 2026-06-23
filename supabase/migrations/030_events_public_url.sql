-- 030: optional public registration link per event (Wild Apricot event page).
-- Used by the mobile Events tab to share/QR a specific event; falls back to the
-- master events page (businessleadersofcharlotte.com/events) when null.

alter table public.events add column if not exists public_url text;

comment on column public.events.public_url is
  'Public registration/detail URL for this event (e.g. businessleadersofcharlotte.com/event-<id>). Optional; shown/shared by the mobile app.';

-- Seed the current Wild Apricot event links, matched by start date (each date is
-- unique). Idempotent: only fills events that don't already have a link.
update public.events set public_url = 'https://businessleadersofcharlotte.com/event-6626163' where starts_at::date = '2026-06-24' and public_url is null;
update public.events set public_url = 'https://businessleadersofcharlotte.com/event-6484426' where starts_at::date = '2026-07-08' and public_url is null;
update public.events set public_url = 'https://businessleadersofcharlotte.com/event-6484397' where starts_at::date = '2026-07-09' and public_url is null;
update public.events set public_url = 'https://businessleadersofcharlotte.com/event-6484508' where starts_at::date = '2026-07-10' and public_url is null;
update public.events set public_url = 'https://businessleadersofcharlotte.com/event-6673807' where starts_at::date = '2026-07-14' and public_url is null;
update public.events set public_url = 'https://businessleadersofcharlotte.com/event-6673808' where starts_at::date = '2026-08-11' and public_url is null;
update public.events set public_url = 'https://businessleadersofcharlotte.com/event-6484429' where starts_at::date = '2026-08-12' and public_url is null;
update public.events set public_url = 'https://businessleadersofcharlotte.com/event-6484407' where starts_at::date = '2026-08-13' and public_url is null;
update public.events set public_url = 'https://businessleadersofcharlotte.com/event-6484510' where starts_at::date = '2026-08-14' and public_url is null;
update public.events set public_url = 'https://businessleadersofcharlotte.com/event-6527169' where starts_at::date = '2026-08-26' and public_url is null;
update public.events set public_url = 'https://businessleadersofcharlotte.com/event-6673811' where starts_at::date = '2026-09-08' and public_url is null;
update public.events set public_url = 'https://businessleadersofcharlotte.com/event-6484431' where starts_at::date = '2026-09-09' and public_url is null;
update public.events set public_url = 'https://businessleadersofcharlotte.com/event-6484410' where starts_at::date = '2026-09-10' and public_url is null;
update public.events set public_url = 'https://businessleadersofcharlotte.com/event-6484511' where starts_at::date = '2026-09-11' and public_url is null;
update public.events set public_url = 'https://businessleadersofcharlotte.com/event-6484411' where starts_at::date = '2026-10-08' and public_url is null;
update public.events set public_url = 'https://businessleadersofcharlotte.com/event-6484514' where starts_at::date = '2026-10-09' and public_url is null;
update public.events set public_url = 'https://businessleadersofcharlotte.com/event-6673816' where starts_at::date = '2026-10-13' and public_url is null;
update public.events set public_url = 'https://businessleadersofcharlotte.com/event-6484432' where starts_at::date = '2026-10-14' and public_url is null;
update public.events set public_url = 'https://businessleadersofcharlotte.com/event-6527151' where starts_at::date = '2026-10-28' and public_url is null;
update public.events set public_url = 'https://businessleadersofcharlotte.com/event-6673818' where starts_at::date = '2026-11-10' and public_url is null;
update public.events set public_url = 'https://businessleadersofcharlotte.com/event-6484434' where starts_at::date = '2026-11-11' and public_url is null;
update public.events set public_url = 'https://businessleadersofcharlotte.com/event-6484412' where starts_at::date = '2026-11-12' and public_url is null;
update public.events set public_url = 'https://businessleadersofcharlotte.com/event-6484518' where starts_at::date = '2026-11-13' and public_url is null;
update public.events set public_url = 'https://businessleadersofcharlotte.com/event-6673819' where starts_at::date = '2026-12-08' and public_url is null;
update public.events set public_url = 'https://businessleadersofcharlotte.com/event-6484435' where starts_at::date = '2026-12-09' and public_url is null;
update public.events set public_url = 'https://businessleadersofcharlotte.com/event-6484414' where starts_at::date = '2026-12-10' and public_url is null;
update public.events set public_url = 'https://businessleadersofcharlotte.com/event-6484519' where starts_at::date = '2026-12-11' and public_url is null;
