-- Correction: CHECK constraints are evaluated against the proposed INSERT row
-- before ON CONFLICT. A decrement must insert a nonnegative zero placeholder,
-- then apply the signed delta only in the conflict UPDATE.
create or replace function private.so_activity_delta(
  p_tenant uuid,p_created timestamptz,p_kind text,p_delta integer
) returns void language plpgsql security definer set search_path='' as $$
begin
  if p_tenant is null or p_created is null or p_delta=0 then return; end if;
  if p_kind not in ('reservation','ticket') or p_delta not in (-1,1) then
    raise exception 'Invalid popularity counter delta' using errcode='22023';
  end if;
  insert into private.so_store_activity_daily(tenant_id,activity_date,reservation_count,ticket_count)
  values (p_tenant,(p_created at time zone 'Asia/Taipei')::date,
          case when p_kind='reservation' then greatest(p_delta,0) else 0 end,
          case when p_kind='ticket' then greatest(p_delta,0) else 0 end)
  on conflict (tenant_id,activity_date) do update set
    reservation_count=private.so_store_activity_daily.reservation_count+
                      case when p_kind='reservation' then p_delta else 0 end,
    ticket_count=private.so_store_activity_daily.ticket_count+
                 case when p_kind='ticket' then p_delta else 0 end;
end;
$$;
revoke all on function private.so_activity_delta(uuid,timestamptz,text,integer) from public,anon,authenticated;
