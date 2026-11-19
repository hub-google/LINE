import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createHmac } from 'node:crypto';
import { once } from 'node:events';
import { AntiScamLineJsBridge, createBridgeServer } from '../bridge.js';

const room = 'mABCDEF01234567890123';
const user = 'pABCDEF01234567890123';
class FakeSocket extends EventEmitter {
  readyState = 1;
  sent = [];
  send(text) { this.sent.push(JSON.parse(text)); this.emit('sent', this.sent.at(-1)); }
}
function setup({live = false, actionEnabled = false} = {}) {
  const incoming = [];
  const bridge = new AntiScamLineJsBridge({
    allowedChats: [room],
    token: 'bridge-secret-long-enough',
    webhookSecret: 'hmac-secret-long-enough-1234',
    lineJsToken: 'upstream-token-long-enough',
    antiScamUrl: 'http://127.0.0.1:3000',
    liveVerified: live,
    actionsEnabled: actionEnabled,
    protectedMembers: ['pPROTECTED0123456789'],
    fetcher: async (url, opts) => { incoming.push({url,opts});return {ok:true,status:200}; }
  });
  const socket = bridge.attachSocket(new FakeSocket());
  socket.emit('open');
  return {bridge,socket,incoming};
}
async function receiveMessage(bridge, overrides = {}) {
  await bridge.receive(JSON.stringify({type: 'message', message:{
    channelId:room, channelKind:'square', senderId:user, messageId:'1234567890',
    contentType:'TEXT', text:'匯款前確認', ...overrides
  }}));
}
test('default: even connected upstream cannot advertise unverified destructive actions', async () => {
  const {bridge,socket} = setup();
  await bridge.receive(JSON.stringify({type:'auth:ready',profile:{userId:'uME123456789012345'}}));
  assert.equal(socket.readyState,1);
  assert.equal(bridge.capabilities().verified,false);
  assert.equal(bridge.capabilities().capabilities.deleteOtherMessage,false);
  assert.equal(bridge.capabilities().capabilities.blockMember,false);
  const r = await bridge.action({type:'send_notice', communityId:room, notice:'請勿提供驗證碼', actionKey:'test:notice'});
  assert.equal(r.ok,false);
  assert.equal(socket.sent.length,0);
});
test('ingest accepts scoped square text, preserves admin role, signs webhook and rejects other rooms', async () => {
  const {bridge,incoming} = setup();
  await bridge.receive(JSON.stringify({type:'auth:ready',profile:{userId:'uME123456789012345'}}));
  await receiveMessage(bridge,{senderRole:'coAdmin'});
  assert.equal(incoming.length,1);
  const {url,opts} = incoming[0];
  assert.equal(url,'http://127.0.0.1:3000/webhooks/openchat');
  assert.equal(JSON.parse(opts.body).memberRole,'admin');
  const expected=`sha256=${createHmac('sha256','hmac-secret-long-enough-1234').update(`${opts.headers['x-antiscam-timestamp']}.${opts.body}`).digest('hex')}`;
  assert.equal(opts.headers['x-antiscam-signature'],expected);
  await receiveMessage(bridge,{channelId:'mOTHER000000000000001'});
  await bridge.receive(JSON.stringify({type:'messages',chatId:room,messages:[]}));
  assert.equal(incoming.length,1);
});
test('no member removal of co-admin or protected member even if upstream marked them', async () => {
  const {bridge} = setup({live:true,actionEnabled:true});
  await bridge.receive(JSON.stringify({type:'auth:ready',profile:{userId:'uME123456789012345'}}));
  await receiveMessage(bridge,{senderRole:'admin'});
  let res = await bridge.action({type:'remove_member',communityId:room,messageId:'1234567890',memberId:user,actionKey:'1:remove'});
  assert.equal(res.ok,false);
  await receiveMessage(bridge,{senderRole:undefined,senderId:'pPROTECTED0123456789',messageId:'1234567891'});
  res = await bridge.action({type:'remove_member',communityId:room,messageId:'1234567891',memberId:'pPROTECTED0123456789',actionKey:'2:remove'});
  assert.equal(res.ok,false);
});
test('live delete confirms only after matching LINE.js ack and stays idempotent', async () => {
  const {bridge,socket} = setup({live:true,actionEnabled:true});
  await bridge.receive(JSON.stringify({type:'auth:ready',profile:{userId:'uME123456789012345'}}));
  await receiveMessage(bridge);
  assert.equal(bridge.capabilities().capabilities.blockMember,false);
  const args={type:'delete_message',communityId:room,messageId:'1234567890',actionKey:'e3:delete_message'};
  const pending=bridge.action(args);
  assert.equal(socket.sent.length,1);
  const frame=socket.sent[0];
  assert.equal(frame.type,'message:delete');
  await bridge.receive(JSON.stringify({type:'message:deleted',requestId:frame.requestId,chatId:room,messageId:'1234567890'}));
  assert.equal((await pending).confirmed,true);
  assert.equal((await bridge.action(args)).confirmed,true);
  assert.equal(socket.sent.length,1);
});
test('member removal targets message sender, not arbitrary ID', async () => {
  const {bridge,socket} = setup({live:true,actionEnabled:true});
  await bridge.receive(JSON.stringify({type:'auth:ready',profile:{userId:'uME123456789012345'}}));
  await receiveMessage(bridge);
  const bad=await bridge.action({type:'remove_member',communityId:room,messageId:'1234567890',memberId:'pOTHER111111111111111',actionKey:'e4:remove'});
  assert.equal(bad.ok,false);
  assert.equal(socket.sent.length,0);
  const task=bridge.action({type:'remove_member',communityId:room,messageId:'1234567890',memberId:user,actionKey:'e5:remove'});
  const f=socket.sent.at(-1);
  assert.equal(f.type,'member:remove');
  assert.equal(f.deleteMessage,false);
  await bridge.receive(JSON.stringify({type:'member:removed',requestId:f.requestId,chatId:room,messageId:'1234567890',memberId:user,messageDeleted:false}));
  assert.equal((await task).confirmed,true);
});
test('block rejoin is explicitly unsupported and never sent', async () => {
  const {bridge,socket} = setup({live:true,actionEnabled:true});
  await bridge.receive(JSON.stringify({type:'auth:ready',profile:{userId:'uME123456789012345'}}));
  await receiveMessage(bridge);
  const r=await bridge.action({type:'block_member',communityId:room,messageId:'1234567890',memberId:user,actionKey:'e6:block'});
  assert.equal(r.ok,false);
  assert.equal(socket.sent.length,0);
});
test('REST capabilities requires a secret; action key header checked', async t => {
  const {bridge} = setup();
  const server=createBridgeServer(bridge);
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(()=>server.close());
  const base=`http://127.0.0.1:${server.address().port}`;
  let res=await fetch(base+'/v1/capabilities');
  assert.equal(res.status,401);
  res=await fetch(base+'/v1/capabilities',{headers:{authorization:'Bearer bridge-secret-long-enough'}});
  assert.equal(res.status,200);
  assert.equal((await res.json()).verified,false);
  res=await fetch(base+'/v1/actions',{method:'POST',headers:{authorization:'Bearer bridge-secret-long-enough','content-type':'application/json','idempotency-key':'one'},body:JSON.stringify({type:'send_notice',actionKey:'two'})});
  assert.equal(res.status,400);
});
test('socket closes: pending actions fail, capability degrades', async () => {
  const {bridge,socket} = setup({live:true,actionEnabled:true});
  await bridge.receive(JSON.stringify({type:'auth:ready',profile:{userId:'uME123456789012345'}}));
  await receiveMessage(bridge);
  const task=bridge.action({type:'delete_message',communityId:room,messageId:'1234567890',actionKey:'f1:delete'});
  socket.emit('close');
  assert.equal((await task).confirmed,false);
  assert.equal(bridge.capabilities().verified,false);
});
