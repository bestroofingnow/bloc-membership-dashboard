-- Add must_change_password flag to profiles table
-- Used to force bulk-created member accounts to set a new password on first login

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
did 