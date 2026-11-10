-- A user's user_metadata is editable; NEVER authorize staff access using it.
-- Promote existing Queue Monster Auth-invitation identities into server-owned
-- app_metadata, keeping all existing provider and application keys intact.
UPDATE auth.users u
SET raw_app_meta_data=jsonb_set(
     coalesce(u.raw_app_meta_data,'{}'::jsonb),
     '{queue_monster_invited}','true'::jsonb,true
   )
WHERE u.invited_at IS NOT NULL
 AND u.raw_user_meta_data->>'app'='queue-monster'
 AND u.raw_app_meta_data->>'queue_monster_invited' IS DISTINCT FROM 'true';

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
     u.raw_app_meta_data->>'queue_monster_invited' IS DISTINCT FROM 'true'
     OR u.raw_app_meta_data->>'queue_monster_password_ready'='true'
   )
$function$;

CREATE OR REPLACE FUNCTION public.so_accept_invite(p_invite_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
 i public.so_invites;
 v_email text;
 v_user uuid := auth.uid();
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION '請先登入'; END IF;
 SELECT lower(email) INTO v_email FROM auth.users
  WHERE id=v_user AND email_confirmed_at IS NOT NULL;
 IF v_email IS NULL THEN RAISE EXCEPTION '請先完成電子郵件驗證'; END IF;
 IF EXISTS (
   SELECT 1 FROM auth.users u WHERE u.id=v_user
     AND u.raw_app_meta_data->>'queue_monster_invited'='true'
     AND u.raw_app_meta_data->>'queue_monster_password_ready' IS DISTINCT FROM 'true'
 ) THEN RAISE EXCEPTION '請先設定並確認登入密碼，再接受企業邀請' USING errcode='42501';
 END IF;
 SELECT * INTO i FROM public.so_invites
  WHERE id=p_invite_id AND accepted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR lower(i.email)<>v_email
  THEN RAISE EXCEPTION '邀請不存在或登入電子郵件不一致' USING errcode='42501';
 END IF;
 INSERT INTO public.so_members(tenant_id,user_id,role)
  VALUES(i.tenant_id,v_user,i.role)
  ON CONFLICT(tenant_id,user_id) DO UPDATE SET role=excluded.role;
 UPDATE public.so_invites SET accepted_by=v_user,accepted_at=now()
  WHERE id=i.id;
 RETURN jsonb_build_object('accepted',true);
END
$function$;
