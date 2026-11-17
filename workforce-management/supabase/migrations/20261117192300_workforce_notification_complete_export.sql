-- Workforce HR-OPS: complete tenant notification archive without weakening inbox RLS.
-- Everyday wm_notifications SELECT remains recipient-scoped.
-- Only an authenticated active tenant owner/HR may invoke this read-only paged RPC.
-- No token, password or other-tenant data returned. Never grant to PUBLIC or anon.
CREATE OR REPLACE FUNCTION public.wm_export_notification_archive(
  p_tenant uuid,
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $workforce_notification_archive$
DECLARE
  v_total bigint;
  v_rows jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR
     COALESCE(wm_private.my_role(p_tenant) NOT IN ('owner','hr'), TRUE)
  THEN
    RAISE EXCEPTION '只有目前企業的負責人或人資可匯出完整通知'
      USING ERRCODE='42501';
  END IF;

  IF p_tenant IS NULL OR p_offset IS NULL OR p_offset < 0 OR p_offset > 50000
     OR p_limit IS NULL OR p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION '通知匯出分頁參數不正確'
      USING ERRCODE='22023';
  END IF;

  SELECT count(*) INTO v_total
  FROM public.wm_notifications n WHERE n.tenant_id=p_tenant;
  -- Explicitly list non-secret columns. Stable ordering prevents offset ambiguity.
  SELECT COALESCE(jsonb_agg(to_jsonb(n) ORDER BY n.created_at,n.id),'[]'::jsonb)
  INTO v_rows
  FROM (
     SELECT id,tenant_id,recipient_member_id,event_key,title,body,created_at,read_at
     FROM public.wm_notifications
     WHERE tenant_id=p_tenant
     ORDER BY created_at,id
     LIMIT p_limit OFFSET p_offset
  ) n;

  RETURN jsonb_build_object(
    'tenant_id',p_tenant,'offset',p_offset,'limit',p_limit,
    'total_count',v_total,'rows',v_rows
  );
END;
$workforce_notification_archive$;

REVOKE ALL ON FUNCTION public.wm_export_notification_archive(uuid,integer,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wm_export_notification_archive(uuid,integer,integer)
  TO authenticated;
