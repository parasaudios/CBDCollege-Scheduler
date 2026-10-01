-- ============================================================
-- CBD College Scheduler — native (Expo) push tokens
-- ------------------------------------------------------------
-- Backs the mobile app's OS push notifications. Each row is one device's Expo
-- push token for a signed-in user. The send-native-push edge function reads this
-- table (via the service role) to deliver notifications.
--
-- Safe to run more than once.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cbd_expo_push_tokens (
    token TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    platform TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cbd_expo_push_tokens_user ON public.cbd_expo_push_tokens(user_id);

ALTER TABLE public.cbd_expo_push_tokens ENABLE ROW LEVEL SECURITY;

-- Each user manages only their own device tokens. (The edge function uses the
-- service role, which bypasses RLS, to read everyone's tokens when sending.)
DROP POLICY IF EXISTS "cbd_expo_push_manage_own" ON public.cbd_expo_push_tokens;
CREATE POLICY "cbd_expo_push_manage_own" ON public.cbd_expo_push_tokens
    FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- ============================================================
-- DONE. Next: deploy the function:
--   supabase functions deploy send-native-push --project-ref nqbonrcmbhjutlrpjfpk
-- ============================================================
