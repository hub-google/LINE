-- PRD §102 K10: manager-authorized selected ticket call with audit reason.
-- No table reset or serial changes; reuse existing CALL event/LINE notification path.
create or replace function public.so_staff_call_selected(p_slug text,p_ticket_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.so_tenants; k public.so_tickets; v_reason text;
begin
 if auth.uid() is null then raise exception '請先登入'; end if;
 select * into t from public.so_tenants where slug=p_slug for update;
 if not found then raise exception '找不到門市'; end if;
 if coalesce(private.so_role(t.id),'') not in ('OWNER','MANAGER') and not private.so_platform() then
   raise exception '只有企業管理者可以指定叫號' using errcode='42501';
 end if;
 if t.modules->>'calling'<>'true' then raise exception '門市尚未開通叫號'; end if;
 v_reason:=btrim(coalesce(p_reason,''));
 if char_length(v_reason)<2 or char_length(v_reason)>200 or v_reason ~ '[[:cntrl:]]'
 then raise exception '指定叫號原因請輸入 2～200 字且不能包含控制字元'; end if;
 if exists(select 1 from public.so_tickets
    where tenant_id=t.id and deleted_at is null
      and status in ('CALLED','ARRIVED','ADMITTED','SERVING')) then
   raise exception '請先完成目前服務中的號碼';
 end if;
 select * into k from public.so_tickets
 where tenant_id=t.id and id=p_ticket_id and deleted_at is null and status='WAITING'
 for update;
 if not found then raise exception '僅能指定同門市、仍在候位中的號碼'; end if;
 update public.so_tickets set status='CALLED',updated_at=now(),line_call_event_id=gen_random_uuid()
 where id=k.id returning * into k;
 insert into public.so_audit(tenant_id,actor,action,info)
 values(t.id,auth.uid(),'call_selected',jsonb_build_object(
   'ticket',k.id,'reason',v_reason,'ticket_no',k.ticket_no,
   'round',k.number_round,'queue_joined_at',k.queue_joined_at));
 return jsonb_build_object('success',true,
   'number',coalesce(k.number_prefix,'')||k.ticket_no::text,
   'ticket_id',k.id,'line_call_event_id',k.line_call_event_id);
end $$;
revoke all on function public.so_staff_call_selected(text,uuid,text) from public,anon;
grant execute on function public.so_staff_call_selected(text,uuid,text) to authenticated;
