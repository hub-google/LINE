-- P0 Work-only follow-up to step 47 (2026-11-17).
-- wm_set_employment_status had the same NULL NOT IN logic problem.
-- A logged-in person from another tenant could reach the employee status update path.
-- Only this existing SECURITY DEFINER function body is changed; no data is modified.
DO $wm_employment_role_guard$
DECLARE
 prior_definition text;
 corrected_definition text;
 pattern constant text := '(v_role)[[:space:]]+NOT[[:space:]]+IN[[:space:]]*([(][^)]*[)])';
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO prior_definition
 FROM pg_proc p
 WHERE p.pronamespace='public'::regnamespace
   AND p.proname='wm_set_employment_status'
   AND p.prokind='f' AND p.prosecdef=true;
 IF prior_definition IS NULL
   OR regexp_count(prior_definition,pattern,1,'i') <> 1
 THEN RAISE EXCEPTION 'Unsafe Workforce employment status role guard missing or changed';
 END IF;
 corrected_definition := regexp_replace(prior_definition,pattern,
   'COALESCE(\1 NOT IN \2, TRUE)','gi');
 IF corrected_definition=prior_definition
 THEN RAISE EXCEPTION 'Employment role guard correction made no change'; END IF;
 EXECUTE corrected_definition;
END
$wm_employment_role_guard$;
