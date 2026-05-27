-- =========================================================================
-- BLOCK 1: Bulk-reset every user's password to BlocMem1!
-- Paste this whole file into the Supabase SQL editor and click "Run".
-- =========================================================================

-- Step 1 (optional sanity check): see who you're about to affect.
select email, last_sign_in_at from auth.users order by created_at;

-- Step 2: do the reset.
update auth.users
set encrypted_password = crypt('BlocMem1!', gen_salt('bf')),
    updated_at        = now();

update public.profiles
set must_change_password = true;

-- Step 3: verify.
select count(*) as users_reset    from auth.users;
select count(*) as flagged_change from public.profiles where must_change_password = true;
