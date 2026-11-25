import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import {chromium} from "./node_modules/playwright/index.mjs";

const dist=path.resolve(process.argv[2]||"line-saas-dist");
const screenshots=path.resolve(process.argv[3]||"password-recovery-screenshots");
fs.mkdirSync(screenshots,{recursive:true});
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",
 ".css":"text/css; charset=utf-8",".svg":"image/svg+xml",".json":"application/json"};
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,"http://localhost").pathname;
 const relative=decodeURIComponent(pathname.replace(/^\/booking\//,""));
 const file=path.resolve(dist,relative);
 if(!file.startsWith(dist+path.sep)){res.writeHead(403).end();return;}
 try{res.setHeader("Content-Type",mime[path.extname(file)]||"application/octet-stream");res.end(fs.readFileSync(file));}
 catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const base="http://127.0.0.1:"+server.address().port+"/booking/";
let browser;
try{
 browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||"chromium",headless:true});
 const createPage=async(viewport)=>{
  const context=await browser.newContext({viewport});
  const page=await context.newPage();
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.route("https://cdn.jsdelivr.net/**",route=>route.fulfill({
   status:200,contentType:"text/javascript",
   headers:{"access-control-allow-origin":"*"},
   body:`export function createClient(){
     window.__recoveryMock={passwordWrites:[],signouts:0};
     return {auth:{
       onAuthStateChange(callback){queueMicrotask(()=>callback("PASSWORD_RECOVERY",{access_token:"mock-valid-session"}));return{data:{subscription:{unsubscribe(){}}}};},
       async getSession(){return{data:{session:{access_token:"mock-valid-session",user:{id:"test-user"}}},error:null};},
       async getUser(){return{data:{user:{id:"test-user"}},error:null};},
       async updateUser({password}){window.__recoveryMock.passwordWrites.push(password.length);return{error:null};},
       async signOut(){window.__recoveryMock.signouts++;return{error:null};}
     }};
   }`
  }));
  return {context,page,errors};
 };
 const desktop=await createPage({width:1300,height:830});
 await desktop.page.goto(base+"merchant-register.html?mode=login&intent=recovery#access_token=dummy&refresh_token=dummy&type=recovery",{waitUntil:"domcontentloaded"});
 await desktop.page.locator("#reset-form").waitFor({state:"visible",timeout:12000});
 assert.ok(new URL(desktop.page.url()).pathname.endsWith("/password-reset.html"),
  "Previously sent password recovery links must jump to the standalone page");
 assert.equal(new URL(desktop.page.url()).hash,"","Sensitive recovery hash must be cleared");
 assert.equal(await desktop.page.locator("#reset-loading").isVisible(),false);
 assert.equal(await desktop.page.locator("#new-password").isVisible(),true);
 await desktop.page.screenshot({path:path.join(screenshots,"desktop-reset-form.png"),fullPage:true});
 await desktop.page.locator("#new-password").fill("ResetDemoPassword123");
 await desktop.page.locator("#confirm-password").fill("MismatchPassword123");
 await desktop.page.locator("#reset-submit").click();
 assert.match(await desktop.page.locator("#reset-error").textContent(),/不一致/);
 assert.deepEqual(await desktop.page.evaluate(()=>window.__recoveryMock.passwordWrites),[],
  "A mismatch must not call updateUser");
 await desktop.page.locator("#confirm-password").fill("ResetDemoPassword123");
 await desktop.page.locator("#reset-submit").click();
 await desktop.page.locator("#reset-success").waitFor({state:"visible",timeout:8000});
 assert.deepEqual(await desktop.page.evaluate(()=>window.__recoveryMock.passwordWrites),[20]);
 assert.equal(await desktop.page.evaluate(()=>window.__recoveryMock.signouts),1);
 await desktop.page.screenshot({path:path.join(screenshots,"desktop-reset-success.png"),fullPage:true});
 assert.deepEqual(desktop.errors,[],"No browser runtime errors on valid recovery");
 await desktop.context.close();

 const mobile=await createPage({width:390,height:844});
 await mobile.page.goto(base+"password-reset.html?mode=login&intent=recovery#access_token=dummy&refresh_token=dummy&type=recovery",{waitUntil:"domcontentloaded"});
 await mobile.page.locator("#reset-form").waitFor({state:"visible",timeout:12000});
 assert.equal(await mobile.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,
  "Password reset form must not overflow the mobile viewport");
 await mobile.page.screenshot({path:path.join(screenshots,"mobile-reset-form.png"),fullPage:true});
 assert.deepEqual(mobile.errors,[]);
 await mobile.context.close();

 const invalid=await createPage({width:390,height:844});
 await invalid.page.goto(base+"password-reset.html?intent=recovery",{waitUntil:"domcontentloaded"});
 await invalid.page.locator("#reset-invalid").waitFor({state:"visible",timeout:8000});
 assert.equal(await invalid.page.locator("#reset-form").isVisible(),false);
 assert.deepEqual(await invalid.page.evaluate(()=>window.__recoveryMock?.passwordWrites||[]),[]);
 await invalid.page.screenshot({path:path.join(screenshots,"mobile-expired-link.png"),fullPage:true});
 await invalid.context.close();

 console.log("PASS: Chromium recovered legacy email link, mobile/desktop new password form, mismatch guard, successful updateUser and expired-link states.");
 console.log("PASS: 4 screenshots written to "+screenshots);
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
