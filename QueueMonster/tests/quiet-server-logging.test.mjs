import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const backendFiles = [
  "supabase/functions/line-bridge/index.ts",
  "supabase/functions/qm-admin-login/index.ts",
  "supabase/functions/qm-mini-session/index.ts",
  "saas/supabase/functions/staff-invite/index.ts",
  "saas/supabase/functions/staff-complete-setup/index.ts",
];
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("QueueMonster Edge Functions do not emit routine debug, info or success logs", () => {
  for (const file of backendFiles) {
    assert.doesNotMatch(read(file), /\bconsole\.(?:log|info|debug)\s*\(/, file);
  }
});

test("ignored invalid LINE events are quiet; actual processing failures remain visible", () => {
  const bridge = read("supabase/functions/line-bridge/index.ts");
  assert.doesNotMatch(bridge, /LINE follow event missing valid identifier or timestamp/);
  assert.match(bridge, /console\.error\("LINE webhook event handling failed"/);
  assert.match(bridge, /console\.error\("LINE outbox dispatcher failed"/);
});
