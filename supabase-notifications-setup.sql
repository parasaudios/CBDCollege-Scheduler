-- ============================================================
-- CBD College Scheduler - Notifications & Availability schema
-- ------------------------------------------------------------
-- Companion to supabase-setup.sql. These tables back the in-app bell,
-- Web Push, read receipts and assistant self-declared availability. They
-- were originally added to the live project out of band, so this file
-- documents them AND enables the assistant -> trainer notifications that
-- the app now sends when an assistant edits their own availability.
--
-- Safe to run more than once: tables use IF NOT EXISTS and every policy is
-- dropped-if-exists before being (re)created. Running it will NOT drop or
-- clear any data.
-- ============================================================

-- 1. Notifications (one row per recipient; target_user_id NULL = broadcast)
CREATE TABLE IF NOT EXISTS public.cbd_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    data JSONB NOT NULL DEFAULT '{}',
    target_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cbd_notifications_target ON public.cbd_notifications(target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cbd_notifications_created ON public.cbd_notifications(created_at DESC);

-- 2. Read receipts (one row per user per notification)
CREATE TABLE IF NOT EXISTS public.cbd_notification_reads (
    notification_id UUID NOT NULL REFERENCES public.cbd_notifications(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (notification_id, user_id)
);

-- 3. Web Push subscriptions (one row per browser/device endpoint)
CREATE TABLE IF NOT EXISTS public.cbd_push_subscriptions (
    endpoint TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cbd_push_subscriptions_user ON public.cbd_push_subscriptions(user_id);

-- 4. Assistant self-declared availability (per-date override of the weekly pattern)
CREATE TABLE IF NOT EXISTS public.cbd_assistant_availability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    is_available BOOLEAN NOT NULL DEFAULT true,
    note TEXT DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, date)
);
CREATE INDEX IF NOT EXISTS idx_cbd_assistant_availability_date ON public.cbd_assistant_availability(date);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.cbd_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbd_notification_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbd_push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbd_assistant_availability ENABLE ROW LEVEL SECURITY;

-- Helper: is the current user a trainer? (role lives on cbd_profiles)
CREATE OR REPLACE FUNCTION public.cbd_is_trainer()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.cbd_profiles
        WHERE id = auth.uid() AND role = 'trainer'
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- NOTIFICATIONS ------------------------------------------------
-- Read: trainers see everything (oversight); everyone else sees only broadcasts
-- and notifications targeted at them. (The app also filters client-side.)
DROP POLICY IF EXISTS "cbd_notif_select" ON public.cbd_notifications;
CREATE POLICY "cbd_notif_select" ON public.cbd_notifications
    FOR SELECT TO authenticated
    USING (
        target_user_id = auth.uid()
        OR target_user_id IS NULL
        OR public.cbd_is_trainer()
    );

-- Insert: any signed-in user may raise a notification. This is what lets an
-- assistant's self-service availability change notify the trainers. It mirrors
-- the app's existing trust model (the client decides what to send); tighten
-- here if you later want to constrain who/what can be inserted.
DROP POLICY IF EXISTS "cbd_notif_insert" ON public.cbd_notifications;
CREATE POLICY "cbd_notif_insert" ON public.cbd_notifications
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- READ RECEIPTS -----------------------------------------------
DROP POLICY IF EXISTS "cbd_notif_reads_select_own" ON public.cbd_notification_reads;
CREATE POLICY "cbd_notif_reads_select_own" ON public.cbd_notification_reads
    FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "cbd_notif_reads_insert_own" ON public.cbd_notification_reads;
CREATE POLICY "cbd_notif_reads_insert_own" ON public.cbd_notification_reads
    FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "cbd_notif_reads_update_own" ON public.cbd_notification_reads;
CREATE POLICY "cbd_notif_reads_update_own" ON public.cbd_notification_reads
    FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- PUSH SUBSCRIPTIONS ------------------------------------------
DROP POLICY IF EXISTS "cbd_push_manage_own" ON public.cbd_push_subscriptions;
CREATE POLICY "cbd_push_manage_own" ON public.cbd_push_subscriptions
    FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ASSISTANT AVAILABILITY --------------------------------------
-- Everyone signed in can read (trainers plan around it; assistants see their own).
DROP POLICY IF EXISTS "cbd_assist_avail_select" ON public.cbd_assistant_availability;
CREATE POLICY "cbd_assist_avail_select" ON public.cbd_assistant_availability
    FOR SELECT TO authenticated USING (true);
-- Assistants edit their own days; trainers may edit anyone's.
DROP POLICY IF EXISTS "cbd_assist_avail_write" ON public.cbd_assistant_availability;
CREATE POLICY "cbd_assist_avail_write" ON public.cbd_assistant_availability
    FOR ALL TO authenticated
    USING (user_id = auth.uid() OR public.cbd_is_trainer())
    WITH CHECK (user_id = auth.uid() OR public.cbd_is_trainer());

-- ============================================================
-- DONE. If cbd_notifications previously had no INSERT policy for
-- assistants, this file adds it, enabling assistant -> trainer alerts.
-- ============================================================
