-- ============================================================================
-- Enable live (realtime) updates for class numbers, roster and staff.
-- ----------------------------------------------------------------------------
-- The web app ALREADY subscribes to realtime changes on these tables (see
-- setupRealtime() in index.html). It just never receives anything because the
-- tables were never added to the `supabase_realtime` publication — only the
-- notification tables were (see supabase-notifications-setup.sql).
--
-- Adding them here makes an already-open page update itself the instant a row
-- changes — e.g. when the 30-minute Vasto sync writes new AM/PM numbers, or when
-- another trainer edits a day — with no code change and no manual refresh.
--
-- Run this ONCE in the Supabase dashboard -> SQL Editor. Idempotent: re-running
-- is a no-op for tables already in the publication.
-- ============================================================================

do $$
begin
  -- Student numbers / class times (answers "why don't the numbers update live")
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and schemaname='public' and tablename='cbd_day_classes') then
    alter publication supabase_realtime add table public.cbd_day_classes;
  end if;

  -- Roster (who's on each day). The app already listens; enable so roster edits go live too.
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and schemaname='public' and tablename='cbd_availability') then
    alter publication supabase_realtime add table public.cbd_availability;
  end if;

  -- Staff list (names, colours, priorities). Same — the app already listens.
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and schemaname='public' and tablename='cbd_staff_members') then
    alter publication supabase_realtime add table public.cbd_staff_members;
  end if;
end $$;

-- Verify what's now streaming live:
--   select tablename from pg_publication_tables
--    where pubname='supabase_realtime' and schemaname='public' order by tablename;
-- You should see cbd_day_classes, cbd_availability and cbd_staff_members listed
-- alongside the cbd_notifications* / cbd_assistant_availability tables.
