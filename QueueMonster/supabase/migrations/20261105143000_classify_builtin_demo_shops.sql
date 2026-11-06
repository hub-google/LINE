-- Classify only existing built-in demo shops to exercise discovery filters.
-- Leave real merchants and other test tenants untouched.
update public.so_tenants
set directory_category='美髮',updated_at=now()
where slug='greenfield-salon' and directory_category='其他';
update public.so_tenants
set directory_category='醫療／診所',updated_at=now()
where slug='demo-clinic' and directory_category='其他';
