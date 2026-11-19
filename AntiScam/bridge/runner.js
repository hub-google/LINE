/** Start after installing the upstream LINE.js daemon and configuring .env. */
import { AntiScamLineJsBridge, createBridgeServer } from './bridge.js';
import WebSocket from 'ws';

const env = process.env;
const chats = (env.OPENCHAT_CHAT_IDS ?? '').split(',').map(v => v.trim()).filter(Boolean);
const bridge = new AntiScamLineJsBridge({
  allowedChats: chats,
  token: env.OPENCHAT_BRIDGE_TOKEN,
  webhookSecret: env.WEBHOOK_SECRET,
  lineJsToken: env.LINEJS_API_TOKEN,
  antiScamUrl: env.ANTISCAM_API_URL ?? 'http://127.0.0.1:3000',
  liveVerified: env.OPENCHAT_LIVE_VERIFIED === 'true',
  actionsEnabled: env.OPENCHAT_ACTIONS_ENABLED === 'true',
  protectedMembers: (env.OPENCHAT_PROTECTED_MEMBER_IDS ?? '').split(',').filter(Boolean),
  log: message => console.error(`[AntiScam bridge] ${message}`)
});
const wsUrl = env.LINEJS_WS_URL ?? 'ws://127.0.0.1:3789/api/ws';
if (!/^ws:\/\/(?:127\.0\.0\.1|localhost):\d+\/api\/ws$/i.test(wsUrl)) {
  throw Error('LINEJS_WS_URL must be a local ws://127.0.0.1:port/api/ws endpoint');
}
const server = createBridgeServer(bridge);
let shuttingDown = false;
let nextDelay = 1000;
function connect() {
  if (shuttingDown) return;
  const socket = new WebSocket(wsUrl, { headers: { Authorization: `Bearer ${bridge.lineJsToken}` } });
  bridge.attachSocket(socket);
  socket.on('open', () => { nextDelay = 1000; });
  socket.on('close', () => {
    if (!shuttingDown) {
      const delay = nextDelay;
      nextDelay = Math.min(30_000, Math.floor(nextDelay * 1.75));
      setTimeout(connect, delay).unref();
    }
  });
}
function shutdown() { shuttingDown = true; bridge.socket?.close(); server.close(); }
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
server.listen(Number(env.OPENCHAT_BRIDGE_PORT ?? 3010), '127.0.0.1', () => {
  console.log(`AntiScam bridge listening on localhost:${env.OPENCHAT_BRIDGE_PORT ?? 3010}`);
  connect();
});
