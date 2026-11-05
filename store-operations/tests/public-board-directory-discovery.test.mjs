import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {spawnSync} from "node:child_process";

const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const directory=readFileSync(path.join(base,"saas/directory.html"),"utf8");
const publicBoardSql=readFileSync(path.join(base,"supabase/migrations/20261105132500_public_queue_board_without_login.sql"),"utf8");

test("public search discovers real named QA board without mixing it into official directory",()=>{
 assert.match(directory,/qa-84b3ef9297eb470685a91a527ca499ca/);
 assert.match(directory,/sb\.rpc\("so_public_board",\{p_slug:qaSlug,p_limit:5\}\)/);
 assert.match(directory,/testBoardShop=\{slug:qaSlug,name:boardResponse\.data\.shop_name/);
 assert.match(directory,/const testMatches=mode!=="mine"&&keyword&&testBoardShop/);
 assert.match(directory,/const filtered=\[\.\.\.official,\.\.\.testMatches\]/);
 assert.match(directory,/test_board_only\?'<span class="badge">測試門市・非正式合作店家<\/span>'/);
 assert.match(directory,/查看即時叫號看板（免登入）/);
 assert.match(directory,/if\(t\.test_board_only\)/);
 assert.match(directory,/if\(original\.searchParams\.get\("view"\)!=="customer"\)return/);
 assert.match(publicBoardSql,/grant execute on function public\.so_public_board\(text,integer\) to anon,authenticated/);
});
test("search directory remains syntactically valid and distinguishes reservation identity",()=>{
 const scripts=[...directory.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,1);
 const result=spawnSync(process.execPath,["--input-type=module","--check"],{
   input:scripts[0][1],encoding:"utf8"
 });
 assert.equal(result.status,0,result.stderr);
 assert.match(directory,/預約時透過 LINE 驗證身分，並填寫姓名及聯絡手機/);
 assert.match(directory,/so_public_directory/);
});
