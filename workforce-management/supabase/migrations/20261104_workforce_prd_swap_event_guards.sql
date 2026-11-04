
-- HR-SCH-06: reject ghost swap requests and notify the new shift owner.
create or replace function wm_private.require_real_swap_assignment()
returns trigger language plpgsql security definer set search_path='' as $fn$
begin
 if new.kind='swap' and (new.source_shift_id is null or new.target_shift_id is null
  or new.target_member_id is null or new.member_id=new.target_member_id) then
  raise exception '換班必須選擇雙方的已發布班表';end if;
 return new;
end $fn$;
drop trigger if exists wm_swap_requires_shifts on public.wm_requests;
create trigger wm_swap_requires_shifts before insert on public.wm_requests
 for each row execute function wm_private.require_real_swap_assignment();

CREATE OR REPLACE FUNCTION wm_private.on_shift_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if new.status='published' and (tg_op='INSERT' or old.status is distinct from new.status or
    old.starts_at is distinct from new.starts_at or old.ends_at is distinct from new.ends_at or old.member_id is distinct from new.member_id) then
   insert into public.wm_notifications(tenant_id,recipient_member_id,event_key,title,body)
   values(new.tenant_id,new.member_id,'shift:published:'||new.id||':'||new.updated_at::text,
   '班表已發布或變更','請開啟我的班表確認工作時間。')
   on conflict do nothing;
 end if;
 return new;
end $function$

