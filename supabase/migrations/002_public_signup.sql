-- Public sign-up submissions (no auth required)
-- Separate from guests table for security - unauthenticated users can only insert here
CREATE TABLE IF NOT EXISTS public_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  company TEXT NOT NULL,
  industry TEXT,
  email TEXT,
  phone TEXT,
  referral_source TEXT,
  notes TEXT,
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,
  processed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public_signups ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (public form submissions)
CREATE POLICY "Anyone can submit a signup"
ON public_signups FOR INSERT
TO anon
WITH CHECK (true);

-- Authenticated users can read all signups
CREATE POLICY "Authenticated users can read signups"
ON public_signups FOR SELECT
TO authenticated
USING (true);

-- Admins and directors can update (mark as processed)
CREATE POLICY "Admins and directors can manage signups"
ON public_signups FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'chapter_director')
  )
);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public_signups;
