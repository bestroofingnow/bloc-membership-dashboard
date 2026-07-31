-- ============================================================
-- Migration 048: Networking stats views + org-wide feature toggle
-- Aggregate-only views (counts, no raw content) — same privacy posture as
-- the existing v_referral_stats (migration 032). Power both the mobile
-- Tracker screen and the dashboard admin Networking tab.
-- ============================================================

CREATE OR REPLACE VIEW public.v_meeting_stats AS
  SELECT member_id, count(*) AS meetings_count
  FROM public.meeting_participants
  WHERE response_status = 'accepted'
  GROUP BY member_id;
GRANT SELECT ON public.v_meeting_stats TO authenticated;

CREATE OR REPLACE VIEW public.v_connection_stats AS
  SELECT c.member_id,
         count(*) AS connections_count,
         count(r.id) AS converted_count
  FROM public.connections c
  LEFT JOIN public.referrals r ON r.source_connection_id = c.id
  GROUP BY c.member_id;
GRANT SELECT ON public.v_connection_stats TO authenticated;

INSERT INTO dashboard_settings (key, value) VALUES ('networking_enabled', 'true')
ON CONFLICT (key) DO NOTHING;
