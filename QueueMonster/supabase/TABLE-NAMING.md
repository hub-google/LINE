# QueueMonster Supabase table naming

The shared Supabase project `unapiwajmgqqtdkixaab` stores **QueueMonster's 42 physical tables** under the `qm_` prefix (39 in `public`, 3 in `private`). The existing `public.qm_admin_pin_guard` was already using that prefix.

The original `so_` tables were renamed in place, **not copied**, by `supabase/migrations/20261112143000_queue_monster_qm_table_prefix.sql`. Primary keys, foreign keys, indexes, data, RLS, privileges and table-bound triggers retain their PostgreSQL object identities.

**Stable backwards-compatible API:** existing `so_*` RPC names, function names, and LINE endpoints are intentionally unchanged. The migration rewrites physical table references inside SQL function bodies; the `line-bridge` and `staff-invite` Edge Functions reference `qm_*` tables.

Historical migration SQL files keep their original `so_` names so migration history is not rewritten. Every new physical QueueMonster table must use `qm_`, and any new backend code must reference the `qm_` table names.

Validation:
- Check `pg_class`: 42 new `qm_*` tables plus the existing `qm_admin_pin_guard`, and no physical `so_*` tables.
- Verify no `so_*` physical-table identifiers in the live QueueMonster SQL function bodies.
- Run `node --test tests/queue-monster-table-prefix.test.mjs` from `QueueMonster`.
- Validate deployed Edge Functions `line-bridge` and `staff-invite` and the customer booking, calling, and pickup flows.
