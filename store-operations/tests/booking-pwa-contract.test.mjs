import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const pwa=readFileSync(path.join(root,"saas/pwa-sw.js"),"utf8");
const index=readFileSync(path.join(root,"saas/index.html"),"utf8");
const home=readFileSync(path.join(root,"saas/home.html"),"utf8");
const offline=readFileSync(path.join(root,"saas/offline.html"),"utf8");
const manifest=JSON.parse(readFileSync(path.join(root,"saas/manifest.webmanifest"),"utf8"));
const build=readFileSync(path.join(root,"../../.github/scripts/build-line-saas.mjs"),"utf8");

test("manifest is installable, scoped to booking only and uses icon sizes",()=>{
 assert.equal(manifest.display,"standalone");
 assert.equal(manifest.start_url,"./home.html");
 assert.equal(manifest.scope,"./");
 assert.equal(manifest.id,"./home.html");
 assert.deepEqual(manifest.icons.map(x=>x.sizes),["192x192","512x512"]);
 assert.equal(manifest.icons.every(x=>x.type==="image/png"),true);
 assert.match(build,/pwaIcon\(size\)/);
 assert.match(build,/pwa-icon-"\+size\+"\.png"/);
 assert.match(build,/Buffer\.from\(\[137,80,78,71,13,10,26,10\]\)/);
});

test("home and real operations view register the same product-scoped worker",()=>{
 for(const page of [home,index]){
  assert.match(page,/<link rel="manifest" href="\.\/manifest\.webmanifest">/);
  assert.match(page,/navigator\.serviceWorker\.register\("\.\/pwa-sw\.js",\{scope:"\.\/"\}\)/);
  assert.match(page,/location\.protocol==="https:"/);
 }
 assert.match(home,/id="install-booking-app"/);
 assert.match(home,/beforeinstallprompt/);
 assert.match(home,/appinstalled/);
 assert.match(home,/if\(!promptEvent\)return/);
});

test("service worker is offline-shell-only, never writes customer, auth or API responses into Cache Storage",()=>{
 assert.match(pwa,/CACHE_PREFIX="line-booking-safe-static-"/);
 assert.match(pwa,/__LINE_SAAS_BUILD__/);
 assert.match(pwa,/STATIC_ASSETS=\["\.\/offline\.html","\.\/booking-theme\.css","\.\/pwa-icon-192\.png","\.\/pwa-icon-512\.png"\]/);
 assert.match(pwa,/if\(request\.method!=="GET"\)return/);
 assert.match(pwa,/if\(url\.origin!==self\.location\.origin\)return/);
 assert.match(pwa,/if\(!url\.pathname\.startsWith\(scope\.pathname\)\)return/);
 assert.match(pwa,/if\(request\.mode==="navigate"\)/);
 assert.match(pwa,/fetch\(request\)\.catch\(async\(\)=>/);
 assert.match(pwa,/cache\.match\("\.\/offline\.html"\)/);
 assert.doesNotMatch(pwa,/cache\.put\(/);
 assert.doesNotMatch(pwa,/caches\.open\([^)]*response/);
 assert.doesNotMatch(pwa,/\b(auth\.uid|customer\.my_reservations|supabaseUrl)\b/);
 assert.match(offline,/離線時不會產生新預約/);
});

test("versioned deploy produces all static PWA assets without modifying unrelated projects",()=>{
 assert.match(build,/worker\.replaceAll\(placeholder,sha\)/);
 assert.match(build,/await copyFile\(path\.join\(src, "manifest\.webmanifest"\)/);
 assert.match(build,/await copyFile\(path\.join\(src, "offline\.html"\)/);
});
