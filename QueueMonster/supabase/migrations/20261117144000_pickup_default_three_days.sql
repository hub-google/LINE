-- New or unset pickup settings default to three days.
-- Existing merchants' stored days_ahead values, including an intentional 7, are preserved.
alter table public.qm_pickup_settings
  alter column days_ahead set default 3;

-- Older pickup RPCs build an in-memory settings row when a merchant has never saved
-- pickup settings. Align those fallback values with the new column/UI default.
-- Preserve function signatures, permissions, security attributes and all other logic.
do $pickup_default$
declare
  v_function record;
  v_definition text;
  v_updated text;
begin
  for v_function in
    select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname like 'so_pickup_%'
       and p.prokind = 'f'
  loop
    v_definition := pg_get_functiondef(v_function.oid);
    v_updated := regexp_replace(
      v_definition,
      's[.]days_ahead[[:space:]]*:=[[:space:]]*7[[:space:]]*;',
      's.days_ahead:=3;',
      'g'
    );
    if v_updated <> v_definition then
      execute v_updated;
    end if;
  end loop;
end
$pickup_default$;
