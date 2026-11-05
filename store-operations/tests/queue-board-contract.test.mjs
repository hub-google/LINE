import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {spawnSync} from "node:child_process";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=file=>readFileSync(path.join(root,file),"utf8");
const board=read("saas/board.html");
const publicSql=read("supabase/migrations/20261105132500_public_queue_board_without_login.sql");
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

test("TV board reads privacy-safe store numbers publicly without LINE/Supabase sign-in",()=>{
  assert.match(board,/rpc\("so_public_board",\{p_slug:slug,p_limit:5\}\)/);
  assert.match(board,/data\.current/);
  assert.doesNotMatch(board,/\.padStart\(/);
  assert.doesNotMatch(board,/\.innerHTML\s*=/);
  assert.doesNotMatch(board,/service_role|supabase_service_role|customer_name|line_sub/i);
  assert.match(board,/textContent/);
  assert.match(board,/persistSession:false/);
  assert.doesNotMatch(board,/auth\.getSession|signInAnonymously/);
  assert.match(publicSql,/grant execute on function public\.so_public_board\(text,integer\) to anon,authenticated/);
  assert.match(publicSql,/p_slug text,p_limit integer default 5/);
  assert.doesNotMatch(publicSql,/auth\.uid\(\)|customer_name|customer_phone|line_sub/i);
});

test("TV board polls the safe public read with stale indication and no sign-in",()=>{
  assert.match(publicSql,/so_queue_displays/);
  assert.match(publicSql,/k\.status=\x27WAITING\x27/);
  assert.match(publicSql,/coalesce\(k\.number_prefix,\x27\x27\)/);
  assert.match(board,/so_public_board/);
  assert.match(board,/setInterval\(\(\)=>\{if\(!document\.hidden\)void refresh\(\);\},12000\)/);
  assert.match(board,/staleFromFailure/);
  assert.match(board,/lastSuccess/);
  assert.match(board,/requestFullscreen/);
  assert.match(board,/prefers-reduced-motion/);
  assert.match(board,/document\.addEventListener\("visibilitychange"/);
});
