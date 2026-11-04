
-- Additive fictional demonstration fixtures for PRD department/shift staffing flows.
-- Do not clear, replace or overwrite existing employee, booking or queue records.
insert into public.wm_departments(tenant_id,branch_id,name)
select b.tenant_id,b.id,case when b.name='台北總店' then '台北門市營運' else '板橋門市營運' end
from public.wm_branches b where b.tenant_id='98d3505c-cbe6-46ed-a95a-13672e6d98f4'
 and b.name in('台北總店','板橋分店')
on conflict(tenant_id,branch_id,name) do nothing;

update public.wm_members m set department_id=d.id
from public.wm_departments d
where m.tenant_id='98d3505c-cbe6-46ed-a95a-13672e6d98f4'
 and m.branch_id=d.branch_id and m.department_id is null and d.name like '%門市營運';

insert into public.wm_shift_templates(tenant_id,name,starts_local,ends_local,break_minutes)
values('98d3505c-cbe6-46ed-a95a-13672e6d98f4','早班 09:00–18:00','09:00','18:00',60),
      ('98d3505c-cbe6-46ed-a95a-13672e6d98f4','晚班 13:00–21:00','13:00','21:00',30),
      ('98d3505c-cbe6-46ed-a95a-13672e6d98f4','跨日夜班 22:00–06:00','22:00','06:00',60)
on conflict(tenant_id,name) do nothing;

insert into public.wm_staffing_requirements(tenant_id,branch_id,weekday,starts_local,ends_local,needed)
select b.tenant_id,b.id,d.weekday,'09:00'::time,'18:00'::time,
 case when b.name='台北總店' then 2 else 1 end
from public.wm_branches b cross join (select generate_series(1,5) as weekday) d
where b.tenant_id='98d3505c-cbe6-46ed-a95a-13672e6d98f4'
 and b.name in('台北總店','板橋分店')
on conflict(tenant_id,branch_id,weekday,starts_local,ends_local) do nothing;
