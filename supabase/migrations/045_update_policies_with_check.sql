-- 045: Add WITH CHECK to director UPDATE policies (from 005).
--
-- A FOR UPDATE policy with USING but no WITH CHECK validates only the row a
-- director can *see* — not the values they write. Without WITH CHECK a North
-- director could, e.g., UPDATE a North member and SET chapter = 'South',
-- moving rows into chapters they don't control. Mirror each USING clause as
-- WITH CHECK so the new row must satisfy the same scope.
--
-- (Admin FOR ALL policies are unaffected; admins remain unrestricted.)

DROP POLICY IF EXISTS "Directors can update their chapter members" ON members;
CREATE POLICY "Directors can update their chapter members"
  ON members FOR UPDATE
  TO authenticated
  USING (
    public.is_chapter_director()
    AND public.get_user_chapter() = members.chapter
  )
  WITH CHECK (
    public.is_chapter_director()
    AND public.get_user_chapter() = members.chapter
  );

DROP POLICY IF EXISTS "Directors can update guests" ON guests;
CREATE POLICY "Directors can update guests"
  ON guests FOR UPDATE
  TO authenticated
  USING (
    public.is_chapter_director()
    AND (guests.target_chapter IS NULL OR public.get_user_chapter() = guests.target_chapter)
  )
  WITH CHECK (
    public.is_chapter_director()
    AND (guests.target_chapter IS NULL OR public.get_user_chapter() = guests.target_chapter)
  );

DROP POLICY IF EXISTS "Directors can assign targets" ON industry_targets;
CREATE POLICY "Directors can assign targets"
  ON industry_targets FOR UPDATE
  TO authenticated
  USING (public.is_chapter_director())
  WITH CHECK (public.is_chapter_director());
