                                                            -- BLOC Membership Dashboard Schema
                                                            -- Run this in your Supabase SQL Editor

                                                            -- ============================================
                                                            -- PROFILES TABLE (extends auth.users)
                                                            -- ============================================
                                                            CREATE TABLE IF NOT EXISTS profiles (
                                                              id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
                                                              email TEXT NOT NULL,
                                                              full_name TEXT,
                                                              role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'chapter_director', 'member')),
                                                              chapter TEXT CHECK (chapter IN ('North', 'South', 'Uptown', 'FLOC', 'Alumni')),
                                                              created_at TIMESTAMPTZ DEFAULT NOW(),
                                                              updated_at TIMESTAMPTZ DEFAULT NOW()
                                                            );

                                                            -- ============================================
                                                            -- MEMBERS TABLE
                                                            -- ============================================
                                                            CREATE TABLE IF NOT EXISTS members (
                                                              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                                                              name TEXT NOT NULL,
                                                              company TEXT NOT NULL,
                                                              chapter TEXT NOT NULL CHECK (chapter IN ('North', 'South', 'Uptown', 'FLOC', 'Alumni')),
                                                              industry TEXT NOT NULL,
                                                              email TEXT,
                                                              phone TEXT,
                                                              join_date DATE,
                                                              created_at TIMESTAMPTZ DEFAULT NOW(),
                                                              updated_at TIMESTAMPTZ DEFAULT NOW()
                                                            );

                                                            -- ============================================
                                                            -- BOARD MEMBERS TABLE
                                                            -- ============================================
                                                            CREATE TABLE IF NOT EXISTS board_members (
                                                              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                                                              role TEXT NOT NULL,
                                                              name TEXT NOT NULL,
                                                              company TEXT NOT NULL,
                                                              email TEXT NOT NULL,
                                                              phone TEXT NOT NULL,
                                                              created_at TIMESTAMPTZ DEFAULT NOW(),
                                                              updated_at TIMESTAMPTZ DEFAULT NOW()
                                                            );

                                                            -- ============================================
                                                            -- GUESTS TABLE (Pipeline)
                                                            -- ============================================
                                                            CREATE TABLE IF NOT EXISTS guests (
                                                              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                                                              name TEXT NOT NULL,
                                                              company TEXT NOT NULL,
                                                              industry TEXT,
                                                              invited_by TEXT NOT NULL,
                                                              email TEXT,
                                                              phone TEXT,
                                                              status TEXT NOT NULL DEFAULT 'New Lead' CHECK (status IN (
                                                                'New Lead', 'After Hours Invited', 'After Hours Done',
                                                                'Lunch Invited', 'Lunch Done', 'Application Sent',
                                                                'Application Received', 'Approved', 'Declined'
                                                              )),
                                                              next_step TEXT NOT NULL,
                                                              notes TEXT,
                                                              target_chapter TEXT CHECK (target_chapter IN ('North', 'South', 'Uptown', 'FLOC', 'Alumni')),
                                                              created_at TIMESTAMPTZ DEFAULT NOW(),
                                                              updated_at TIMESTAMPTZ DEFAULT NOW()
                                                            );

                                                            -- ============================================
                                                            -- INDUSTRY CATEGORIES TABLE
                                                            -- ============================================
                                                            CREATE TABLE IF NOT EXISTS industry_categories (
                                                              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                                                              name TEXT NOT NULL UNIQUE,
                                                              display_order INTEGER DEFAULT 0,
                                                              created_at TIMESTAMPTZ DEFAULT NOW()
                                                            );

                                                            -- ============================================
                                                            -- INDUSTRY TARGETS TABLE
                                                            -- ============================================
                                                            CREATE TABLE IF NOT EXISTS industry_targets (
                                                              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                                                              category_id UUID NOT NULL REFERENCES industry_categories(id) ON DELETE CASCADE,
                                                              title TEXT NOT NULL,
                                                              priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
                                                              assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
                                                              notes TEXT,
                                                              created_at TIMESTAMPTZ DEFAULT NOW(),
                                                              updated_at TIMESTAMPTZ DEFAULT NOW()
                                                            );

                                                            -- ============================================
                                                            -- AUTO-CREATE PROFILE ON SIGNUP TRIGGER
                                                            -- ============================================
                                                            CREATE OR REPLACE FUNCTION public.handle_new_user()
                                                            RETURNS TRIGGER AS $$
                                                            BEGIN
                                                              INSERT INTO public.profiles (id, email, full_name, role)
                                                              VALUES (
                                                                NEW.id,
                                                                NEW.email,
                                                                COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
                                                                'member'
                                                              );
                                                              RETURN NEW;
                                                            END;
                                                            $$ LANGUAGE plpgsql SECURITY DEFINER;

                                                            -- Drop trigger if exists and recreate
                                                            DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
                                                            CREATE TRIGGER on_auth_user_created
                                                              AFTER INSERT ON auth.users
                                                              FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

                                                            -- ============================================
                                                            -- UPDATED_AT TRIGGER FUNCTION
                                                            -- ============================================
                                                            CREATE OR REPLACE FUNCTION update_updated_at_column()
                                                            RETURNS TRIGGER AS $$
                                                            BEGIN
                                                              NEW.updated_at = NOW();
                                                              RETURN NEW;
                                                            END;
                                                            $$ LANGUAGE plpgsql;

                                                            -- Apply updated_at triggers
                                                            DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
                                                            CREATE TRIGGER update_profiles_updated_at
                                                              BEFORE UPDATE ON profiles
                                                              FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

                                                            DROP TRIGGER IF EXISTS update_members_updated_at ON members;
                                                            CREATE TRIGGER update_members_updated_at
                                                              BEFORE UPDATE ON members
                                                              FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

                                                            DROP TRIGGER IF EXISTS update_board_members_updated_at ON board_members;
                                                            CREATE TRIGGER update_board_members_updated_at
                                                              BEFORE UPDATE ON board_members
                                                              FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

                                                            DROP TRIGGER IF EXISTS update_guests_updated_at ON guests;
                                                            CREATE TRIGGER update_guests_updated_at
                                                              BEFORE UPDATE ON guests
                                                              FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

                                                            DROP TRIGGER IF EXISTS update_industry_targets_updated_at ON industry_targets;
                                                            CREATE TRIGGER update_industry_targets_updated_at
                                                              BEFORE UPDATE ON industry_targets
                                                              FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

                                                            -- ============================================
                                                            -- ROW LEVEL SECURITY POLICIES
                                                            -- ============================================

                                                            -- Enable RLS on all tables
                                                            ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
                                                            ALTER TABLE members ENABLE ROW LEVEL SECURITY;
                                                            ALTER TABLE board_members ENABLE ROW LEVEL SECURITY;
                                                            ALTER TABLE guests ENABLE ROW LEVEL SECURITY;
                                                            ALTER TABLE industry_categories ENABLE ROW LEVEL SECURITY;
                                                            ALTER TABLE industry_targets ENABLE ROW LEVEL SECURITY;

                                                            -- ============================================
                                                            -- PROFILES POLICIES
                                                            -- ============================================

                                                            -- Everyone authenticated can read profiles
                                                            CREATE POLICY "Profiles are viewable by authenticated users"
                                                            ON profiles FOR SELECT
                                                            TO authenticated
                                                            USING (true);

                                                            -- Users can update their own profile (except role)
                                                            CREATE POLICY "Users can update own profile"
                                                            ON profiles FOR UPDATE
                                                            TO authenticated
                                                            USING (auth.uid() = id)
                                                            WITH CHECK (auth.uid() = id);

                                                            -- Only admins can change roles
                                                            CREATE POLICY "Admins can manage all profiles"
                                                            ON profiles FOR ALL
                                                            TO authenticated
                                                            USING (
                                                              EXISTS (
                                                                SELECT 1 FROM profiles
                                                                WHERE id = auth.uid() AND role = 'admin'
                                                              )
                                                            );

                                                            -- ============================================
                                                            -- MEMBERS POLICIES
                                                            -- ============================================

                                                            -- Everyone authenticated can read members
                                                            CREATE POLICY "Members are viewable by authenticated users"
                                                            ON members FOR SELECT
                                                            TO authenticated
                                                            USING (true);

                                                            -- Admins can do everything
                                                            CREATE POLICY "Admins can manage all members"
                                                            ON members FOR ALL
                                                            TO authenticated
                                                            USING (
                                                              EXISTS (
                                                                SELECT 1 FROM profiles
                                                                WHERE id = auth.uid() AND role = 'admin'
                                                              )
                                                            );

                                                            -- Chapter directors can manage their chapter's members
                                                            CREATE POLICY "Directors can insert members"
                                                            ON members FOR INSERT
                                                            TO authenticated
                                                            WITH CHECK (
                                                              EXISTS (
                                                                SELECT 1 FROM profiles
                                                                WHERE id = auth.uid() AND role = 'chapter_director'
                                                              )
                                                            );

                                                            CREATE POLICY "Directors can update their chapter members"
                                                            ON members FOR UPDATE
                                                            TO authenticated
                                                            USING (
                                                              EXISTS (
                                                                SELECT 1 FROM profiles p
                                                                WHERE p.id = auth.uid()
                                                                AND p.role = 'chapter_director'
                                                                AND p.chapter = members.chapter
                                                              )
                                                            );

                                                            -- ============================================
                                                            -- BOARD MEMBERS POLICIES
                                                            -- ============================================

                                                            -- Everyone authenticated can read board members
                                                            CREATE POLICY "Board members are viewable by authenticated users"
                                                            ON board_members FOR SELECT
                                                            TO authenticated
                                                            USING (true);

                                                            -- Only admins can modify board members
                                                            CREATE POLICY "Only admins can manage board members"
                                                            ON board_members FOR ALL
                                                            TO authenticated
                                                            USING (
                                                              EXISTS (
                                                                SELECT 1 FROM profiles
                                                                WHERE id = auth.uid() AND role = 'admin'
                                                              )
                                                            );

                                                            -- ============================================
                                                            -- GUESTS POLICIES
                                                            -- ============================================

                                                            -- Everyone authenticated can read guests
                                                            CREATE POLICY "Guests are viewable by authenticated users"
                                                            ON guests FOR SELECT
                                                            TO authenticated
                                                            USING (true);

                                                            -- Admins can do everything with guests
                                                            CREATE POLICY "Admins can manage all guests"
                                                            ON guests FOR ALL
                                                            TO authenticated
                                                            USING (
                                                              EXISTS (
                                                                SELECT 1 FROM profiles
                                                                WHERE id = auth.uid() AND role = 'admin'
                                                              )
                                                            );

                                                            -- Chapter directors can add guests
                                                            CREATE POLICY "Directors can insert guests"
                                                            ON guests FOR INSERT
                                                            TO authenticated
                                                            WITH CHECK (
                                                              EXISTS (
                                                                SELECT 1 FROM profiles
                                                                WHERE id = auth.uid() AND role = 'chapter_director'
                                                              )
                                                            );

                                                            -- Chapter directors can update guests (for their chapter or unassigned)
                                                            CREATE POLICY "Directors can update guests"
                                                            ON guests FOR UPDATE
                                                            TO authenticated
                                                            USING (
                                                              EXISTS (
                                                                SELECT 1 FROM profiles p
                                                                WHERE p.id = auth.uid()
                                                                AND p.role = 'chapter_director'
                                                                AND (guests.target_chapter IS NULL OR p.chapter = guests.target_chapter)
                                                              )
                                                            );

                                                            -- ============================================
                                                            -- INDUSTRY CATEGORIES POLICIES
                                                            -- ============================================

                                                            -- Everyone authenticated can read categories
                                                            CREATE POLICY "Categories are viewable by authenticated users"
                                                            ON industry_categories FOR SELECT
                                                            TO authenticated
                                                            USING (true);

                                                            -- Only admins can modify categories
                                                            CREATE POLICY "Only admins can manage categories"
                                                            ON industry_categories FOR ALL
                                                            TO authenticated
                                                            USING (
                                                              EXISTS (
                                                                SELECT 1 FROM profiles
                                                                WHERE id = auth.uid() AND role = 'admin'
                                                              )
                                                            );

                                                            -- ============================================
                                                            -- INDUSTRY TARGETS POLICIES
                                                            -- ============================================

                                                            -- Everyone authenticated can read targets
                                                            CREATE POLICY "Targets are viewable by authenticated users"
                                                            ON industry_targets FOR SELECT
                                                            TO authenticated
                                                            USING (true);

                                                            -- Admins can do everything with targets
                                                            CREATE POLICY "Admins can manage all targets"
                                                            ON industry_targets FOR ALL
                                                            TO authenticated
                                                            USING (
                                                              EXISTS (
                                                                SELECT 1 FROM profiles
                                                                WHERE id = auth.uid() AND role = 'admin'
                                                              )
                                                            );

                                                            -- Chapter directors can assign targets (update only)
                                                            CREATE POLICY "Directors can assign targets"
                                                            ON industry_targets FOR UPDATE
                                                            TO authenticated
                                                            USING (
                                                              EXISTS (
                                                                SELECT 1 FROM profiles
                                                                WHERE id = auth.uid() AND role = 'chapter_director'
                                                              )
                                                            );

                                                            -- ============================================
                                                            -- ENABLE REALTIME
                                                            -- ============================================
                                                            ALTER PUBLICATION supabase_realtime ADD TABLE guests;
                                                            ALTER PUBLICATION supabase_realtime ADD TABLE members;
                                                            ALTER PUBLICATION supabase_realtime ADD TABLE industry_targets;
