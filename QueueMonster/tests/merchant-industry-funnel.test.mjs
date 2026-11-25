import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(path.join(root,p),"utf8");
const origins="https://hub-google.github.io/LINE/booking/";
const sectors=["breakfast","salon","clinic","repair"];
const home=read("saas/home.html");
const sitemap=read("saas/sitemap.xml");
const build=read("../.github/scripts/build-line-saas.mjs");
const deploy=read("../.github/workflows/line-saas-pages.yml");

test("four industries share one interactive merchant homepage and one demo link",()=>{
 const section=home.match(/<section id="industries"[\s\S]*?<\/section>/)?.[0];
 assert.ok(section,"Merchant industry section");
 assert.match(section,/你的店，最需要省掉哪件事/);
 assert.match(section,/role="tablist"/);
 assert.match(section,/role="tabpanel"/);
 assert.match(section,/id="industry-switcher"/);
 assert.equal((section.match(/data-industry="(?:breakfast|salon|clinic|repair)"/g)||[]).length,4);
 assert.equal((section.match(/class="qm-industry-single-cta"/g)||[]).length,1);
 assert.match(section,/href="\.\/demo\.html\?role=merchant"/);
 for(const sector of sectors){
  assert.match(section,new RegExp('data-industry="'+sector+'"'),sector+" tab");
  assert.doesNotMatch(section,new RegExp('industry-'+sector+'\.html'),"No duplicated industry URLs");
 }
 assert.match(home,/assets\/marketing\/industry-switcher\.js\?build=__LINE_SAAS_BUILD__/);
 assert.doesNotMatch(home,/href="\.\/industry-(?:breakfast|salon|clinic|repair)\.html"/);
});

test("industry selector switches informative copy in place without changing the URL",()=>{
 const js=read("saas/assets/marketing/industry-switcher.js");
 const css=read("saas/assets/marketing/dual-portals.css");
 const syntax=spawnSync(process.execPath,["--check"],{input:js,encoding:"utf8"});
 assert.equal(syntax.status,0,syntax.stderr);
 for(const sector of sectors)assert.ok(js.includes(sector+':{'),sector+" source data");
 for(const role of ["tablist","tabpanel"])assert.ok(home.includes('role="'+role+'"'));
 assert.match(js,/aria-selected/);
 assert.match(js,/ArrowRight/);
 assert.match(js,/ArrowDown/);
 assert.match(js,/Home/);
 assert.match(js,/End/);
 assert.match(js,/textContent=value\[name\]/);
 assert.match(js,/qmMarketingTrack\?\.\("industry_view"/);
 assert.doesNotMatch(js,/location\.href|location\.assign|history\.pushState/);
 assert.match(css,/\.qm-industry-switcher/);
 assert.match(css,/@media\(max-width:570px\)/);
 assert.match(css,/prefers-reduced-motion/);
});

test("no separate industry pages are built, indexed or served from GitHub Pages",()=>{
 for(const sector of sectors){
  const old="industry-"+sector+".html";
  assert.ok(!build.includes('"'+old+'"'),"Do not rebuild "+old);
  assert.ok(!sitemap.includes("<loc>"+origins+old+"</loc>"),"Remove old sitemap "+old);
  assert.ok(deploy.includes('"$pubdir/$product/'+old+'"'),"GitHub Pages deployment retires "+old);
 }
 assert.match(deploy,/branches: \[main\]/);
 assert.match(deploy,/for product in booking saas/);
});

test("DEMO scene/role switch preserves browser deep links and shared account mount",()=>{
 const demo=read("saas/assets/demo/real-flow.js");
 const header=read("saas/assets/marketing/shared-header.js");
 const auth=read("saas/site-auth.js");
 assert.match(demo,/syncDemoLink\("demo_scene"\)/);
 assert.match(demo,/syncDemoLink\("demo_role"\)/);
 assert.match(demo,/history\.replaceState\(null,"",url\.pathname\+url\.search\+url\.hash\)/);
 assert.match(demo,/qm:demo-mode-change/);
 assert.match(demo,/updateIntro\(\)/);
 assert.match(header,/qm:demo-mode-change/);
 assert.match(header,/const merchantPages=new Set/);
 assert.match(header,/querySelector\("\.qm-public-menu nav"\)/);
 assert.match(header,/header\.querySelector\("\.qm-header-cta"\)/);
 assert.match(header,/cta\.remove\(\)/);
 assert.doesNotMatch(header,/window\.location\.reload/);
 assert.match(auth,/qm:demo-mode-change/);
 assert.match(auth,/async function getIdentity\(mode\)/);
 assert.match(auth,/if\(mode==="customer"\)/);
 assert.doesNotMatch(auth,/return operatorIdentity\|\|lineIdentity/);
});

test("marketing tracking records no user input and makes no unapproved calls",()=>{
 const js=read("saas/assets/marketing/funnel-events.js");
 const register=read("saas/assets/merchant-register/main.js");
 const demo=read("saas/assets/demo/signup-conversion.js");
 const video=read("saas/video.html");
 const syntax=spawnSync(process.execPath,["--check"],{input:js,encoding:"utf8"});
 assert.equal(syntax.status,0,syntax.stderr);
 for(const name of ["page_view","industry_view","demo_click","demo_start","demo_scene","demo_role","demo_complete","signup_click","signup_email_requested","video_click","customer_search"])
  assert.ok(js.includes(name),"Missing event "+name);
 assert.match(js,/window\.dataLayer\.push/);
 assert.match(js,/window\.qmMarketingTrack=track/);
 assert.match(demo,/qmMarketingTrack\?\.\("demo_complete"/);
 assert.match(register,/qmMarketingTrack\?\.\("signup_email_requested"\)/);
 assert.match(video,/VideoObject/);
 for(const term of ["fetch(","sendBeacon(","localStorage","sessionStorage","createClient(","email:","phone:"])
  assert.ok(!js.includes(term),"Tracking may not collect personal data or call a backend: "+term);
 assert.doesNotMatch(js,/document\.querySelector\("#keyword"\)/);
});

test("test build keeps Pages canonical; release-origin metadata is only rewritten on a future approved release",()=>{
 assert.match(build,/QUEUE_MONSTER_SITE_URL/);
 assert.match(build,/html\.replaceAll\("https:\/\/hub-google\.github\.io\/LINE\/booking",webOrigin\)/);
 assert.match(build,/sitemap\.replaceAll\("https:\/\/hub-google\.github\.io\/LINE\/booking",webOrigin\)/);
 assert.match(deploy,/branches: \[main\]/);
 assert.match(deploy,/github\.ref == 'refs\/heads\/main'/);
 assert.match(deploy,/git -C "\$pubdir" add -- booking\/ saas\//);
 assert.doesNotMatch(deploy,/queue-prod\//);
});
