import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "./node_modules/playwright/index.mjs";
const dist=path.resolve(process.argv[2]), out=path.resolve(process.argv[3]);
fs.mkdirSync(out,{recursive:true});
const mime={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".svg":"image/svg+xml",".png":"image/png"};
const server=http.createServer((req,res)=>{
 const file=path.resolve(dist,"."+new URL(req.url,"http://local").pathname);
 if(!file.startsWith(dist+path.sep)){res.writeHead(403).end();return;}
 try{res.setHeader("Content-Type",mime[path.extname(file)]||"application/octet-stream");res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
let browser;
try{
 browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||"chromium",headless:true});
 const page=await browser.newPage({viewport:{width:1686,height:900}});
 await page.goto("http://127.0.0.1:"+server.address().port+"/queue-preview.html");
 const frame=page.frameLocator("#board-preview");
 async function verify(current,upcoming,count){
  await frame.locator("#current").filter({hasText:current}).waitFor({timeout:20000});
  await frame.locator("#upcoming li").first().waitFor({timeout:20000});
  const deadline=Date.now()+10000;let rows;
  do{rows=await frame.locator("#upcoming li").allTextContents();if(JSON.stringify(rows)===JSON.stringify(upcoming))break;await page.waitForTimeout(100);}while(Date.now()<deadline);
  assert.deepEqual(rows,upcoming);
  assert.ok((await frame.locator(".panel.next .label").innerText()).includes(count+" 組等候"));
  await page.waitForTimeout(200);
  const layout=await frame.locator("#upcoming").evaluate(el=>[...el.children].map(li=>{const range=document.createRange();range.selectNodeContents(li);return {row:li.getBoundingClientRect().height,text:range.getBoundingClientRect().height}}));
  assert.ok(layout.every(x=>x.row>=x.text-2),JSON.stringify(layout));
  console.log("Queue preview verified:",current,rows,count,layout);
 }
 await verify("A012",["A013","A014"],8);
 await page.screenshot({path:path.join(out,"queue-preview-initial.png")});
 await page.locator('#staff-root [data-act="call"]').click();
 await verify("A013",["A014","A015"],7);
 await page.screenshot({path:path.join(out,"queue-preview-after-call.png")});
 await page.locator("#reset-preview").click();
 await verify("A012",["A013","A014"],8);
}finally{await browser?.close();server.close();}
