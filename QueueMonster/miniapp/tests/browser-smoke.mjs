import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from '../../../.github/frontend/node_modules/playwright/index.mjs';

// Browser integration against separately bundled MINI files; remote services mocked.
const root=path.resolve(process.argv[2]||'queue-mini-dist');
const server=createServer((req,res)=>{
 const prefix='/LINE/queue-mini/';
 let uri=decodeURIComponent(new URL(req.url,'http://local').pathname);
 if(!uri.startsWith(prefix)){res.writeHead(404).end();return;}
 uri=uri.slice(prefix.length);
 if(uri.endsWith('/'))uri+='index.html';
 const file=path.resolve(root,uri);
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 try{
  const type={'.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml',
   '.html':'text/html','.json':'application/json','.png':'image/png'}[path.extname(file)]||'application/octet-stream';
  res.writeHead(200,{'content-type':type});res.end(fs.readFileSync(file));
 }catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base='http://127.0.0.1:'+server.address().port+'/LINE/queue-mini/';
const mockSupabase="const merchant={slug:'greenfield-salon',name:'綠野沙龍',description:'MINI 測試店家',category:'美髮',modules:{reservation:true,queue:true,pickup:true,calling:true},oa_mode:'PLATFORM',booking_count:2,ticket_count:3,order_count:4,popularity_rank:1};const session={access_token:'mock-jwt',user:{id:'mini-test-user',is_anonymous:true}};export function createClient(){return {auth:{getSession:async()=>({data:{session},error:null}),signInAnonymously:async()=>({data:{session},error:null}),signOut:async()=>({error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},rpc:async(n)=>{if(n==='so_public_directory'||n==='so_public_popular_stores')return {data:[merchant],error:null};if(n==='so_public_store_search')return {data:{items:[merchant],total:1},error:null};if(n==='so_mini_header_identity')return {data:{display_name:'測試會員'},error:null};if(n==='so_mini_platform_records_page')return {data:[],error:null};if(n==='so_public_state')return {data:{tenant:{...merchant,menu_booking_mode:'OPTIONAL',menu_queue_mode:'OPTIONAL',open_time:'08:00',close_time:'20:00'},slots:[],menu_items:[],my_reservations:[],my_tickets:[],today:'2026-11-17',date:'2026-11-17',current:null,waiting:0},error:null};if(n==='so_pickup_public')return {data:{settings:{enabled:false},items:[]},error:null};if(n==='so_unit_config')return {data:{units:[],sessions:[],multi:false},error:null};if(n==='so_unit_records')return {data:{reservations:[],tickets:[]},error:null};if(n==='so_public_announcements')return {data:[],error:null}; return {data:null,error:null};},channel:()=>({on(){return this},subscribe(){return this},unsubscribe(){}}),removeChannel:async()=>{}};}";

const ids={developing:'2012649101-EFX2gymX',review:'2012649102-rNb39YpL',published:'2012649103-s6KPdX4H'};
let browser;
try{
 browser=await chromium.launch({headless:true,channel:'chromium'});
 for(const env of Object.keys(ids)){
  const ctx=await browser.newContext({viewport:{width:390,height:844}}),page=await ctx.newPage();
  const failures=[];page.on('pageerror',e=>failures.push(e.message));
  page.on('response',r=>{if(r.url().startsWith(base)&&r.status()===404)failures.push('404 '+r.url())});
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm',r=>
    r.fulfill({status:200,contentType:'application/javascript',headers:{'access-control-allow-origin':'*'},body:mockSupabase}));
  await page.route('https://static.line-scdn.net/liff/edge/2/sdk.js',r=>
    r.fulfill({status:200,contentType:'application/javascript',body:
      'window.liff={init:async()=>({}),isInClient:()=>true,isLoggedIn:()=>true,'+
      'getIDToken:()=>"mock-id-token",getAccessToken:()=>"mock-access-token"};'}));
  await page.route('https://unapiwajmgqqtdkixaab.supabase.co/functions/v1/**',r=>
    r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},
      body:JSON.stringify(r.request().method()==='POST'?{linked:true,displayName:'測試會員',ok:true}:
        {liffId:ids[env],loginReady:true,messagingReady:false})}));
  await page.goto(base+env+'/directory.html?mode=search',{waitUntil:'domcontentloaded'});
  await page.locator('.qm-mini-bottom a').first().waitFor();
  await page.locator('.merchant-card').first().waitFor({timeout:12000});
  assert.equal(await page.locator('.merchant-card .shop-name').first().innerText(),'綠野沙龍');
  assert.equal(await page.locator('.qm-mini-bottom a').count(),3);
  for(const label of ['立即預約','現場取號','立即點餐'])
    assert.ok(await page.getByRole('link',{name:label,exact:true}).count()>0,label+' missing');
  await page.locator('.qm-mini-bottom a').nth(2).click();
  await page.waitForURL('**/'+env+'/my-records.html');
  await page.locator('#results-heading:has-text("我的紀錄")').waitFor();
  await page.goto(base+env+'/?view=customer&merchant=greenfield-salon&tab=reserve',
    {waitUntil:'domcontentloaded'});
  await page.locator('.qm-mini-header').waitFor();
  assert.match(page.url(),new RegExp('/queue-mini/'+env+'/'));
  assert.deepEqual(failures,[],env+' browser errors');
  console.log(env+' MINI browser smoke passed');
  await ctx.close();
 }
}finally{await browser?.close();await new Promise(r=>server.close(r));}
