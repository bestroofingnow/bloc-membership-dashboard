-- ============================================================
-- Migration 042: RAG knowledge base for Ask BLOC (pgvector + gte-small)
-- Stores a semantic embedding per member (and, later, per doc) so the assistant can
-- retrieve by meaning, not just keywords. Self-updates: a members trigger asks the
-- `kb-embed` Edge Function (gte-small, 384-dim) to (re)embed a member on insert/update;
-- ON DELETE CASCADE removes a deleted member's chunk; the function prunes inactive ones.
-- The shared secret lives in private.app_config (inserted out-of-band, never in git).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- private config (service-role only) — holds the kb-embed shared secret
CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE IF NOT EXISTS private.app_config (key text PRIMARY KEY, value text);
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON private.app_config FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL CHECK (source_type IN ('member','doc')),
  member_id   uuid REFERENCES public.members(id) ON DELETE CASCADE,
  doc_key     text,
  content     text NOT NULL,
  embedding   vector(384),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_chunks_member_uniq ON public.knowledge_chunks(member_id) WHERE member_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_chunks_doc_uniq ON public.knowledge_chunks(doc_key) WHERE doc_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx ON public.knowledge_chunks USING hnsw (embedding vector_cosine_ops);

ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;
-- Readable by any member (content is business info); writes happen only via the service role.
DROP POLICY IF EXISTS knowledge_chunks_read ON public.knowledge_chunks;
CREATE POLICY knowledge_chunks_read ON public.knowledge_chunks FOR SELECT TO authenticated USING (true);

-- Cosine-similarity search over the knowledge base.
CREATE OR REPLACE FUNCTION public.match_knowledge(query_embedding vector(384), match_count int DEFAULT 6)
RETURNS TABLE (id uuid, source_type text, member_id uuid, content text, similarity float)
LANGUAGE sql STABLE AS $$
  SELECT k.id, k.source_type, k.member_id, k.content,
         1 - (k.embedding <=> query_embedding) AS similarity
  FROM public.knowledge_chunks k
  WHERE k.embedding IS NOT NULL
  ORDER BY k.embedding <=> query_embedding
  LIMIT greatest(1, least(match_count, 20))
$$;
GRANT EXECUTE ON FUNCTION public.match_knowledge(vector, int) TO authenticated, service_role;

-- On member insert/update of relevant fields, fire-and-forget a request to re-embed.
CREATE OR REPLACE FUNCTION public.queue_member_embedding()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, net AS $$
DECLARE
  secret text;
BEGIN
  SELECT value INTO secret FROM private.app_config WHERE key = 'kb_secret';
  IF secret IS NULL THEN RETURN NEW; END IF; -- not configured yet → no-op (never blocks the write)
  PERFORM net.http_post(
    url := 'https://ksmtkisknnvrjdfigsll.supabase.co/functions/v1/kb-embed',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-kb-secret', secret),
    body := jsonb_build_object('mode', 'embed_member', 'member_id', NEW.id)
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS members_queue_embedding ON public.members;
CREATE TRIGGER members_queue_embedding
  AFTER INSERT OR UPDATE OF name, company, chapter, industry, title, description, ideal_referral, member_status, email
  ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.queue_member_embedding();
