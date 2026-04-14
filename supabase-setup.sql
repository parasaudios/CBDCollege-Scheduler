-- ============================================================
-- CBD College Scheduler - Database Setup
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)
-- All tables/functions/triggers use cbd_ prefix to avoid collisions.
-- ============================================================

-- 1. Profiles table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.cbd_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'assistant' CHECK (role IN ('trainer', 'assistant')),
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
    -- Only create CBD profiles for CBD app users (not other projects sharing this instance)
    IF NEW.raw_user_meta_data->>'app' = 'cbd' OR NEW.email LIKE '%@cbdcollege.edu.au' THEN
        INSERT INTO public.cbd_profiles (id, full_name, role)
        VALUES (
            NEW.id,
            COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
            COALESCE(NEW.raw_user_meta_data->>'role', 'assistant')
        );
    END IF;
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
-- INPUT VALIDATION CONSTRAINTS
-- ============================================================

ALTER TABLE public.cbd_staff_members ADD CONSTRAINT cbd_staff_name_length CHECK (char_length(name) BETWEEN 1 AND 100);
ALTER TABLE public.cbd_staff_members ADD CONSTRAINT cbd_staff_role_length CHECK (char_length(role) <= 100);
ALTER TABLE public.cbd_staff_members ADD CONSTRAINT cbd_staff_color_format CHECK (color ~ '^#[0-9a-fA-F]{6}$');
ALTER TABLE public.cbd_profiles ADD CONSTRAINT cbd_profiles_name_length CHECK (char_length(full_name) BETWEEN 1 AND 200);
ALTER TABLE public.cbd_availability ADD CONSTRAINT cbd_avail_students_range CHECK (students >= 0 AND students <= 999);
ALTER TABLE public.cbd_availability ADD CONSTRAINT cbd_avail_note_length CHECK (char_length(note) <= 500);
ALTER TABLE public.cbd_availability ADD CONSTRAINT cbd_avail_time_order CHECK (start_time IS NULL OR end_time IS NULL OR start_time < end_time);

-- ============================================================
-- AUDIT LOGGING
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cbd_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL,
    record_id UUID,
    action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    changed_by UUID REFERENCES auth.users(id),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    old_data JSONB,
    new_data JSONB
);

CREATE INDEX IF NOT EXISTS idx_cbd_audit_log_table ON public.cbd_audit_log(table_name, changed_at DESC);

ALTER TABLE public.cbd_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cbd_audit_select" ON public.cbd_audit_log FOR SELECT TO authenticated USING (public.cbd_is_admin());

CREATE OR REPLACE FUNCTION public.cbd_audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO public.cbd_audit_log (table_name, record_id, action, changed_by, old_data)
        VALUES (TG_TABLE_NAME, OLD.id, TG_OP, auth.uid(), to_jsonb(OLD));
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO public.cbd_audit_log (table_name, record_id, action, changed_by, old_data, new_data)
        VALUES (TG_TABLE_NAME, NEW.id, TG_OP, auth.uid(), to_jsonb(OLD), to_jsonb(NEW));
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO public.cbd_audit_log (table_name, record_id, action, changed_by, new_data)
        VALUES (TG_TABLE_NAME, NEW.id, TG_OP, auth.uid(), to_jsonb(NEW));
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER cbd_audit_staff_members
    AFTER INSERT OR UPDATE OR DELETE ON public.cbd_staff_members
    FOR EACH ROW EXECUTE FUNCTION public.cbd_audit_trigger();

CREATE TRIGGER cbd_audit_availability
    AFTER INSERT OR UPDATE OR DELETE ON public.cbd_availability
    FOR EACH ROW EXECUTE FUNCTION public.cbd_audit_trigger();

CREATE TRIGGER cbd_audit_profiles
    AFTER INSERT OR UPDATE OR DELETE ON public.cbd_profiles
    FOR EACH ROW EXECUTE FUNCTION public.cbd_audit_trigger();

-- ============================================================
-- DONE! Now create your first admin user via the app's signup.
-- ============================================================
