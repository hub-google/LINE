-- Queue Monster: new email-invited staff must set and verify a password
-- before gaining any role-controlled merchant operation.
-- The readiness bit lives in auth.users.raw_app_meta_data, writable only by trusted Auth admin.
-- This predicate affects ONLY Queue Monster users created by an Auth invitation.
CREATE OR REPLACE FUNCTION private.so_role(p_tenant uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
 SELECT m.role
 FROM public.so_members AS m
 JOIN auth.users AS u ON u.id=m.user_id
 WHERE m.tenant_id=p_tenant
   AND m.user_id=auth.uid()
   AND (
     u.invited_at IS NULL
     OR u.raw_user_meta_data->>'app' IS DISTINCT FROM 'queue-monster'
     OR u.raw_app_meta_data->>'queue_monster_password_ready'='true'
   )
$function$;
