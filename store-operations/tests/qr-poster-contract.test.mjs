import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {spawnSync} from "node:child_process";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=file=>readFileSync(path.join(root,file),"utf8");
const poster=read("saas/poster.html");
const build=read("../.github/scripts/build-line-saas.mjs");
const publish=read("../.github/workflows/line-saas-pages.yml");
const pr=read("../.github/workflows/line-saas-pr-validation.yml");

test("printable poster has parseable browser JS and version-safe packaging",()=>{
  assert.match(poster,/<meta name="line-saas-build" content="__LINE_SAAS_BUILD__">/);
  assert.match(poster,/version-watch\.js\?build=__LINE_SAAS_BUILD__/);
  const scripts=[...poster.matchAll(/<script\b[^>]*type=["']module["'][^>]*>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,1);
  const syntax=spawnSync(process.execPath,["--input-type=module","--check"],{
    input:scripts[0][1],encoding:"utf8"
  });
  assert.equal(syntax.status,0,syntax.stderr);
  assert.match(build,/"poster\.html"/);
  assert.match(publish,/saas\/poster\.html/);
  assert.match(pr,/qr-poster-contract\.test\.mjs/);
});

test("QR contains correct shop, service, and merchant-specific LIFF URL",()=>{
  assert.match(poster,/\/\^\[a-z0-9\]\[a-z0-9-\]\{2,39\}\$\//);
  assert.match(poster,/rpc\("so_public_state",\{p_slug:slug\}\)/);
  assert.match(poster,/line-bridge\?action=config&merchant=/);
  assert.match(poster,/config\.liffId/);
  assert.match(poster,/new URLSearchParams\(\{view:"customer",merchant:slug,tab:mode\}\)/);
  assert.match(poster,/modules\.reservation/);
  assert.match(poster,/modules\.queue/);
  assert.match(poster,/line-saas-poster-session-v1/);
  assert.doesNotMatch(poster,/service_role|customer_name|line_sub|\.innerHTML\s*=/i);
});

test("QR can be printed on A4 or exported to real PNG",()=>{
  assert.match(poster,/@page\{size:A4 portrait;margin:0\}/);
  assert.match(poster,/window\.print\(\)/);
  assert.match(poster,/drawPosterPng\(\)/);
  assert.match(poster,/canvas\.toBlob|c\.toBlob/);
  assert.match(poster,/image\/png/);
  assert.match(poster,/qr\.isDark\(row,col\)/);
  assert.match(poster,/qrcode-generator@2\.0\.4/);
  assert.match(poster,/navigator\.clipboard\.writeText\(target\)/);
});
