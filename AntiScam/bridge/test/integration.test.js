import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStore } from '../../src/store.js';
import { ModerationService } from '../../src/service.js';
import { OpenChatConnector } from '../../src/connector.js';
import { createAppServer } from '../../src/server.js';
import { AntiScamLineJsBridge, createBridgeServer } from '../bridge.js';

const room = 'mABCDEF01234567890123';
const memberId = 'pABCDEF01234567890123';
class FakeSocket extends EventEmitter {
  readyState = 1;
  send(data) { const request = JSON.parse(data); this.emit('sent', request); }
}

test('end to end: simulated LINE.js frame reaches real AntiScam API, then verified acks drive moderation', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'anti-scam-linejs-e2e-'));
  const store = new FileStore(join(dir, 'store.json')); await store.init();
  const bridge = new AntiScamLineJsBridge({
    allowedChats: [room], token: 'bridge-test-token-long-enough',
    webhookSecret: 'webhook-e2e-secret-long-enough',
    lineJsToken: 'linejs-test-token-long-enough',
    antiScamUrl: 'http://127.0.0.1:3000',
    liveVerified: true, actionsEnabled: true
  });
  const bridgeServer = createBridgeServer(bridge);
  bridgeServer.listen(0, '127.0.0.1'); await once(bridgeServer, 'listening');
  const bridgeUrl=`http://127.0.0.1:${bridgeServer.address().port}`;
  const connector = new OpenChatConnector({url:bridgeUrl,token:'bridge-test-token-long-enough',dryRun:false});
  const service=new ModerationService({store,connector,secret:'webhook-e2e-secret-long-enough',encryptionKey:randomBytes(32).toString('hex')});
  await service.createCommunity('整合測試',room);
  await service.updateCommunity(room,{mode:'auto',confirm:'ENABLE_AUTOMATION',blocked_domains:['scam.test']});
  const api = createAppServer({service,store,connector,password:'test-admin-password-long-enough',webhookSecret:'webhook-e2e-secret-long-enough'});
  api.listen(0, '127.0.0.1'); await once(api, 'listening');
  bridge.antiScamUrl=`http://127.0.0.1:${api.address().port}`;
  t.after(async()=>{await Promise.all([new Promise(r=>api.close(r)),new Promise(r=>bridgeServer.close(r))]);await rm(dir,{recursive:true,force:true});});
  const socket=bridge.attachSocket(new FakeSocket());socket.emit('open');
  await bridge.receive(JSON.stringify({type:'auth:ready',profile:{userId:'u123456789012345'}}));
  socket.on('sent', message=>{
    const response=message.type==='message:delete'
      ? {type:'message:deleted',requestId:message.requestId,chatId:room,messageId:message.messageId}
      : message.type==='member:remove'
      ? {type:'member:removed',requestId:message.requestId,chatId:room,messageId:message.messageId,memberId,messageDeleted:false}
      : {type:'sent',requestId:message.requestId,messageId:'555555555555'};
    queueMicrotask(()=>{void bridge.receive(JSON.stringify(response));});
  });
  const payload={type:'message',message:{channelId:room,channelKind:'square',messageId:'112233445566',senderId:memberId,contentType:'TEXT',text:'請立即匯款並提供簡訊驗證碼，點擊 https://scam.test/verify'}};
  await bridge.receive(JSON.stringify(payload));
  assert.equal((await store.listEvents()).length,1);
  const actions=await store.listAllActions();
  assert.deepEqual(actions.map(a=>a.status),['succeeded','succeeded','unavailable','succeeded']);
  await bridge.receive(JSON.stringify(payload));
  assert.equal((await store.listEvents()).length,1);
  assert.equal((await store.listAllActions()).length,4);
});
