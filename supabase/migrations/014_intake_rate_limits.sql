-- 014_intake_rate_limits.sql
CREATE TABLE IF NOT EXISTS intake_rate_limits (
  id BIGSERIAL PRIMARY KEY,
  bucket TEXT NOT NULL,    -- e.g. 'submit:1.2.3.4'
  count  INT NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bucket, window_start)
);

CREATE INDEX intake_rate_limits_bucket_window_idx
  ON intake_rate_limits(bucket, window_start);

-- No RLS needed: only service-role server access.

CREATE OR REPLACE FUNCTION intake_rate_limit_bump(
  p_bucket TEXT,
  p_window_start TIMESTAMPTZ
) RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  INSERT INTO intake_rate_limits (bucket, window_start, count)
  VALUES (p_bucket, p_window_start, 1)
  ON CONFLICT (bucket, window_start)
  DO UPDATE SET count = intake_rate_limits.count + 1
  RETURNING count INTO v_count;

  -- Opportunistic cleanup of old rows (older than 1 day)
  DELETE FROM intake_rate_limits WHERE window_start < NOW() - INTERVAL '1 day';

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;
