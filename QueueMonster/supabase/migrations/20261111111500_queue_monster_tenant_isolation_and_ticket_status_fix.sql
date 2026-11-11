-- Queue Monster security hardening, 2026-11-11.
-- Fix tenant-scoped authorization on eleven existing SECURITY DEFINER functions
-- without replacing unrelated function bodies changed by concurrent work.
-- Keep existing privileges, SQL signatures, and business rules intact.
-- Fail closed if an unexpected concurrent function edit changes any expected guard.
-- Also prevent duplicate customer queue tickets for every active queue status.
DO $queue_monster_tenant_security$
DECLARE
  v_change record;
  v_oid oid;
  v_definition text;
BEGIN
  FOR v_change IN
    SELECT * FROM (VALUES
      ('so_invite_staff', 'IF NOT private.so_platform() AND v_role NOT IN (''OWNER'',''MANAGER'') THEN', 'IF NOT coalesce(private.so_platform(),false) AND coalesce(v_role,'''') NOT IN (''OWNER'',''MANAGER'') THEN'),
      ('so_update_tenant', 'if not v_admin and v_role not in (''OWNER'',''MANAGER'') then', 'if not coalesce(v_admin,false) and coalesce(v_role,'''') not in (''OWNER'',''MANAGER'') then'),
      ('so_update_tenant', 'if not v_admin and (p_patch ?', 'if not coalesce(v_admin,false) and (p_patch ?'),
      ('so_save_announcement', 'private.so_role(v_tenant) not in(''OWNER'',''MANAGER'')', 'coalesce(private.so_role(v_tenant),'''') not in(''OWNER'',''MANAGER'')'),
      ('so_set_announcement_active', 'private.so_role(v_tenant) not in(''OWNER'',''MANAGER'')', 'coalesce(private.so_role(v_tenant),'''') not in(''OWNER'',''MANAGER'')'),
      ('so_set_booking_policy', 'private.so_role(t.id) not in(''OWNER'',''MANAGER'')', 'coalesce(private.so_role(t.id),'''') not in(''OWNER'',''MANAGER'')'),
      ('so_set_booking_confirmation', 'private.so_role(v_tenant.id) not in (''OWNER'',''MANAGER'')', 'coalesce(private.so_role(v_tenant.id),'''') not in (''OWNER'',''MANAGER'')'),
      ('so_set_customer_homepage', 'private.so_role(t.id) not in (''OWNER'',''MANAGER'')', 'coalesce(private.so_role(t.id),'''') not in (''OWNER'',''MANAGER'')'),
      ('so_staff_set_customer_flag', 'private.so_role(v_tenant) not in (''OWNER'',''MANAGER'')', 'coalesce(private.so_role(v_tenant),'''') not in (''OWNER'',''MANAGER'')'),
      ('so_staff_analytics', 'private.so_role(t.id) not in (''OWNER'',''MANAGER'')', 'coalesce(private.so_role(t.id),'''') not in (''OWNER'',''MANAGER'')'),
      ('so_line_notice_health', 'private.so_role(t.id) not in (''OWNER'',''MANAGER'')', 'coalesce(private.so_role(t.id),'''') not in (''OWNER'',''MANAGER'')'),
      ('so_take_number_with_items', 'status in(''WAITING'',''CALLED'',''SERVING'')', 'status in(''WAITING'',''HOLD'',''CALLED'',''ARRIVED'',''ADMITTED'',''SERVING'')')
    ) AS changes(function_name, unsafe_condition, fixed_condition)
  LOOP
    SELECT p.oid, pg_get_functiondef(p.oid)
      INTO v_oid, v_definition
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_change.function_name;
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'Security migration: missing RPC %', v_change.function_name;
    END IF;
    IF position(v_change.fixed_condition IN v_definition) > 0 THEN
      CONTINUE; -- Allow safe reapplication after an already-applied fix.
    END IF;
    IF position(v_change.unsafe_condition IN v_definition) = 0
       OR length(v_definition) - length(replace(v_definition, v_change.unsafe_condition, ''))
           <> length(v_change.unsafe_condition) THEN
      RAISE EXCEPTION 'Security migration: unexpected concurrent change in %', v_change.function_name;
    END IF;
    EXECUTE replace(v_definition, v_change.unsafe_condition, v_change.fixed_condition);
  END LOOP;
END
$queue_monster_tenant_security$;
