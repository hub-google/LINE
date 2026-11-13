import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "./helpers/source-fs.mjs";
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
 assert.match(app,/function merchantProfileFields\(prefix,tenant=\{\}\)/);
 assert.match(app,/prefix\+'-directory-category/);
 assert.ok(app.includes('merchantProfileFields("set",t)'));
 assert.match(app,/directory_category:val\(prefix\+"-directory-category"\)/);
 assert.match(directory,/id="explore-category"/);
 assert.match(directory,/id="explore-area"/);
 assert.match(directory,/id="explore-service"/);
 assert.match(directory,/id="explore-sort"/);
 assert.match(directory,/function areaOf\(shop\)/);
 assert.match(directory,/function serviceMatches\(shop,service\)/);
 assert.match(directory,/so_public_directory/);
 assert.match(directory,/filtered=searchResults;/);
 assert.doesNotMatch(directory,/testMatches|test_board_only/);
});

test("game mode opens the illustrated city directly and supports animated shop interiors",()=>{
 assert.match(directory,/id="explore-switch-game"/);
 assert.match(directory,/id="explore-world"/);
 assert.match(directory,/id="arcade-city-svg"/);
 assert.match(directory,/id="arcade-map-pins"/);
 assert.match(directory,/id="arcade-zoom-in"/);
 assert.match(directory,/id="arcade-zoom-out"/);
 assert.match(directory,/id="arcade-zoom-reset"/);
 assert.match(directory,/id="explore-street"/);
 assert.match(directory,/id="arcade-room-art"/);
 assert.match(directory,/id="arcade-room-avatar"/);
 assert.match(directory,/data-map-pan="up"/);
 assert.match(directory,/data-walk="left"/);
 assert.doesNotMatch(directory,/id="arcade-regions"/);
 assert.match(read("saas/assets/directory/main.js"),/mode=\["search","queue","mine","game","last-board"\]/);
 assert.match(directory,/LineExploreGame\?\.setData/);
 assert.match(js,/function showWorld\(\)/);
 assert.match(js,/function renderPins\(\)/);
 assert.match(js,/function enterShop\(shop\)/);
 assert.match(js,/function roomSvg\(shop\)/);
 assert.match(js,/data-shop-slug/);
 assert.match(js,/event\.key==="ArrowLeft"/);
 assert.match(js,/event\.key==="ArrowRight"/);
 assert.match(js,/pointermove/);
 assert.match(js,/wheel/);
 assert.doesNotMatch(js,/test_board_only|qaStore|demoShops|Math\.random\(\)/);
 assert.match(js,/shops=Array\.isArray\(publicShops\)/);
 assert.match(css,/@media\(max-width:740px\)/);
 assert.match(css,/@media\(max-width:410px\)/);
 assert.match(css,/#explore-street\[hidden\]/);
 assert.match(css,/\.arcade-room-avatar/);
 assert.match(css,/\.arcade-service-dock\{/);
 assert.match(css,/position:fixed/);
 assert.match(css,/\.arcade-panel-actions a\.btn/);
 assert.match(directory,/id="arcade-shop-info"[^>]*role="region"/);
 assert.match(js,/data-arcade-service/);
 assert.match(css,/prefers-reduced-motion/);
 const gameSection=directory.slice(directory.indexOf('<section id="explore-game"'),
  directory.indexOf('<p id="explore-game-note"'));
 assert.doesNotMatch(gameSection,/免登入|線上商圈/);
});

test("game assets are versioned and deployed under both /booking and /saas",()=>{
 assert.match(directory,/href="\.\/explore-game\.css"/);
 assert.match(directory,/src="\.\/explore-game\.js"/);
 assert.match(build,/src, "explore-game\.css"/);
 assert.match(build,/src, "explore-game\.js"/);
 assert.match(publish,/node --check QueueMonster\/saas\/explore-game\.js/);
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
 assert.match(directory,/order_href:customerUrl\(shop\.slug,"order",shop\.oa_mode\)/);
 assert.doesNotMatch(js,/shop\.test_board_only\)/);
 assert.match(directory,/selected\?\.oa_mode==="PLATFORM"/);
 assert.match(directory,/if\(original\.searchParams\.get\("view"\)!=="customer"\)return/);
});

test("default merchant list is server-ranked Top 50; search uses separate paginated real results",()=>{
 const ranking=read("supabase/migrations/20261105171000_public_store_popularity_rank.sql");
 assert.match(directory,/id="results-heading">熱門店家排行/);
 assert.match(directory,/so_public_popular_stores/);
 assert.match(directory,/so_public_store_search/);
 assert.match(directory,/p_limit:50/);
 assert.match(directory,/p_page:searchPage/);
 assert.match(directory,/<option value="popular">熱門排行<\/option>/);
 assert.match(directory,/document\.getElementById\("explore-sort"\)\.value!=="popular"/);
 const popularSort=read("supabase/migrations/20261105174500_public_store_search_popularity_default.sql");
 const signedDelta=read("supabase/migrations/20261105173500_public_store_popularity_signed_delta_fix.sql");
 assert.match(popularSort,/p_sort text default 'popular'/);
 assert.match(popularSort,/popularity_score end desc nulls last/);
 assert.match(signedDelta,/greatest\(p_delta,0\)/);
 assert.match(directory,/searchCriteria\(\)/);
 assert.match(directory,/filtered=popular\.slice\(0,50\)/);
 assert.match(directory,/filtered=searchResults;/);
 assert.doesNotMatch(directory,/testMatches|test_board_only/);
 assert.match(directory,/searchPage\*50>=searchTotal/);
 assert.match(directory,/searchLoading/);
 assert.match(directory,/人氣|近30天|近 30 天/);
 assert.match(ranking,/private\.so_store_activity_daily/);
 assert.match(ranking,/so_reservation_activity_daily/);
 assert.match(ranking,/so_ticket_activity_daily/);
 assert.match(ranking,/old\.status <> 'CANCELLED'/);
 assert.match(ranking,/old\.reservation_id is null/);
 const latest=read("supabase/migrations/20261109161500_metadata_based_test_scoping.sql");
 assert.match(latest,/is_test_tenant/);
 assert.doesNotMatch(latest,/slug\s+(?:not\s+)?like\s+\x27qa-%\x27/);
 assert.match(ranking,/t\.directory_enabled=true/);
 assert.match(ranking,/limit least\(greatest\(coalesce\(p_limit,50\),1\),50\)/);
 assert.match(ranking,/and a\.activity_date between/);
 assert.match(ranking,/grant execute on function public\.so_public_store_search/);
 assert.doesNotMatch(directory,/service_role/);
});
