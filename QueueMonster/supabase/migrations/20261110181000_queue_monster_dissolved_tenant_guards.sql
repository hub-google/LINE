-- Additional guardrails: never attach members/invites to a dissolved tenant.
CREATE OR REPLACE FUNCTION private.so_guard_membership_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $guard$
DECLARE v_status text;
BEGIN
 SELECT status INTO v_status FROM public.so_tenants WHERE id=NEW.tenant_id;
 IF v_status='DISSOLVED' THEN
   RAISE EXCEPTION '已解散店家不能新增成員' USING errcode='23514';
 END IF;
 IF v_status='ACTIVE' AND NEW.role='STAFF' AND NOT EXISTS(
   SELECT 1 FROM public.so_members WHERE tenant_id=NEW.tenant_id
    AND role IN ('OWNER','MANAGER')
 ) THEN
   RAISE EXCEPTION '店家必須先指定至少一位管理者' USING errcode='23514';
 END IF;
 RETURN NEW;
END $guard$;
DROP TRIGGER IF EXISTS so_guard_membership_insert ON public.so_members;
CREATE TRIGGER so_guard_membership_insert
BEFORE INSERT ON public.so_members FOR EACH ROW
EXECUTE FUNCTION private.so_guard_membership_insert();

CREATE OR REPLACE FUNCTION private.so_guard_dissolved_invite()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $guard$
BEGIN
 IF EXISTS(SELECT 1 FROM public.so_tenants
   WHERE id=NEW.tenant_id AND status='DISSOLVED') THEN
    RAISE EXCEPTION '已解散店家不能發送新邀請' USING errcode='23514';
 END IF;
 RETURN NEW;
END $guard$;
DROP TRIGGER IF EXISTS so_guard_dissolved_invite ON public.so_invites;
CREATE TRIGGER so_guard_dissolved_invite
BEFORE INSERT OR UPDATE OF tenant_id ON public.so_invites
FOR EACH ROW EXECUTE FUNCTION private.so_guard_dissolved_invite();

CREATE OR REPLACE FUNCTION private.so_guard_dissolved_tenant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $guard$
BEGIN
 IF OLD.status='DISSOLVED' AND NEW.status<>'DISSOLVED' THEN
   RAISE EXCEPTION '已解散店家不可重新開通' USING errcode='23514';
 END IF;
 IF NEW.status='ACTIVE' AND OLD.status IS DISTINCT FROM 'ACTIVE'
   AND NOT EXISTS(SELECT 1 FROM public.so_members
     WHERE tenant_id=OLD.id AND role IN ('OWNER','MANAGER'))
 THEN RAISE EXCEPTION '店家至少需有一位管理者才能開通' USING errcode='23514';
 END IF;
 RETURN NEW;
END $guard$;
