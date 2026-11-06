-- Do not reuse a LINE identity verified under another channel after a merchant changes OA.
alter table public.so_line_links add column if not exists login_channel_id text;
-- All existing links predate merchant-owned LINE channels; they were verified under the HQ LIFF.
update public.so_line_links set login_channel_id='2012346974'
where login_channel_id is null;
create index if not exists so_line_links_channel_idx
 on public.so_line_links(tenant_id,login_channel_id,line_sub);
