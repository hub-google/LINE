
-- Hierarchical workforce access; each reporting relationship is tenant-local.
ALTER TABLE public.wm_members
  ADD COLUMN IF NOT EXISTS reports_to uuid,
  ADD COLUMN IF NOT EXISTS job_title text NOT NULL DEFAULT '';
ALTER TABLE public.wm_members
  ADD CONSTRAINT wm_member_supervisor_same_tenant FOREIGN KEY(tenant_id,reports_to)
  REFERENCES public.wm_members(tenant_id,id) DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX IF NOT EXISTS wm_members_reporting_idx ON public.wm_members(tenant_id,reports_to);
CREATE INDEX IF NOT EXISTS wm_members_auth_tenant_idx ON public.wm_members(user_id,tenant_id) WHERE status='active';

CREATE OR REPLACE FUNCTION wm_private.validate_member_hierarchy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE parent_role text;
BEGIN
  IF NEW.reports_to IS NULL THEN RETURN NEW; END IF;
  IF NEW.id=NEW.reports_to THEN RAISE EXCEPTION '不可將自己設定為自己的主管'; END IF;
  SELECT role INTO parent_role FROM public.wm_members
  WHERE id=NEW.reports_to AND tenant_id=NEW.tenant_id AND status='active';
  IF parent_role IS NULL OR parent_role NOT IN ('owner','hr','manager') THEN
    RAISE EXCEPTION '主管必須為同企業的有效管理角色';
  END IF;
  IF NEW.role='owner' THEN RAISE EXCEPTION '企業擁有者不可設定上級'; END IF;
  IF EXISTS(
    WITH RECURSIVE chain(id,reports_to,depth) AS (
      SELECT m.id,m.reports_to,1 FROM public.wm_members m
      WHERE m.id=NEW.reports_to AND m.tenant_id=NEW.tenant_id
      UNION ALL
      SELECT m.id,m.reports_to,c.depth+1
      FROM chain c JOIN public.wm_members m ON m.id=c.reports_to AND m.tenant_id=NEW.tenant_id
      WHERE c.depth<64
    )
    SELECT 1 FROM chain WHERE id=NEW.id
  ) THEN RAISE EXCEPTION '主管關係不可形成循環'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS wm_member_hierarchy_guard ON public.wm_members;
CREATE TRIGGER wm_member_hierarchy_guard BEFORE INSERT OR UPDATE OF reports_to,role,tenant_id,status
ON public.wm_members FOR EACH ROW EXECUTE FUNCTION wm_private.validate_member_hierarchy();

-- The private predicate uses server-derived identity and cannot be called from the exposed REST schema.
CREATE OR REPLACE FUNCTION wm_private.is_org_descendant(p_tenant uuid,p_member uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  WITH RECURSIVE descendants(id,visited) AS (
    SELECT m.id,ARRAY[m.id]
    FROM public.wm_members m
    WHERE m.tenant_id=p_tenant AND m.user_id=(SELECT auth.uid())
      AND m.role='manager' AND m.status='active'
    UNION ALL
    SELECT c.id,d.visited||c.id
    FROM descendants d JOIN public.wm_members c ON c.reports_to=d.id
      AND c.tenant_id=p_tenant AND c.status='active'
    WHERE NOT c.id=ANY(d.visited) AND cardinality(d.visited)<64
  )
  SELECT EXISTS(SELECT 1 FROM descendants WHERE id=p_member
    AND id NOT IN (SELECT m.id FROM public.wm_members m
      WHERE m.user_id=(SELECT auth.uid()) AND m.tenant_id=p_tenant));
$$;
REVOKE ALL ON FUNCTION wm_private.is_org_descendant(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION wm_private.is_org_descendant(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION wm_private.member_visible(p_tenant uuid,p_member uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT
    COALESCE(wm_private.my_role(p_tenant) IN ('owner','hr'),false)
    OR EXISTS(
      SELECT 1 FROM public.wm_members m
      WHERE m.id=p_member AND m.tenant_id=p_tenant AND m.user_id=(SELECT auth.uid()) AND m.status='active'
    )
    OR wm_private.is_org_descendant(p_tenant,p_member);
$$;

CREATE OR REPLACE FUNCTION wm_private.can_approve_member(p_tenant uuid,p_member uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(
     SELECT 1 FROM public.wm_members target
     WHERE target.tenant_id=p_tenant AND target.id=p_member AND target.status='active'
       AND target.user_id IS DISTINCT FROM (SELECT auth.uid())
  ) AND (
    COALESCE(wm_private.my_role(p_tenant) IN ('owner','hr'),false)
    OR wm_private.is_org_descendant(p_tenant,p_member)
  );
$$;
REVOKE ALL ON FUNCTION wm_private.can_approve_member(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION wm_private.can_approve_member(uuid,uuid) TO authenticated;

-- Existing RPC retains its leave balance, audit and notification logic, but reviewer is scope-checked.
CREATE OR REPLACE FUNCTION wm_private.guard_hierarchy_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE demo boolean;
BEGIN
 IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
 SELECT is_demo INTO demo FROM public.wm_tenants WHERE id=NEW.tenant_id;
 IF COALESCE(demo,false) THEN RETURN NEW; END IF;
 IF NEW.status IN ('approved','rejected') AND NOT wm_private.can_approve_member(NEW.tenant_id,NEW.member_id) THEN
    RAISE EXCEPTION '僅能審核自己管理範圍內的員工，且不可審核自己的申請';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS wm_hierarchy_review_guard ON public.wm_requests;
CREATE TRIGGER wm_hierarchy_review_guard BEFORE UPDATE OF status
ON public.wm_requests FOR EACH ROW EXECUTE FUNCTION wm_private.guard_hierarchy_review();

-- Server-side resource-level restrictions. Manager sees and edits only own branch of the reporting tree.
DROP POLICY IF EXISTS wm_shift_create ON public.wm_shifts;
CREATE POLICY wm_shift_create ON public.wm_shifts FOR INSERT TO authenticated
WITH CHECK (wm_private.can_manage(tenant_id)
  AND wm_private.member_visible(tenant_id,member_id)
  AND created_by=(SELECT auth.uid()));
DROP POLICY IF EXISTS wm_shift_update ON public.wm_shifts;
CREATE POLICY wm_shift_update ON public.wm_shifts FOR UPDATE TO authenticated
USING (wm_private.can_manage(tenant_id) AND wm_private.member_visible(tenant_id,member_id))
WITH CHECK (wm_private.can_manage(tenant_id) AND wm_private.member_visible(tenant_id,member_id));
DROP POLICY IF EXISTS wm_shift_delete ON public.wm_shifts;
CREATE POLICY wm_shift_delete ON public.wm_shifts FOR DELETE TO authenticated
USING (status='draft' AND wm_private.can_manage(tenant_id) AND wm_private.member_visible(tenant_id,member_id));
DROP POLICY IF EXISTS wm_entitlement_write ON public.wm_leave_entitlements;
CREATE POLICY wm_entitlement_write ON public.wm_leave_entitlements FOR INSERT TO authenticated
WITH CHECK (wm_private.can_manage(tenant_id) AND wm_private.member_visible(tenant_id,member_id));
DROP POLICY IF EXISTS wm_entitlement_update ON public.wm_leave_entitlements;
CREATE POLICY wm_entitlement_update ON public.wm_leave_entitlements FOR UPDATE TO authenticated
USING (wm_private.can_manage(tenant_id) AND wm_private.member_visible(tenant_id,member_id))
WITH CHECK (wm_private.can_manage(tenant_id) AND wm_private.member_visible(tenant_id,member_id));
DROP POLICY IF EXISTS wm_branch_create ON public.wm_branches;
CREATE POLICY wm_branch_create ON public.wm_branches FOR INSERT TO authenticated
WITH CHECK (COALESCE(wm_private.my_role(tenant_id) IN ('owner','hr'),false));
DROP POLICY IF EXISTS wm_branch_update ON public.wm_branches;
CREATE POLICY wm_branch_update ON public.wm_branches FOR UPDATE TO authenticated
USING (COALESCE(wm_private.my_role(tenant_id) IN ('owner','hr'),false))
WITH CHECK (COALESCE(wm_private.my_role(tenant_id) IN ('owner','hr'),false));
DROP POLICY IF EXISTS wm_departments_manage ON public.wm_departments;
CREATE POLICY wm_departments_admin_insert ON public.wm_departments FOR INSERT TO authenticated
WITH CHECK (COALESCE(wm_private.my_role(tenant_id) IN ('owner','hr'),false));
CREATE POLICY wm_departments_admin_update ON public.wm_departments FOR UPDATE TO authenticated
USING (COALESCE(wm_private.my_role(tenant_id) IN ('owner','hr'),false))
WITH CHECK (COALESCE(wm_private.my_role(tenant_id) IN ('owner','hr'),false));
CREATE POLICY wm_departments_admin_delete ON public.wm_departments FOR DELETE TO authenticated
USING (COALESCE(wm_private.my_role(tenant_id) IN ('owner','hr'),false));
DROP POLICY IF EXISTS wm_audit_read ON public.wm_audit;
CREATE POLICY wm_audit_read ON public.wm_audit FOR SELECT TO authenticated
USING (COALESCE(wm_private.my_role(tenant_id) IN ('owner','hr'),false));
DROP POLICY IF EXISTS wm_availability_delete ON public.wm_availability;
CREATE POLICY wm_availability_delete ON public.wm_availability FOR DELETE TO authenticated
USING (wm_private.member_visible(tenant_id,member_id));
