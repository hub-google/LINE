-- Work 2026-11-17: Consolidated archive is deployed on main test site.
-- Retire the superseded notifications-only RPC so there is a single read-only
-- owner/HR archive authority (wm_archive_table_page). Cloudflare release never
-- called the obsolete function. No data rows or other product schema are touched.
DO $archive_cleanup$
BEGIN
 IF to_regprocedure('public.wm_archive_table_page(uuid,text,integer,integer)') IS NULL THEN
  RAISE EXCEPTION 'Unified Workforce archive gateway is missing, refusing to remove legacy RPC';
 END IF;
 IF to_regprocedure('public.wm_export_notification_archive(uuid,integer,integer)') IS NULL THEN
  RAISE EXCEPTION 'Obsolete Workforce notifications archive is already absent; inspect migration order';
 END IF;
END $archive_cleanup$;
DROP FUNCTION public.wm_export_notification_archive(uuid,integer,integer);
