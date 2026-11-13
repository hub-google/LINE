import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {requestBookingReply} from '../saas/app/booking-line-reply.js';
const id='12345678-1234-1234-1234-123456789abc';
const own={merchantOaConnected:true,fromMerchantChat:true,expectedLiffId:'1234567890-AbcdEfgh'};
test('eligible LIFF sends exactly one text command after booking',async()=>{
 const sent=[];
 const result=await requestBookingReply({id:own.expectedLiffId,isInClient:()=>true,getContext:()=>({type:'utou'}),sendMessages:async x=>sent.push(x)},id,own);
 assert.equal(result.requested,true);assert.deepEqual(sent,[[{type:'text',text:'確認預約 '+id}]]);
});
test('external browser, QR context and group never send booking information',async()=>{
 for(const liff of [undefined,{isInClient:()=>false},{isInClient:()=>true,getContext:()=>({type:'none'})},{isInClient:()=>true,getContext:()=>({type:'group'})}]){
  assert.equal((await requestBookingReply(liff,id,own)).requested,false);
 }
});
test('SDK rejection preserves a retry command without a push fallback',async()=>{
 const result=await requestBookingReply({id:own.expectedLiffId,isInClient:()=>true,getContext:()=>({type:'utou'}),sendMessages:async()=>{throw Error('403')}},id,own);
 assert.equal(result.requested,false);assert.equal(result.command,'確認預約 '+id);
 await assert.rejects(()=>requestBookingReply(null,'bad-id'));
});
test('platform OA, missing merchant chat and mismatched LIFF never auto-send',async()=>{
 const sent=[];
 const sdk={id:'9999999999-Other',isInClient:()=>true,getContext:()=>({type:'utou'}),sendMessages:async x=>sent.push(x)};
 assert.equal((await requestBookingReply(sdk,id)).requested,false);
 assert.equal((await requestBookingReply(sdk,id,{merchantOaConnected:true})).requested,false);
 assert.equal((await requestBookingReply(sdk,id,own)).requested,false);
 assert.equal(sent.length,0);
});
test('shared LIFF can send from merchant chat without merchant-specific LIFF ID',async()=>{
 const sent=[];
 const sdk={id:'1234567890-AbcdEfgh',isInClient:()=>true,getContext:()=>({type:'utou'}),sendMessages:async messages=>sent.push(messages)};
 const result=await requestBookingReply(sdk,id,{merchantOaConnected:true,fromMerchantChat:true,command:'確認預約 '+id+' t12345_signed'});
 assert.equal(result.requested,true);
 assert.equal(sent[0][0].text,'確認預約 '+id+' t12345_signed');
});
test('unit/session bookings use the merchant LIFF reply, not reservation push',()=>{
 const unit=readFileSync(new URL('../saas/app/actions/service-unit-actions.js',import.meta.url),'utf8');
 assert.match(unit,/await sendBookingReply\(result\.id\)/);
 assert.doesNotMatch(unit,/sendLineNotice\("notify-reservation"/);
});
const source=readFileSync(new URL('../supabase/functions/line-bridge/index.ts',import.meta.url),'utf8');
function backend(overrides={}){
 const context={Deno:{env:{get:()=>''},serve:()=>{}},Request,Response,URL,URLSearchParams,TextEncoder,console,crypto,btoa,...overrides};
 vm.createContext(context);
 vm.runInContext(stripTypeScriptTypes(source.replace(/^import .*;\n/gm,''))+'\n globalThis.api={bookingReplyMessage,pushNotice,dispatchOutboxItem,webhook};',context);
 return context;
}
function dbMock({booking,link,tenant,own=null}){
 return {rpc:async()=>({data:own}),from(table){
  const filters=[];const q={select(){return q},eq(k,v){filters.push([k,v]);return q},is(){return q},async maybeSingle(){
   const value=table==='qm_reservations'?booking:table==='qm_line_links'?link:tenant;
   return {data:value&&filters.every(([k,v])=>value[k]===v)?value:null};
  }};return q;
 }};
}
test('backend refuses another customer, tenant, OA, cancelled or deleted booking',async()=>{
 const ctx=backend();
 const booking={id,tenant_id:'shop',user_id:'owner',status:'CONFIRMED'};
 for(const options of [
  {booking,link:null,tenant:null},
  {booking,link:{tenant_id:'shop',user_id:'owner',line_sub:'someone-else'}},
  {booking:{...booking,status:'CANCELLED'},link:null},
  {booking:null,link:null},
  {booking,link:{tenant_id:'shop',user_id:'owner',line_sub:'customer'},own:{token:'own',channelId:'channel'}}
 ]){
  const result=await ctx.api.bookingReplyMessage(dbMock(options),id,'customer',null);
  assert.equal(result.type,'text');assert.match(result.text,/無法取得/);
 }
 const cross=await ctx.api.bookingReplyMessage(dbMock({booking}),id,'customer','other-shop');
 assert.match(cross.text,/無法取得/);
});
test('new reservation push and outbox paths cannot consume LINE push quota',async()=>{
 const ctx=backend({fetch:()=>{throw Error('Unexpected network call')}});
 const db={from(){throw Error('Unexpected database call')}};
 const response=await ctx.api.pushNotice(db,{id:'shop'},'user','RESERVED',id,'message',null);
 assert.equal((await response.json()).reason,'REPLY_REQUIRED');
 const job=await ctx.api.dispatchOutboxItem(db,{event_kind:'RESERVED'},null);
 assert.equal(job.status,'SKIPPED');
});
test('valid owner receives a card through reply endpoint only',async()=>{
 const ctx=backend();
 vm.runInContext('reservationConfirmationNotice=async()=>({type:"flex",altText:"預約已成立"})',ctx);
 const booking={id,tenant_id:'shop',user_id:'owner',status:'CONFIRMED'};
 const db=dbMock({booking,link:{tenant_id:'shop',user_id:'owner',line_sub:'customer'},tenant:{id:'shop',status:'ACTIVE'}});
 const card=await ctx.api.bookingReplyMessage(db,id,'customer',null);
 assert.equal(card.type,'flex');assert.equal(card.altText,'預約已成立');
});

test('merchant provider mismatch is handled by short-lived, merchant-scoped signed confirmation',async()=>{
 const ctx=backend();
 ctx.Deno.env.get=name=>name==="SUPABASE_SERVICE_ROLE_KEY"?"not-a-real-secret-just-a-test-"+'x'.repeat(60):"";
 vm.runInContext('reservationConfirmationNotice=async()=>({type:"flex",altText:"預約已成立"})',ctx);
 const booking={id,tenant_id:'shop',user_id:'owner',status:'CONFIRMED'};
 ctx.proofRecord={id,tenant_id:'shop',user_id:'owner'};
 const proof=await vm.runInContext('issueBookingReplyProof(globalThis.proofRecord)',ctx);
 assert.match(proof,/^t[a-z0-9]+_[a-zA-Z0-9_-]{32}$/);
 const data=dbMock({booking,link:null,tenant:{id:'shop',status:'ACTIVE'}});
 assert.equal((await ctx.api.bookingReplyMessage(data,id,'merchant-user','shop',proof)).type,'flex');
 assert.equal((await ctx.api.bookingReplyMessage(data,id,'merchant-user','other-shop',proof)).type,'text');
 assert.equal((await ctx.api.bookingReplyMessage(data,id,'merchant-user',null,proof)).type,'text');
 assert.equal((await ctx.api.bookingReplyMessage(data,id,'merchant-user','shop',proof.slice(0,-1)+'X')).type,'text');
});
test('signed confirmation webhook calls real reply branch, never push',async()=>{
 const calls=[];
 const ctx=backend({fetch:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return new Response('{}',{status:200})}});
 const booking={id,tenant_id:'shop',user_id:'owner',status:'CONFIRMED'};
 ctx.mockDb=dbMock({booking,link:{tenant_id:'shop',user_id:'owner',line_sub:'U'+'a'.repeat(32)},tenant:{id:'shop',status:'ACTIVE'}});
 vm.runInContext('service=()=>globalThis.mockDb; reservationConfirmationNotice=async()=>({type:"flex",altText:"預約已成立"})',ctx);
 ctx.Deno.env.get=name=>({LINE_MESSAGING_CHANNEL_SECRET:'test-secret',LINE_MESSAGING_ACCESS_TOKEN:'test-token'})[name]||'';
 const body=JSON.stringify({events:[{type:'message',webhookEventId:'event_test_12345',timestamp:Date.now(),source:{type:'user',userId:'U'+'a'.repeat(32)},replyToken:'test-reply',message:{type:'text',text:'確認預約 '+id}}]});
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('test-secret'),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body))).toString('base64');
 const request=new Request('https://example.com?action=webhook',{method:'POST',headers:{'x-line-signature':signature},body});
 const response=await ctx.api.webhook(request,null);
 assert.equal(response.status,200);assert.equal(calls.length,1);
 assert.match(calls[0].url,/\/message\/reply$/);
 assert.equal(calls[0].body.replyToken,'test-reply');assert.equal(calls[0].body.messages[0].type,'flex');
});

test('platform OA signed message uses Reply API, never Push API',async()=>{
 const calls=[];
 const ctx=backend({fetch:async(url,options)=>{
   calls.push({url,headers:options.headers,body:JSON.parse(options.body)});
   return new Response('{}',{status:200});
 }});
 vm.runInContext('service=()=>({})',ctx);
 ctx.Deno.env.get=name=>({LINE_MESSAGING_CHANNEL_SECRET:'platform-webhook-secret',LINE_MESSAGING_ACCESS_TOKEN:'platform-webhook-token'})[name]||'';
 const body=JSON.stringify({destination:'U'+'c'.repeat(32),events:[{
   type:'message',webhookEventId:'platform_event_12345',timestamp:Date.now(),
   source:{type:'user',userId:'U'+'b'.repeat(32)},
   replyToken:'platform-reply-token',message:{id:'1111111111111111',type:'text',text:'測試'}
 }]});
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('platform-webhook-secret'),
  {name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body))).toString('base64');
 const url='https://unapiwajmgqqtdkixaab.supabase.co/functions/v1/line-bridge?action=webhook';
 const invalid=await ctx.api.webhook(new Request(url,{method:'POST',headers:{'x-line-signature':'incorrect'},body}),null);
 assert.equal(invalid.status,401);
 assert.equal(calls.length,0);
 const valid=await ctx.api.webhook(new Request(url,{method:'POST',headers:{'x-line-signature':signature},body}),null);
 assert.equal(valid.status,200);
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,'https://api.line.me/v2/bot/message/reply');
 assert.equal(calls[0].headers.authorization,'Bearer platform-webhook-token');
 assert.equal(calls[0].body.replyToken,'platform-reply-token');
 assert.equal(calls[0].body.messages[0].type,'text');
 assert.match(calls[0].body.messages[0].text,/排隊怪獸/);
});
