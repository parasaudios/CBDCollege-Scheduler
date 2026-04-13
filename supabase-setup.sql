-- ============================================================
-- CBD College Scheduler - Database Setup
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)
-- All tables/functions/triggers use cbd_ prefix to avoid collisions.
-- ============================================================

-- 1. Profiles table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.cbd_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Staff members table
CREATE TABLE IF NOT EXISTS public.cbd_staff_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    role TEXT DEFAULT '',
    color TEXT NOT NULL DEFAULT '#2563eb',
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Availability/schedule entries
CREATE TABLE IF NOT EXISTS public.cbd_availability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES public.cbd_staff_members(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('available', 'partial', 'unavailable')),
    start_time TIME,
    end_time TIME,
    students INTEGER DEFAULT 0,
    note TEXT DEFAULT '',
    created_by UUID REFERENCES auth.users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(staff_id, date)
);

-- 4. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_cbd_availability_staff_date ON public.cbd_availability(staff_id, date);
CREATE INDEX IF NOT EXISTS idx_cbd_availability_date ON public.cbd_availability(date);
CREATE INDEX IF NOT EXISTS idx_cbd_profiles_role ON public.cbd_profiles(role);

-- 5. Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION public.cbd_handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cbd_profiles_updated_at
    BEFORE UPDATE ON public.cbd_profiles
    FOR EACH ROW EXECUTE FUNCTION public.cbd_handle_updated_at();

CREATE TRIGGER cbd_staff_members_updated_at
    BEFORE UPDATE ON public.cbd_staff_members
    FOR EACH ROW EXECUTE FUNCTION public.cbd_handle_updated_at();

CREATE TRIGGER cbd_availability_updated_at
    BEFORE UPDATE ON public.cbd_availability
    FOR EACH ROW EXECUTE FUNCTION public.cbd_handle_updated_at();

-- 6. Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.cbd_handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.cbd_profiles (id, full_name, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        COALESCE(NEW.raw_user_meta_data->>'role', 'staff')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER cbd_on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.cbd_handle_new_user();

-- 7. Helper function to check if user is admin
CREATE OR REPLACE FUNCTION public.cbd_is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.cbd_profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.cbd_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbd_staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbd_availability ENABLE ROW LEVEL SECURITY;

-- PROFILES policies
CREATE POLICY "cbd_profiles_select" ON public.cbd_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "cbd_profiles_update_own" ON public.cbd_profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "cbd_profiles_update_admin" ON public.cbd_profiles FOR UPDATE TO authenticated USING (public.cbd_is_admin());

-- STAFF_MEMBERS policies
CREATE POLICY "cbd_staff_select" ON public.cbd_staff_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "cbd_staff_insert" ON public.cbd_staff_members FOR INSERT TO authenticated WITH CHECK (public.cbd_is_admin());
CREATE POLICY "cbd_staff_update" ON public.cbd_staff_members FOR UPDATE TO authenticated USING (public.cbd_is_admin());
CREATE POLICY "cbd_staff_delete" ON public.cbd_staff_members FOR DELETE TO authenticated USING (public.cbd_is_admin());

-- AVAILABILITY policies
CREATE POLICY "cbd_avail_select" ON public.cbd_availability FOR SELECT TO authenticated USING (true);
CREATE POLICY "cbd_avail_insert" ON public.cbd_availability FOR INSERT TO authenticated WITH CHECK (public.cbd_is_admin());
CREATE POLICY "cbd_avail_update" ON public.cbd_availability FOR UPDATE TO authenticated USING (public.cbd_is_admin());
CREATE POLICY "cbd_avail_delete" ON public.cbd_availability FOR DELETE TO authenticated USING (public.cbd_is_admin());

-- ============================================================
-- DONE! Now create your first admin user via the app's signup.
-- ============================================================
