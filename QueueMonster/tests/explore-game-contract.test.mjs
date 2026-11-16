import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(path.join(root,p),"utf8");
const html=read("saas/directory.html"),js=read("saas/assets/directory/main.js"),css=read("saas/assets/directory/page.css");
const build=read("../.github/scripts/build-line-saas.mjs"),work=read("../.github/workflows/line-saas-pages.yml");
test("retired pixel-city game is no longer publicly rendered, loaded or published",()=>{
 for(const old of ['id="explore-switch-game"','id="explore-game"','id="explore-world"','./explore-game.js','./explore-game.css'])
  assert.ok(!html.includes(old),old);
 assert.doesNotMatch(js,/LineExploreGame|publishGameDirectory|遊戲逛街|像素城市/);
 assert.doesNotMatch(build,/explore-game\.(css|js)/);
 assert.doesNotMatch(work,/node --check QueueMonster\/saas\/explore-game\.js|cp .*explore-game/);
 assert.match(work,/rm -f .*explore-game\.js/);
 assert.match(html,/oldMode==="game"/);
 assert.match(html,/query\.set\("mode","search"\)/);
});
test("normal merchant discovery, filters and booking actions are still supported",()=>{
 for(const name of ["keyword","explore-category","explore-area","explore-service","explore-sort","results","result-pages"])
  assert.ok(html.includes('id="'+name+'"'),name);
 for(const rpc of ["so_public_directory","so_public_store_search","so_public_popular_stores"])
  assert.ok(js.includes(rpc),rpc);
 for(const route of ['"reserve"','"queue"','"order"'])assert.ok(js.includes(route),route);
 for(const rule of [".explore-filter-row{",".explore-filter-row label{",".explore-filter-row select{"])
  assert.ok(css.includes(rule),rule);
});
