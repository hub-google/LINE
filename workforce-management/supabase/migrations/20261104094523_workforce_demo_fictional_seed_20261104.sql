
-- Fictitious demonstration company. No changes to auth.users or existing application records.
insert into public.wm_tenants(id,name,is_demo,created_by)
values ('98d3505c-cbe6-46ed-a95a-13672e6d98f4','範例｜光合生活連鎖門市',true,null)
on conflict(id) do nothing;
insert into public.wm_branches(id,tenant_id,name,gps_required,radius_m)
values
('9c49a6b2-68a6-469d-83cb-a8a1102b6523','98d3505c-cbe6-46ed-a95a-13672e6d98f4','台北總店',false,200),
('453b1d90-b6b1-4ffb-b9bd-8f08b9eb8efc','98d3505c-cbe6-46ed-a95a-13672e6d98f4','板橋分店',false,200)
on conflict(id) do nothing;
with staff(employee_code,display_name,branch_id,role,employment_type) as (
 values
 ('OWN001','陳店主','9c49a6b2-68a6-469d-83cb-a8a1102b6523'::uuid,'owner','full_time'),
 ('MGR001','王店長','9c49a6b2-68a6-469d-83cb-a8a1102b6523'::uuid,'manager','full_time'),
 ('EMP001','林小美','9c49a6b2-68a6-469d-83cb-a8a1102b6523'::uuid,'employee','part_time'),
 ('EMP002','張志明','9c49a6b2-68a6-469d-83cb-a8a1102b6523'::uuid,'employee','full_time'),
 ('EMP003','黃佳怡','453b1d90-b6b1-4ffb-b9bd-8f08b9eb8efc'::uuid,'employee','part_time')
)
insert into public.wm_members(tenant_id,branch_id,display_name,employee_code,role,employment_type)
select '98d3505c-cbe6-46ed-a95a-13672e6d98f4',s.branch_id,s.display_name,s.employee_code,s.role,s.employment_type
from staff s on conflict(tenant_id,employee_code) do nothing;
insert into public.wm_leave_entitlements(tenant_id,member_id,year,leave_kind,hours)
select m.tenant_id,m.id,extract(year from now() at time zone 'Asia/Taipei')::int, v.kind,v.hours
from public.wm_members m cross join (values ('annual',80.0),('sick',80.0),('personal',112.0)) v(kind,hours)
where m.tenant_id='98d3505c-cbe6-46ed-a95a-13672e6d98f4'
on conflict(tenant_id,member_id,year,leave_kind) do nothing;
insert into public.wm_shifts(tenant_id,member_id,branch_id,starts_at,ends_at,status,notes)
select m.tenant_id,m.id,m.branch_id,
 (d.dt + case when m.employee_code='EMP001' then time '13:00' else time '09:00' end) at time zone 'Asia/Taipei',
 (d.dt + time '18:00') at time zone 'Asia/Taipei',
 'published','初始測試班表'
from public.wm_members m
cross join (select (now() at time zone 'Asia/Taipei')::date + n as dt from generate_series(0,6) n) d
where m.tenant_id='98d3505c-cbe6-46ed-a95a-13672e6d98f4'
and m.employee_code <> 'OWN001'
and not exists(select 1 from public.wm_shifts s where s.member_id=m.id and s.notes='初始測試班表' and (s.starts_at at time zone 'Asia/Taipei')::date=d.dt);
