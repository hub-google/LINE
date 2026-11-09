import test from "node:test";
import assert from "node:assert/strict";
import {existsSync, readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const workflow = (name) => readFileSync(path.join(root, ".github/workflows", name), "utf8");

function contractSuite(contents) {
  const match = contents.match(/^\s*run:\s*node --test\s+(QueueMonster\/tests\/[^\n]+)/m);
  assert.ok(match, "Workflow must run the Queue Monster contract suite");
  const paths = match[1].trim().split(/\s+/);
  assert.equal(paths.length, new Set(paths).size, "A test must not be listed twice");
  for (const file of paths) {
    assert.match(file, /^QueueMonster\/tests\/[\w-]+\.test\.mjs$/);
    assert.ok(existsSync(path.join(root, file)), "Missing test: " + file);
  }
  return paths.sort();
}

test("PR validation and production deployment run the same Queue Monster contract suite", () => {
  const pr = contractSuite(workflow("line-saas-pr-validation.yml"));
  const deploy = contractSuite(workflow("line-saas-pages.yml"));
  assert.deepEqual(pr, deploy, "Every deployment test must also be checked before a PR can merge");
  for (const critical of [
    "site-auth-contract",
    "merchant-onboarding-contract",
    "merchant-brand-profile",
    "service-units-contract",
    "explore-game-interaction",
    "frontend-modules",
    "frontend-build"
  ]) {
    assert.ok(pr.includes("QueueMonster/tests/" + critical + ".test.mjs"), critical + " coverage is required");
  }
});
