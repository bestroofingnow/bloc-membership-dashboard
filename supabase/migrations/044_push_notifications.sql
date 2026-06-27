-- ============================================================
-- Migration 044: Push notifications — device tokens + send triggers
-- Stores Expo push tokens per member and fires a push via the push-send Edge Function
-- (Expo Push API) on the key networking events: a new/answered meeting invite, a new
-- referral, a new testimonial. Reuses pg_net + the private.app_config secret from 042.
-- Tokens are written by the service-role /api/me/push-token route.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.push_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id       uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  expo_push_token text NOT NULL UNIQUE,
  platform        text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_tokens_member_idx ON public.push_tokens(member_id);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
-- Tokens are managed via the service-role API; a member may read their own.
DROP POLICY IF EXISTS push_tokens_owner ON public.push_tokens;
CREATE POLICY push_tokens_owner ON public.push_tokens FOR SELECT TO authenticated
  USING (member_id = public.current_member_id());

-- Fire a push to a member via the push-send edge function (fire-and-forget via pg_net).
CREATE OR REPLACE FUNCTION public.send_push(p_member_id uuid, p_title text, p_body text, p_data jsonb DEFAULT '{}')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, net AS $$
DECLARE secret text;
BEGIN
  IF p_member_id IS NULL THEN RETURN; END IF;
  SELECT value INTO secret FROM private.app_config WHERE key = 'kb_secret';
  IF secret IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := 'https://ksmtkisknnvrjdfigsll.supabase.co/functions/v1/push-send',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-kb-secret', secret),
    body := jsonb_build_object('member_id', p_member_id, 'title', p_title, 'body', p_body, 'data', p_data)
  );
END $$;

-- ---------- meeting invites ----------
CREATE OR REPLACE FUNCTION public.notify_meeting_invite()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor_name text; kind_label text; acceptor_id uuid;
BEGIN
  kind_label := CASE NEW.kind WHEN 'coffee' THEN 'coffee' WHEN 'lunch' THEN 'lunch' ELSE 'a virtual chat' END;
  IF TG_OP = 'INSERT' THEN
    SELECT name INTO actor_name FROM public.members WHERE id = NEW.from_member_id;
    PERFORM public.send_push(NEW.to_member_id, 'New meeting invite',
      COALESCE(actor_name, 'A member') || ' invited you to ' || kind_label,
      jsonb_build_object('type', 'meeting', 'id', NEW.id));
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    acceptor_id := CASE WHEN NEW.proposed_by_member_id = NEW.from_member_id THEN NEW.to_member_id ELSE NEW.from_member_id END;
    SELECT name INTO actor_name FROM public.members WHERE id = acceptor_id;
    IF NEW.status = 'accepted' THEN
      PERFORM public.send_push(NEW.proposed_by_member_id, 'Meeting confirmed',
        COALESCE(actor_name, 'A member') || ' accepted your ' || kind_label,
        jsonb_build_object('type', 'meeting', 'id', NEW.id));
    ELSIF NEW.status = 'declined' THEN
      PERFORM public.send_push(NEW.proposed_by_member_id, 'Meeting update',
        COALESCE(actor_name, 'A member') || ' can''t make ' || kind_label,
        jsonb_build_object('type', 'meeting', 'id', NEW.id));
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS meeting_invites_notify ON public.meeting_invites;
CREATE TRIGGER meeting_invites_notify AFTER INSERT OR UPDATE OF status ON public.meeting_invites
  FOR EACH ROW EXECUTE FUNCTION public.notify_meeting_invite();

-- ---------- referrals ----------
CREATE OR REPLACE FUNCTION public.notify_referral()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE from_name text;
BEGIN
  SELECT name INTO from_name FROM public.members WHERE id = NEW.from_member_id;
  PERFORM public.send_push(NEW.to_member_id, 'New referral',
    COALESCE(from_name, 'A member') || ' sent you a referral',
    jsonb_build_object('type', 'referral', 'id', NEW.id));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS referrals_notify ON public.referrals;
CREATE TRIGGER referrals_notify AFTER INSERT ON public.referrals
  FOR EACH ROW EXECUTE FUNCTION public.notify_referral();

-- ---------- testimonials ----------
CREATE OR REPLACE FUNCTION public.notify_testimonial()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE author_name text;
BEGIN
  SELECT name INTO author_name FROM public.members WHERE id = NEW.author_member_id;
  PERFORM public.send_push(NEW.subject_member_id, 'You got a testimonial',
    COALESCE(author_name, 'A member') || ' wrote you a testimonial',
    jsonb_build_object('type', 'testimonial', 'id', NEW.id));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS testimonials_notify ON public.testimonials;
CREATE TRIGGER testimonials_notify AFTER INSERT ON public.testimonials
  FOR EACH ROW EXECUTE FUNCTION public.notify_testimonial();
