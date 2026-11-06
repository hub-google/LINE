-- Website-wide LINE identity indicator, readable only as the authenticated account itself.
-- Public pages do not read or expose LINE user IDs or cross-tenant customer records.
create or replace function public.so_site_header_identity()
returns jsonb language sql stable security definer set search_path='' as $fn$
 select coalesce((
   select jsonb_build_object('display_name',left(trim(l.display_name),80),'source','LINE')
   from public.so_line_links l
   join public.so_tenants t on t.id=l.tenant_id
   where l.user_id=(select auth.uid())
     and (select auth.uid()) is not null
     and t.status='ACTIVE'
     and length(trim(coalesce(l.display_name,'')))>0
     and nullif(l.login_channel_id,'') is not null
     and l.updated_at between (now() - interval '30 days') and (now()+interval '1 minute')
   order by l.updated_at desc,l.tenant_id
   limit 1
 ),'null'::jsonb);
$fn$;
revoke all on function public.so_site_header_identity() from public,anon,authenticated;
grant execute on function public.so_site_header_identity() to authenticated;
