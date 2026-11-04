import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {spawnSync} from "node:child_process";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=file=>readFileSync(path.join(root,file),"utf8");
const board=read("saas/board.html");
const build=read("../.github/scripts/build-line-saas.mjs");
const deploy=read("../.github/workflows/line-saas-pages.yml");

test("TV board browser module parses and supports automatic deployment versioning",()=>{
  assert.match(board,/<meta name="line-saas-build" content="__LINE_SAAS_BUILD__">/);
  assert.match(board,/version-watch\.js\?build=__LINE_SAAS_BUILD__/);
  const scripts=[...board.matchAll(/<script\b[^>]*type=["']module["'][^>]*>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,1);
  const syntax=spawnSync(process.execPath,["--input-type=module","--check"],{input:scripts[0][1],encoding:"utf8"});
  assert.equal(syntax.status,0,syntax.stderr);
  assert.match(build,/"board\.html"/);
  assert.match(deploy,/for product in booking saas/);
  assert.match(deploy,/for f in index\.html home\.html board\.html/);
});

test("TV board uses persisted queue display number and does not expose personal data",()=>{
  assert.match(board,/rpc\("so_public_state",\{p_slug:slug\}\)/);
  assert.match(board,/data\.current/);
  assert.doesNotMatch(board,/\.padStart\(/);
  assert.doesNotMatch(board,/\.innerHTML\s*=/);
  assert.doesNotMatch(board,/service_role|supabase_service_role|customer_name|line_sub/i);
  assert.match(board,/textContent/);
  assert.match(board,/line-saas-board-session-v1/);
  assert.match(board,/signInAnonymously/);
});

test("TV board tracks freshness, Realtime, and safe periodic fallback",()=>{
  assert.match(board,/so_queue_displays/);
  assert.match(board,/filter:"tenant_id=eq\."\+tenantId/);
  assert.match(board,/setInterval\(\(\)=>\{if\(!document\.hidden\)void refresh\(\);\},12000\)/);
  assert.match(board,/staleFromFailure/);
  assert.match(board,/lastSuccess/);
  assert.match(board,/requestFullscreen/);
  assert.match(board,/prefers-reduced-motion/);
  assert.match(board,/document\.addEventListener\("visibilitychange"/);
});
