import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "./helpers/source-fs.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bridge = readFileSync(path.join(root, "supabase/functions/line-bridge/index.ts"), "utf8");
const invite = readFileSync(path.join(root, "saas/supabase/functions/staff-invite/index.ts"), "utf8");
const migration = readFileSync(
  path.join(root, "supabase/migrations/20261112143000_queue_monster_qm_table_prefix.sql"), "utf8"
);

test("live QueueMonster Edge Functions reference qm_ tables, never so_ tables", () => {
  for (const source of [bridge, invite]) {
    assert.doesNotMatch(source, /\.from\(\s*["']so_/);
    assert.doesNotMatch(source, /\.upsert\(\s*["']so_/);
    assert.doesNotMatch(source, /\.insert\(\s*["']so_/);
  }
  assert.match(bridge, /\.from\("qm_tenants"\)/);
  assert.match(bridge, /\.from\("qm_line_links"\)/);
  assert.match(invite, /\.from\("qm_tenants"\)/);
  // RPC names are a stable API, and deliberately are NOT renamed.
  assert.match(bridge, /so_merchant_oa_save_messaging_secret/);
  assert.match(invite, /so_accept_invite/);
});

test("the forward migration renames all tables without recreating or deleting data", () => {
  assert.match(migration, /ALTER TABLE %I\.%I RENAME TO %I/);
  assert.match(migration, /v_table_count <> 42/);
  assert.match(migration, /IS DISTINCT FROM v_after/);
  assert.doesNotMatch(migration, /\bDROP TABLE\b|\bTRUNCATE\b/i);
  assert.match(migration, /NOTIFY pgrst, 'reload schema'/);
});
