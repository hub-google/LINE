import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {spawnSync} from "node:child_process";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(path.join(root,p),"utf8");
const directory=read("saas/directory.html");
const js=read("saas/explore-game.js");
const css=read("saas/explore-game.css");
const migration=read("supabase/migrations/20261105141000_discovery_categories_for_store_explore.sql");
const build=read("../.github/scripts/build-line-saas.mjs");
const publish=read("../.github/workflows/line-saas-pages.yml");
const app=read("saas/index.html");

test("explore lists real published stores with category/area/service filters",()=>{
 assert.match(migration,/add column if not exists directory_category text/);
 assert.match(migration,/'category',q\.directory_category/);
 assert.match(migration,/'directory_category',t\.directory_category/);
 assert.match(migration,/directory_category=case when p_patch \? 'directory_category'/);
 assert.match(app,/id="set-directory-category"/);
 assert.match(app,/directory_category:val\("set-directory-category"\)/);
 assert.match(directory,/id="explore-category"/);
 assert.match(directory,/id="explore-area"/);
 assert.match(directory,/id="explore-service"/);
 assert.match(directory,/id="explore-sort"/);
 assert.match(directory,/function areaOf\(shop\)/);
 assert.match(directory,/function serviceMatches\(shop,service\)/);
 assert.match(directory,/so_public_directory/);
 assert.match(directory,/const filtered=\[\.\.\.official,\.\.\.testMatches\]/);
});

test("game mode has map to street to storefront flow and works on mobile",()=>{
 assert.match(directory,/id="explore-switch-game"/);
 assert.match(directory,/id="explore-world"/);
 assert.match(directory,/id="arcade-regions"/);
 assert.match(directory,/id="explore-street"/);
 assert.match(directory,/id="arcade-shopline"/);
 assert.match(directory,/id="arcade-previous"/);
 assert.match(directory,/id="arcade-next"/);
 assert.match(directory,/id="arcade-open-shop"/);
 assert.match(directory,/mode=\["search","queue","mine","game"\]/);
 assert.match(directory,/LineExploreGame\?\.setData/);
 assert.match(js,/function showWorld\(\)/);
 assert.match(js,/function enterRegion\(region\)/);
 assert.match(js,/function drawStreet\(\)/);
 assert.match(js,/function selectShop\(index,scroll=true\)/);
 assert.match(js,/data-shop-index/);
 assert.match(js,/data-region/);
 assert.match(js,/event\.key==="ArrowLeft"/);
 assert.match(js,/event\.key==="ArrowRight"/);
 assert.match(js,/test_board_only/);
 assert.match(js,/shops=Array\.isArray\(publicShops\)/);
 assert.match(css,/@media\(max-width:740px\)/);
 assert.match(css,/@media\(max-width:410px\)/);
 assert.match(css,/#explore-street\[hidden\]/);
 assert.match(css,/\.pixel-avatar/);
 assert.doesNotMatch(js,/Math\.random\(\)/);
 assert.doesNotMatch(directory,/免登入/);
});

test("game assets are versioned and deployed under both /booking and /saas",()=>{
 assert.match(directory,/href="\.\/explore-game\.css"/);
 assert.match(directory,/src="\.\/explore-game\.js"/);
 assert.match(build,/src, "explore-game\.css"/);
 assert.match(build,/src, "explore-game\.js"/);
 assert.match(publish,/node --check store-operations\/saas\/explore-game\.js/);
 assert.match(publish,/explore-game\.css explore-game\.js/);
 assert.match(publish,/for product in booking saas/);
 for(const [label,code,flags] of [["directory",directory.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1],["--input-type=module","--check"]],["game",js,["--check"]]]){
  assert.ok(code,label+" script missing");
  const out=spawnSync(process.execPath,flags,{input:code,encoding:"utf8"});
  assert.equal(out.status,0,label+": "+out.stderr);
 }
});

test("game shop links reuse existing OA-specific booking routes",()=>{
 assert.match(directory,/reserve_href:customerUrl\(shop\.slug,"reserve",shop\.oa_mode\)/);
 assert.match(directory,/queue_href:customerUrl\(shop\.slug,"queue",shop\.oa_mode\)/);
 assert.match(directory,/board_href:"\.\/board\.html\?merchant="\+encodeURIComponent\(shop\.slug\)/);
 assert.match(js,/if\(shop\.modules\?\.reservation\)/);
 assert.match(js,/if\(shop\.modules\?\.queue\)/);
 assert.match(js,/shop\.test_board_only\)/);
 assert.match(directory,/selected\?\.oa_mode==="PLATFORM"/);
 assert.match(directory,/if\(original\.searchParams\.get\("view"\)!=="customer"\)return/);
});
