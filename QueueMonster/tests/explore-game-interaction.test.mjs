import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import vm from "node:vm";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const html=readFileSync(path.join(root,"saas/directory.html"),"utf8");
const handler=html.match(/<script>\s*\/\* Preserve every published personal-history URL\. \*\/([\s\S]*?)<\/script>/)?.[1];
assert.ok(handler,"Missing legacy directory URL handling");
function redirect(search){
 const targets=[];
 const location={search,href:"https://hub-google.github.io/LINE/booking/directory.html"+search,replace(u){targets.push(String(u))}};
 vm.runInNewContext(handler,{location,URLSearchParams,URL},{timeout:1000});
 return targets;
}
test("retired game links go to ordinary merchant search",()=>{
 const [url]=redirect("?mode=game&service=%E9%A0%90%E7%B4%84&section=shop");
 const target=new URL(url);
 assert.equal(target.pathname,"/LINE/booking/directory.html");
 assert.equal(target.searchParams.get("mode"),"search");
 assert.equal(target.searchParams.get("service"),"預約");
 assert.equal(target.searchParams.has("section"),false);
});
test("old cross-store history links are preserved",()=>{
 for(const mode of ["mine","last-board"]){
  const [url]=redirect("?mode="+mode+"&section=order");
  const target=new URL(url);
  assert.equal(target.pathname,"/LINE/booking/my-records.html");
  assert.equal(target.searchParams.has("mode"),false);
 }
});
test("normal search and queue links never redirect",()=>{
 for(const q of ["","?mode=search","?mode=queue"])assert.deepEqual(redirect(q),[]);
});
