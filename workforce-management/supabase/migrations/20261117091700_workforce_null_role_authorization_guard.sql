-- P0 Workforce-only authorization correction, 2026-11-17.
-- Original SECURITY DEFINER RPC checks like:
--   IF auth.uid() IS NULL OR wm_private.my_role(p_tenant) NOT IN ('owner','hr')
-- incorrectly let a logged-in nonmember through because NULL NOT IN (...) is NULL,
-- and a PL/pgSQL IF only enters its branch for TRUE.
-- A similar flaw allows an unauthorised worker to query wm_staff_wages for another tenant.
--
-- This migration changes ONLY the 13 explicitly named public.wm_* SECURITY DEFINER
-- functions below. Existing signatures, function bodies, grants, owners and search_path
-- are otherwise preserved. No rows or other project schemas/tables are modified.
-- It deliberately refuses to proceed if the expected prior function state drifts.
DO $workforce_role_guard$
DECLARE
  target_name text;
  prior_definition text;
  corrected_definition text;
  matching_functions integer;
  matching_guards integer;
  corrected_count integer := 0;
  role_guard_pattern constant text :=
    '(wm_private[.]my_role[(][A-Za-z0-9_.]+[)]|v_role|a_role)[[:space:]]+NOT[[:space:]]+IN[[:space:]]*([(][^)]*[)])';
BEGIN
  FOREACH target_name IN ARRAY ARRAY[
    'wm_adjust_closed_month',
    'wm_close_month',
    'wm_grant_leave_hours',
    'wm_line_delivery_status',
    'wm_month_report',
    'wm_org_invite',
    'wm_org_set_member',
    'wm_save_attendance_rule',
    'wm_save_leave_policy',
    'wm_save_qr_setting',
    'wm_save_schedule_rules',
    'wm_set_availability_policy',
    'wm_staff_wages'
  ]
  LOOP
    SELECT count(*),max(pg_get_functiondef(p.oid))
      INTO matching_functions,prior_definition
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname = target_name
      AND p.prokind = 'f'
      AND p.prosecdef = true;

    IF matching_functions <> 1 THEN
      RAISE EXCEPTION 'Workforce role guard drift in %: expected one SECURITY DEFINER function, found %',
        target_name,matching_functions;
    END IF;

    matching_guards := regexp_count(prior_definition,role_guard_pattern,1,'i');
    IF matching_guards <> 1 THEN
      RAISE EXCEPTION 'Workforce role guard drift in %: expected exactly one unsafe guard, found %',
        target_name,matching_guards;
    END IF;

    corrected_definition := regexp_replace(prior_definition,role_guard_pattern,
      'COALESCE(\1 NOT IN \2, TRUE)','gi');

    IF corrected_definition = prior_definition THEN
      RAISE EXCEPTION 'Workforce role guard replacement failed for %',target_name;
    END IF;

    EXECUTE corrected_definition;
    corrected_count := corrected_count + 1;
  END LOOP;

  IF corrected_count <> 13 THEN
    RAISE EXCEPTION 'Workforce role guard expected 13 corrections, got %',corrected_count;
  END IF;
  RAISE NOTICE 'Workforce role guards fixed: % SECURITY DEFINER functions',corrected_count;
END
$workforce_role_guard$;
