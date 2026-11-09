import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "./helpers/source-fs.mjs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {spawnSync} from "node:child_process";

const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const directory=readFileSync(path.join(base,"saas/directory.html"),"utf8");
const publicBoardSql=readFileSync(path.join(base,"supabase/migrations/20261105132500_public_queue_board_without_login.sql"),"utf8");

test("public search lists published merchants and preserves unauthenticated board access",()=>{
 assert.match(directory,/sb\.rpc\("so_public_directory",\{p_query:null,p_mode:/);
 assert.match(directory,/sb\.rpc\("so_public_popular_stores"/);
 assert.doesNotMatch(directory,/test_board_only|qa-84b3ef9297eb470685a91a527ca499ca/);
 assert.match(directory,/公開叫號看板/);
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
 assert.match(directory,/預約及取號才需 LINE 身分驗證/);
 assert.match(directory,/so_public_directory/);
});

test("directory cards are styled and fully clickable on mobile and desktop",()=>{
 const style=directory.match(/<style>([\s\S]*?)<\/style>/)?.[1];
 assert.ok(style);
 assert.match(style,/\.merchant-card\{/);
 assert.match(style,/\.card-cover\{/);
 assert.match(style,/\.card-actions\{/);
 assert.match(style,/@media\(max-width:760px\)/);
 assert.match(style,/@media\(max-width:410px\)/);
 assert.match(directory,/class="card-cover"/);
 assert.match(directory,/class="merchant-card/);
 assert.match(directory,/const cover=primaryHref/);
 assert.match(directory,/primaryHref=services\.reservation\?reserveHref:services\.queue\?queueHref:""/);
 assert.match(directory,/services\.queue&&services\.calling/);
 assert.doesNotMatch(style,/border-color:var\(--brand\}/);
});


test("public pages avoid redundant login-status labels on links and buttons",()=>{
 const pages=readdirSync(path.join(base,"saas")).filter(x=>x.endsWith(".html"));
 for(const name of pages){
  const markup=readFileSync(path.join(base,"saas",name),"utf8");
  assert.doesNotMatch(markup,/\u514d\u767b\u5165/,name+" should use concise public board naming");
 }
});
