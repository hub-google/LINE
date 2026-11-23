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

test("four industry SEO pages deliver a complete merchant funnel",()=>{
 for(const sector of sectors){
  const file="industry-"+sector+".html";
  const html=read("saas/"+file);
  assert.match(html,/<meta name="line-saas-build" content="__LINE_SAAS_BUILD__">/,file);
  assert.match(html,/version-watch\.js\?build=__LINE_SAAS_BUILD__/,file);
  assert.match(html,/<title>[^<]+<\/title>/,file);
  assert.match(html,/<meta name="description" content="[^"]{25,}">/,file);
  assert.ok(html.includes('<link rel="canonical" href="'+origins+file+'">'),file+" canonical");
  assert.ok(html.includes('<meta property="og:url" content="'+origins+file+'">'),file+" OG URL");
  assert.match(html,/meta name="twitter:card" content="summary_large_image"/,file);
  assert.match(html,/name="viewport"/,file);
  assert.match(html,/data-role="merchant"/,file);
  assert.match(html,/id="marketing-header"/,file);
  assert.match(html,/assets\/marketing\/shared-header\.js/,file);
  assert.match(html,/assets\/marketing\/industry-pages\.css/,file);
  assert.match(html,/assets\/marketing\/funnel-events\.js/,file);
  assert.ok(html.includes('href="./demo.html?role=merchant&amp;scene='+sector),file+" demo link");
  assert.ok(html.includes('href="./merchant-register.html?mode=signup&amp;from=industry&amp;scene='+sector+'"'),file+" signup conversion");
  assert.ok(home.includes('href="./'+file+'"'),file+" homepage entry");
  assert.ok(sitemap.includes("<loc>"+origins+file+"</loc>"),file+" sitemap");
  assert.ok(build.includes('"'+file+'"'),file+" build pipeline");
  assert.ok(deploy.includes(file),file+" Pages deployment");
  const scripts=[...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,1,file+" must have one JSON-LD script");
  const data=JSON.parse(scripts[0][1]);
  assert.equal(data["@context"],"https://schema.org");
  assert.ok(data["@graph"].some(x=>x["@type"]==="FAQPage"),file+" FAQ structured data");
  assert.ok(data["@graph"].some(x=>x["@type"]==="WebPage"),file+" webpage structured data");
  assert.doesNotMatch(html,/href="[^"]*(?:view=platform|platform-login)/,file);
 }
});

test("industry pages share one mobile style sheet, and cross-link other business types",()=>{
 const css=read("saas/assets/marketing/industry-pages.css");
 assert.match(css,/@media\(max-width:900px\)/);
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/prefers-reduced-motion/);
 for(const sector of sectors){
  const html=read("saas/industry-"+sector+".html");
  assert.equal((html.match(/<main\b/g)||[]).length,1);
  assert.equal((html.match(/<footer\b/g)||[]).length,1);
  assert.equal((html.match(/<details>/g)||[]).length,3);
  for(const other of sectors.filter(x=>x!==sector))
   assert.ok(html.includes('href="./industry-'+other+'.html"'),sector+" needs related "+other);
 }
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
 assert.match(auth,/return operatorIdentity\|\|lineIdentity/);
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
