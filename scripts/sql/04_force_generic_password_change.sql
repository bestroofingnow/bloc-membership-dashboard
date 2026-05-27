-- =========================================================================
-- Force a password change for everyone STILL using the generic password
-- (BlocMem1!), so they must set a new one on next sign-in.
--
-- How it works: the dashboard's AuthGuard blocks all access behind a forced
-- "Change Password" modal whenever profiles.must_change_password = true, and
-- clears the flag once the user sets a new password. This script just turns
-- that flag on for the right accounts.
--
-- We detect "still on the generic password" precisely with pgcrypto's crypt():
-- re-hashing 'BlocMem1!' with the salt embedded in the stored hash reproduces
-- the stored hash only if that is still the user's password. Members who have
-- already chosen their own password are left untouched.
--
-- james@bestroofingnow.com is intentionally excluded so the admin is never
-- locked into the change-password screen mid-session.
--
-- Paste into the Supabase SQL editor and run. Step 1 is a safe read-only
-- preview; Step 2 applies the change.
-- =========================================================================

-- Step 1 (preview, read-only): who is still on BlocMem1! and will be forced?
SELECT u.email, u.last_sign_in_at, p.must_change_password AS already_flagged
FROM auth.users u
JOIN public.profiles p ON p.id = u.id
WHERE u.encrypted_password = crypt('BlocMem1!', u.encrypted_password)
  AND lower(u.email) <> 'james@bestroofingnow.com'
ORDER BY u.email;

-- Step 2 (apply): flag exactly those accounts.
UPDATE public.profiles p
SET must_change_password = true
FROM auth.users u
WHERE p.id = u.id
  AND u.encrypted_password = crypt('BlocMem1!', u.encrypted_password)
  AND lower(u.email) <> 'james@bestroofingnow.com';

-- Step 3 (verify): how many accounts are now forced to change.
SELECT count(*) AS now_forced
FROM public.profiles
WHERE must_change_password = true;
