-- Public, privacy-limited *test only* neighborhood: fixed existing demo tenants.
-- Do not confuse demo shops with official/public merchant listings.
create or replace function public.so_public_explore_demo()
returns jsonb language sql stable security definer set search_path='' as $fn$
 select coalesce(jsonb_agg(
  jsonb_build_object(
   'slug',t.slug,'name',t.name,'description',t.description,
   'category',t.directory_category,'modules',t.modules,'oa_mode',t.oa_mode,
   'address','', 'demo',true, 'test_board_only',(t.slug like 'qa-%')
  ) order by t.name),'[]'::jsonb)
 from public.so_tenants t
 where t.status='ACTIVE' and t.slug in
  ('greenfield-salon','demo-clinic','qa-84b3ef9297eb470685a91a527ca499ca');
$fn$;
revoke all on function public.so_public_explore_demo() from public,anon,authenticated;
grant execute on function public.so_public_explore_demo() to anon,authenticated;
