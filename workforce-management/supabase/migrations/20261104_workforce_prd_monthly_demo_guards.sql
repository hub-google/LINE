
-- Demo month-close adjustments stay audit-only; real tenant adjustments require auth actor.
alter table public.wm_period_adjustments alter column adjusted_by drop not null;
create or replace function wm_private.validate_adjustment_actor() returns trigger
language plpgsql security definer set search_path='' as $fn$
begin
 if new.adjusted_by is null and not exists(
  select 1 from public.wm_tenants where id=new.tenant_id and is_demo=true
 ) then raise exception '正式企業月結調整必須記錄管理者';end if;
 if not exists(select 1 from public.wm_period_closures c where c.id=new.closure_id and c.tenant_id=new.tenant_id)
 then raise exception '月結快照與企業不符';end if;
 return new;
end $fn$;
drop trigger if exists wm_validate_adjustment_actor on public.wm_period_adjustments;
create trigger wm_validate_adjustment_actor before insert on public.wm_period_adjustments
 for each row execute function wm_private.validate_adjustment_actor();
alter table public.wm_branches
 add constraint wm_branch_lat_valid check(latitude is null or latitude between -90 and 90),
 add constraint wm_branch_lng_valid check(longitude is null or longitude between -180 and 180);
notify pgrst,'reload schema';
