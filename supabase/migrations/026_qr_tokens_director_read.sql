-- ============================================================
-- Migration 026: Director QR-token read (Phase 1 §5.5)
--
-- qr_tokens previously had only an admin SELECT policy, so directors saw
-- ZERO rows even though useQrTokens filters to their chapter + null-chapter.
-- This policy is OR-combined with the admin one, so it only ADDS rows; it
-- never narrows admin visibility. Uses the 005 helpers (no inline profiles
-- self-select, so no recursion).
-- ============================================================

DROP POLICY IF EXISTS "qr_tokens_director_read" ON qr_tokens;
CREATE POLICY "qr_tokens_director_read" ON qr_tokens
  FOR SELECT TO authenticated
  USING (
    public.is_chapter_director()
    AND (chapter = public.get_user_chapter() OR chapter IS NULL)
  );
