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
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(css,/#watch-intro-video\[hidden\]/);
 assert.match(css,/\.qm-intro-panel\.qm-intro-portrait/);
 assert.match(css,/grid-template-columns:minmax\(0,44%\) minmax\(0,56%\)/);
 assert.match(css,/grid-template-rows:54px minmax\(0,1fr\) auto/);
 assert.match(css,/object-fit:contain/);
 assert.match(css,/\.qm-intro-play\{/);
 assert.match(css,/\.qm-intro-loading\{/);
 assert.match(css,/\.qm-intro-sound\{/);
 assert.doesNotMatch(css,/calc\(\(100dvh - 184px\) \* \.5625\)/);
});
test("campaign auto-opens until the visitor explicitly skips it, then offers manual replay",()=>{
 const source=read("saas/assets/home/intro-video.js"),build=read("../.github/scripts/build-line-saas.mjs");
 for(const term of ["intro-video.json","enabled===true","intro_preview","aria-modal","跳過影片","video.play().then","demo.html","if(manifest&&!hasSkipped())open(false)","qm-home-intro-skipped-v1","rememberSkip()","localStorage"])
  assert.ok(source.includes(term),"Missing "+term);
 assert.ok(source.includes("player.videoHeight>player.videoWidth"),"Detect actual video orientation");
 assert.ok(source.includes("controls autoplay playsinline muted"),"Mobile muted autoplay");
 for(const term of ["tryPlay()","qm-intro-play","qm-intro-sound","qm-intro-loading","qm-intro-direct","webkit-playsinline","loadedmetadata","playing","error","retry","preload=\"metadata\""])
  assert.ok(source.includes(term),"Missing resilient playback feature "+term);
 for(const forbidden of ["awaitGuest","shownRecently","acceptedParams","navigator.userAgent","saveExposure"])
  assert.ok(!source.includes(forbidden),"Intro must not suppress homepage opening via "+forbidden);
 for(const term of ["intro.mp4","copyFile(introSource","25*1024*1024","ftyp","introManifest.enabled=true","intro-video.json","intro-video-info.json","jpegSize","intro-og.jpg","intro-poster.jpg"])
  assert.ok(build.includes(term),"Missing build step "+term);
});
test("both test and release workflows validate the intro and generated manifest",()=>{
 for(const name of ["line-saas-pages.yml","queue-monster-production-release.yml"]){
  const workflow=read("../.github/workflows/"+name);
  assert.match(workflow,/intro-video-contract\.test\.mjs/);
  assert.match(workflow,/intro-video\.json/);
  assert.match(workflow,/intro-video-info\.json/);
  assert.match(workflow,/intro-og\.jpg/);
  assert.match(workflow,/intro-poster\.jpg/);
  assert.match(workflow,/node --check QueueMonster\/saas\/assets\/home\/intro-video\.js/);
 }
});
