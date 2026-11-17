-- Workforce tenant operational archive, one audited permission boundary.
-- Includes the HR business history previously omitted by ordinary RLS exports.
-- Does NOT return invite secrets, LINE account links or QR challenge secrets.
-- The user must be authenticated and an active owner/HR member of p_tenant.
-- This is a read-only operational export; NOT a transaction-wide DB snapshot.
CREATE OR REPLACE FUNCTION public.wm_archive_table_page(
  p_tenant uuid, p_table text, p_offset integer DEFAULT 0, p_limit integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $workforce_archive$
DECLARE
 v_scope text := 'tenant_id';
 v_order text := 'id';
 v_columns text := '*';
 v_total bigint;
 v_rows jsonb;
BEGIN
 IF (SELECT auth.uid()) IS NULL
   OR COALESCE(wm_private.my_role(p_tenant) NOT IN ('owner','hr'),true)
 THEN
   RAISE EXCEPTION '只有此企業的負責人與人資可匯出企業資料' USING ERRCODE='42501';
 END IF;
 IF p_tenant IS NULL OR p_offset IS NULL OR p_limit IS NULL
    OR p_offset < 0 OR p_offset > 50000 OR p_limit < 1 OR p_limit > 500
 THEN RAISE EXCEPTION '匯出分頁範圍不正確' USING ERRCODE='22023'; END IF;

 -- Constant allowlist; no caller-controlled table or column fragments reach SQL.
 IF p_table IS NULL OR p_table NOT IN (
 'wm_tenants','wm_branches','wm_departments','wm_members',
 'wm_shifts','wm_punches','wm_requests','wm_request_actions',
 'wm_notifications','wm_leave_entitlements','wm_leave_policies',
 'wm_period_closures','wm_period_adjustments',
 'wm_attendance_adjustments','wm_attendance_anomalies','wm_attendance_rules',
 'wm_availability','wm_availability_policies','wm_shift_templates',
 'wm_staffing_requirements','wm_schedule_rules','wm_member_branches',
 'wm_branch_qr_settings','wm_request_documents',
 'wm_leave_amendment_steps','wm_leave_amendments','wm_leave_cancellations',
 'wm_line_deliveries','wm_org_role_audit','wm_request_approval_steps',
 'wm_shift_revisions','wm_audit','wm_qr_uses'
 ) THEN
   RAISE EXCEPTION '不允許匯出此資料表' USING ERRCODE='42501';
 END IF;
 IF p_table='wm_tenants' THEN
   v_scope:='id';v_columns:='id,name,is_demo,created_by,created_at';
 ELSIF p_table='wm_members' THEN
   -- Never leak the private wage column through this archival interface.
   v_columns:='id,tenant_id,branch_id,user_id,display_name,employee_code,role,employment_type,status,created_at,department_id,reports_to,job_title,hired_on,left_on,skills';
 END IF;
 IF p_table IN ('wm_attendance_rules','wm_availability_policies','wm_schedule_rules')
 THEN v_order:='tenant_id';
 ELSIF p_table='wm_branch_qr_settings' THEN v_order:='branch_id';
 ELSIF p_table='wm_qr_uses' THEN v_order:='challenge_id,member_id';
 END IF;

 EXECUTE format('SELECT count(*) FROM public.%I WHERE %I=$1',p_table,v_scope)
   INTO v_total USING p_tenant;
 EXECUTE format(
  'SELECT coalesce(jsonb_agg(to_jsonb(page)),''[]''::jsonb) FROM
    (SELECT %s FROM public.%I WHERE %I=$1 ORDER BY %s LIMIT $2 OFFSET $3) page',
  v_columns,p_table,v_scope,v_order
 ) INTO v_rows USING p_tenant,p_limit,p_offset;
 RETURN jsonb_build_object('tenant_id',p_tenant,'table',p_table,
   'offset',p_offset,'limit',p_limit,'total_count',v_total,
   'rows',coalesce(v_rows,'[]'::jsonb));
END
$workforce_archive$;
REVOKE ALL ON FUNCTION public.wm_archive_table_page(uuid,text,integer,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wm_archive_table_page(uuid,text,integer,integer)
 TO authenticated;
