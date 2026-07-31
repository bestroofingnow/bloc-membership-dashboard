-- ============================================================
-- Migration 048a: Fix v_connection_stats fan-out bug
-- Closes a defect found in task review of migration 048: the original
-- view LEFT JOINed connections to referrals, which fans out for any
-- connection with more than one referral (a case the schema explicitly
-- anticipates — one connection can produce several referrals over time),
-- inflating connections_count. Rewritten to avoid the join: connections_count
-- is now a correct per-row count with no fan-out, and converted_count counts
-- connections that have at least one referral (not total referrals).
-- ============================================================

CREATE OR REPLACE VIEW public.v_connection_stats AS
  SELECT c.member_id,
         count(*) AS connections_count,
         count(*) FILTER (WHERE EXISTS (
           SELECT 1 FROM public.referrals r WHERE r.source_connection_id = c.id
         )) AS converted_count
  FROM public.connections c
  GROUP BY c.member_id;
GRANT SELECT ON public.v_connection_stats TO authenticated;
