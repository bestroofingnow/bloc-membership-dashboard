-- 015_qr_token_bump_scan.sql
-- Atomic single-statement increment for qr_tokens.scan_count so concurrent
-- scans don't lose increments via TOCTOU between a SELECT and UPDATE.

CREATE OR REPLACE FUNCTION qr_token_bump_scan(p_qr_id UUID) RETURNS VOID AS $$
BEGIN
  UPDATE qr_tokens
  SET scan_count = scan_count + 1,
      last_scanned_at = NOW()
  WHERE id = p_qr_id;
END;
$$ LANGUAGE plpgsql;
