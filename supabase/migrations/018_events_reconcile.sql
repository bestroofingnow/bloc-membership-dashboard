-- ============================================================
-- Migration 018: Reconcile the duplicate `events` table
--
-- 003_wildapricot.sql and 010_intake_events.sql each ran
-- `CREATE TABLE IF NOT EXISTS events` with disjoint columns; the
-- first to run wins and the other is a silent no-op. This pins the
-- canonical `events` definition as the documented SUPERSET of both,
-- so fresh rebuilds match prod and every events writer/reader works.
--
-- Keeps 010's intake columns (title/starts_at/ends_at/ics_uid/
-- public_visible) and ADDS nullable 003/WA-sync columns.
-- Additive only — no column dropped, no row removed.
-- ============================================================

-- 010 (intake) columns — present if 010 won, added if 003 won.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS chapter          TEXT,
  ADD COLUMN IF NOT EXISTS kind             TEXT,
  ADD COLUMN IF NOT EXISTS title            TEXT,
  ADD COLUMN IF NOT EXISTS description      TEXT,
  ADD COLUMN IF NOT EXISTS starts_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ends_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS location_name    TEXT,
  ADD COLUMN IF NOT EXISTS location_address TEXT,
  ADD COLUMN IF NOT EXISTS ics_uid          TEXT,
  ADD COLUMN IF NOT EXISTS public_visible   BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ DEFAULT NOW();

-- 003 / Wild Apricot sync columns — nullable so intake-only rows are fine.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS name                 TEXT,
  ADD COLUMN IF NOT EXISTS event_date           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS end_date             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS location             TEXT,
  ADD COLUMN IF NOT EXISTS event_type           TEXT,
  ADD COLUMN IF NOT EXISTS wa_event_id          TEXT,
  ADD COLUMN IF NOT EXISTS registration_url     TEXT,
  ADD COLUMN IF NOT EXISTS max_registrants      INTEGER,
  ADD COLUMN IF NOT EXISTS current_registrants  INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMPTZ DEFAULT NOW();

-- Keep the unique constraint the WA upsert relies on (idempotent).
CREATE UNIQUE INDEX IF NOT EXISTS events_wa_event_id_key
  ON public.events(wa_event_id) WHERE wa_event_id IS NOT NULL;

-- Indexes the readers use (idempotent; no-op if already present).
CREATE INDEX IF NOT EXISTS events_starts_at_idx ON public.events(starts_at);
CREATE INDEX IF NOT EXISTS events_chapter_idx   ON public.events(chapter);
