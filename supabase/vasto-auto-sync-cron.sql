-- ============================================================================
-- Automatic Vasto student sync  (pg_cron + pg_net)
-- ----------------------------------------------------------------------------
-- Runs the `sync-vasto-students` edge function every 30 minutes so the AM/PM
-- class numbers refresh on their own, instead of a trainer having to press the
-- "Sync students" button. Each run pulls the real attendee counts from Vasto
-- for the next 30 days and upserts them into cbd_day_classes.
--
-- HOW TO INSTALL
--   Run this file ONCE in the Supabase dashboard -> SQL Editor (it connects as
--   the `postgres` owner role, which is what pg_cron / Vault need). It is safe
--   to re-run: it updates the stored secret and reschedules the job in place.
--
-- PREREQUISITE
--   The edge-function secret VASTO_SYNC_SECRET must already be set
--   (Dashboard -> Edge Functions -> sync-vasto-students -> Secrets, or
--   `supabase secrets set VASTO_SYNC_SECRET=...`). The value pasted in step 2
--   below MUST match it exactly — that shared secret is how the scheduled call
--   proves to the function that it is allowed to run the sync.
--
--   Do NOT commit the real secret. Paste it only here in the SQL editor.
-- ============================================================================

-- 1. Extensions (no-ops if already enabled on the project).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Store the shared secret in Vault, so it is never written in plaintext into
--    the cron command (which is visible in the cron.job table). Replace the
--    placeholder with the real VASTO_SYNC_SECRET value.
do $$
declare
  v_secret text := 'PASTE_YOUR_VASTO_SYNC_SECRET_HERE';
begin
  if exists (select 1 from vault.secrets where name = 'vasto_sync_secret') then
    perform vault.update_secret(
      (select id from vault.secrets where name = 'vasto_sync_secret'),
      v_secret);
  else
    perform vault.create_secret(v_secret, 'vasto_sync_secret');
  end if;
end $$;

-- 3. (Re)schedule the job. Unschedule any previous copy first so this is idempotent.
select cron.unschedule(jobid) from cron.job where jobname = 'vasto-student-sync';

select cron.schedule(
  'vasto-student-sync',
  '*/30 * * * *',                        -- every 30 minutes (on the hour and half-hour, UTC)
  $job$
    select net.http_post(
      url     := 'https://nqbonrcmbhjutlrpjfpk.supabase.co/functions/v1/sync-vasto-students',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'apikey',        'sb_publishable_tcEDbGTXXRKm0WJnMC6hGw_2YcqJpUc',
        'x-sync-secret', (select decrypted_secret
                            from vault.decrypted_secrets
                           where name = 'vasto_sync_secret')
      ),
      body    := jsonb_build_object('source', 'cron'),
      timeout_milliseconds := 180000     -- Vasto's pages are slow; give the call plenty of time
    );
  $job$
);

-- ---------------------------------------------------------------------------
-- VERIFY / OPERATE (run any of these on their own afterwards)
--
-- Is the job registered and active?
--   select jobid, schedule, jobname, active from cron.job where jobname = 'vasto-student-sync';
--
-- Did the scheduled job fire? (cron side)
--   select jobid, status, return_message, start_time, end_time
--     from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'vasto-student-sync')
--    order by start_time desc limit 10;
--
-- What did the edge function reply to each call? (HTTP side — 200 = ok)
--   select id, status_code, created, left(content, 300) as body
--     from net._http_response order by created desc limit 10;
--
-- Trigger one run right now instead of waiting for the next half-hour:
--   select net.http_post(
--     url := 'https://nqbonrcmbhjutlrpjfpk.supabase.co/functions/v1/sync-vasto-students',
--     headers := jsonb_build_object('Content-Type','application/json',
--       'apikey','sb_publishable_tcEDbGTXXRKm0WJnMC6hGw_2YcqJpUc',
--       'x-sync-secret',(select decrypted_secret from vault.decrypted_secrets where name='vasto_sync_secret')),
--     body := jsonb_build_object('source','manual-test'), timeout_milliseconds := 180000);
--
-- Change the frequency later (e.g. hourly): re-run step 3 with '0 * * * *'.
-- Turn the automatic sync off:
--   select cron.unschedule('vasto-student-sync');
-- ---------------------------------------------------------------------------
