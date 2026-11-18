import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=name=>readFileSync(path.join(root,name),"utf8");
test("brand intro is isolated on homepage and mobile responsive",()=>{
 const home=read("saas/home.html"),css=read("saas/assets/home/intro-video.css");
 assert.match(home,/id="watch-intro-video"/);
 assert.match(home,/assets\/home\/intro-video\.js\?build=__LINE_SAAS_BUILD__/);
 assert.match(home,/assets\/home\/intro-video\.css\?build=__LINE_SAAS_BUILD__/);
 assert.match(css,/@media\(max-width:540px\)/);
 assert.match(css,/#watch-intro-video\[hidden\]/);
});
test("campaign fails closed, respects visitors and accepts uploads without a source edit",()=>{
 const source=read("saas/assets/home/intro-video.js"),build=read("../.github/scripts/build-line-saas.mjs");
 for(const term of ["intro-video.json","enabled===true","intro_preview","awaitGuest","localStorage","Line/","prefers-reduced-motion","aria-modal","跳過影片","video.play().catch","demo.html"])
  assert.ok(source.includes(term),"Missing "+term);
 for(const term of ["intro.mp4","createHash","25*1024*1024","ftyp","introManifest.enabled=true","intro-video.json"])
  assert.ok(build.includes(term),"Missing build step "+term);
});
test("both test and release workflows validate the intro and generated manifest",()=>{
 for(const name of ["line-saas-pages.yml","queue-monster-production-release.yml"]){
  const workflow=read("../.github/workflows/"+name);
  assert.match(workflow,/intro-video-contract\.test\.mjs/);
  assert.match(workflow,/intro-video\.json/);
  assert.match(workflow,/node --check QueueMonster\/saas\/assets\/home\/intro-video\.js/);
 }
});
