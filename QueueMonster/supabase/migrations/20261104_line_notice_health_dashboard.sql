-- Manager-visible delivery diagnostics for P0 incident detection.
-- Only exposes aggregate counts and standardized error codes, never recipients or tokens.
create or replace function public.so_line_notice_health(p_slug text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t public.so_tenants; v_pending integer;v_retry integer;v_failed integer;v_sent integer;v_issue text;v_last timestamptz;
begin
 if auth.uid() is null then raise exception '請先登入';end if;
 select * into t from public.so_tenants where slug=p_slug;
 if not found then raise exception '找不到門市';end if;
 if private.so_role(t.id) not in ('OWNER','MANAGER') and not private.so_platform() then
  raise exception '沒有通知監控權限' using errcode='42501';end if;
 select count(*) filter(where status in ('PENDING','PROCESSING')),
        count(*) filter(where status='RETRY'),
        count(*) filter(where status='FAILED'),
        count(*) filter(where status='SENT')
 into v_pending,v_retry,v_failed,v_sent
 from public.so_line_notice_outbox
 where tenant_id=t.id and created_at>=now()-interval '7 days';
 select left(last_error,150),created_at into v_issue,v_last
 from public.so_line_notice_outbox
 where tenant_id=t.id and status in ('RETRY','FAILED')
 order by created_at desc limit 1;
 return jsonb_build_object('pending',v_pending,'retry',v_retry,
   'failed',v_failed,'sent',v_sent,'recent_error',v_issue,'recent_issue_at',v_last);
end;
$$;
revoke all on function public.so_line_notice_health(text) from public,anon;
grant execute on function public.so_line_notice_health(text) to authenticated;
