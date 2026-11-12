-- QueueMonster table prefix migration: so_* -> qm_* (42 physical tables).
-- Preserve rows, table OIDs, FK constraints, RLS, triggers, indexes and grants.
-- Keep existing so_* RPC/function names for backwards compatibility with frontend clients.
-- Historical migrations intentionally remain unchanged; this is a forward-only migration.
-- Edge Functions line-bridge and staff-invite must be deployed from the accompanying commit.
DO $qm_table_prefix$
DECLARE
  v_map jsonb;
  v_table_count integer;
  v_updated integer:=0;
  v_before bigint;
  v_after bigint;
  t record;
  f record;
  m record;
  v_def text;
  v_new_def text;
BEGIN
  SELECT jsonb_object_agg(c.relname, 'qm_' || substring(c.relname FROM 4))
    INTO v_map
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('public','private') AND c.relkind IN ('r','p')
    AND c.relname LIKE 'so\_%' ESCAPE '\';

  SELECT count(*) INTO v_table_count FROM jsonb_each(v_map);
  IF v_table_count <> 42 THEN
    RAISE EXCEPTION 'QueueMonster expected 42 so_ physical tables, got %',v_table_count;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN jsonb_each_text(v_map) AS target_rel ON c.relname=target_rel.value
    WHERE n.nspname IN ('public','private') AND c.relkind IN ('r','p','v','m')
  ) THEN
    RAISE EXCEPTION 'A target qm_ relation already exists; aborting rename';
  END IF;

  FOR t IN
    SELECT n.nspname AS schema_name, c.relname AS old_name
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname IN ('public','private') AND c.relkind IN ('r','p')
       AND c.relname LIKE 'so\_%' ESCAPE '\'
     ORDER BY n.nspname,c.relname
  LOOP
    EXECUTE format('SELECT count(*) FROM %I.%I',t.schema_name,t.old_name) INTO v_before;
    EXECUTE format('ALTER TABLE %I.%I RENAME TO %I',t.schema_name,t.old_name,v_map->>t.old_name);
    EXECUTE format('SELECT count(*) FROM %I.%I',t.schema_name,v_map->>t.old_name) INTO v_after;
    IF v_before IS DISTINCT FROM v_after THEN
      RAISE EXCEPTION 'Row count changed for %.% (% -> %)',
        t.schema_name,t.old_name,v_before,v_after;
    END IF;
  END LOOP;

  -- PostgreSQL rewrites stored views/FK/relation OIDs automatically, not PL/pgSQL text.
  -- Retain so_* function names and replace only the exact *table* identifiers.
  FOR f IN
    SELECT p.oid,p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('public','private') AND p.prokind='f'
      AND p.prosrc LIKE '%so_%'
  LOOP
    v_def:=pg_get_functiondef(f.oid);
    v_new_def:=v_def;
    FOR m IN SELECT key,value FROM jsonb_each_text(v_map) LOOP
      v_new_def:=regexp_replace(v_new_def,'\m'||m.key||'\M',m.value,'g');
    END LOOP;
    IF v_new_def<>v_def THEN
      EXECUTE v_new_def;
      v_updated:=v_updated+1;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    JOIN jsonb_each_text(v_map) AS old_rel ON p.prosrc ~ ('\m'||old_rel.key||'\M')
    WHERE n.nspname IN ('public','private') AND p.prokind='f'
  ) THEN
    RAISE EXCEPTION 'Old table names remain in one or more function bodies';
  END IF;
  RAISE NOTICE 'QueueMonster prefix migrated: % physical tables, % SQL functions updated',
    v_table_count,v_updated;
END $qm_table_prefix$;

NOTIFY pgrst, 'reload schema';
