import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=(p)=>readFileSync(path.resolve(root,p),"utf8");
const landing=read("saas/video.html");
const script=read("saas/assets/videos/share-video.js");
const css=read("saas/assets/videos/share-video.css");
const build=read("../.github/scripts/build-line-saas.mjs");
const media=read("../.github/scripts/prepare-intro-video.mjs");

test("independent video page has complete crawler-readable Open Graph metadata",()=>{
 for(const property of ["og:url","og:type","og:title","og:description","og:image","og:image:width","og:image:height","og:video","og:video:type"])
  assert.match(landing,new RegExp('property="'+property.replaceAll(":","\\:")+'"'));
 assert.match(landing,/<meta property="og:image" content="https:\/\/hub-google\.github\.io\/LINE\/booking\/assets\/videos\/intro-og\.jpg">/);
 assert.match(landing,/content="1200"/);
 assert.match(landing,/content="630"/);
 assert.match(landing,/<meta name="twitter:card" content="summary_large_image">/);
 assert.match(landing,/<link rel="canonical" href="https:\/\/hub-google\.github\.io\/LINE\/booking\/video\.html">/);
 assert.match(landing,/<meta property="og:video:type" content="video\/mp4">/);
 assert.doesNotMatch(landing,/meta http-equiv="refresh"/);
});
test("shared video opens directly, with reliable inline mobile controls and no login",()=>{
 assert.match(landing,/<video id="brand-film" autoplay muted playsinline controls preload="metadata"/);
 assert.match(landing,/src="\.\/assets\/videos\/intro\.mp4"/);
 assert.match(landing,/poster="\.\/assets\/videos\/intro-poster\.jpg"/);
 assert.doesNotMatch(landing,/site-auth\.js|signIn|liff\.init|app\/login/);
 for(const term of ["navigator.share","navigator.clipboard","video.play()","video.muted","video.load()","webkit-playsinline","video.addEventListener(\"error\"","retry-video","playButton","share-link"])
  assert.ok(script.includes(term),"Missing share video viewer feature: "+term);
 for(const term of ["object-fit:contain","@media(max-width:700px)","@media(max-width:360px)","watch-player","watch-detail"])
  assert.ok(css.includes(term),"Missing responsive share movie rule: "+term);
});
test("build makes authentic JPG poster from uploaded film for social and mobile",()=>{
 assert.match(build,/"video\.html"/);
 assert.match(build,/makeIntroShareImages/);
 assert.match(build,/QUEUE_MONSTER_SITE_URL/);
 assert.match(media,/intro-og\.jpg/);
 assert.match(media,/intro-poster\.jpg/);
 assert.match(media,/1200:630/);
 assert.match(media,/540:960/);
 assert.match(media,/ffmpeg/);
 for(const name of ["line-saas-pages.yml","queue-monster-production-release.yml"]){
  const workflow=read("../.github/workflows/"+name);
  assert.match(workflow,/video\.html/);
  assert.match(workflow,/intro-og\.jpg/);
  assert.match(workflow,/intro-poster\.jpg/);
 }
});
