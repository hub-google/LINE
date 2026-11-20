/**
 * AntiScam bridge to the Apache-2.0 third-party project mars-tw/anti-scam-helper.
 * It uses the documented local bot WebSocket API; it does not extract LINE credentials
 * or implement LINE's non-public protocol. No LINE action is enabled by default.
 */
import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

const KNOWN_CAPS = Object.freeze({
  readMessage: true,
  readJoin: false, // Upstream does not guarantee an OpenChat join event to bot clients.
  deleteOtherMessage: true,
  removeMember: true,
  blockMember: false, // Upstream can kick, but does NOT expose ban re-entry.
  sendNotice: true
});
const OPERATION = Object.freeze({
  delete_message: { upstream: 'message:delete', response: 'message:deleted' },
  remove_member: { upstream: 'member:remove', response: 'member:removed' },
  send_notice: { upstream: 'message:send', response: 'sent' }
});
const MESSAGE_ID = /^\d{1,24}$/;
const SAFE_CHAT_ID = /^[ucrsm][A-Za-z0-9]{10,64}$/;
const TIMEOUT_MS = 12_000;
const MAX_KNOWN = 6000;
const TEXT_LIMIT = 10_000;
const RISK_HOST = /^(?:https?:\/\/)?(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i;

function requireNonEmpty(name, value, min = 20) {
  if (typeof value !== 'string' || value.length < min) throw new Error(`${name} must be configured`);
  return value;
}
function equals(left, right) {
  const a = Buffer.from(left ?? '');
  const b = Buffer.from(right ?? '');
  return a.length === b.length && timingSafeEqual(a, b);
}
function allowedMessage(frame, chats, protectedMembers) {
  if (frame?.type !== 'message' || !frame.message || frame.message.channelKind !== 'square') return null;
  const m = frame.message;
  if (!chats.has(m.channelId) || !MESSAGE_ID.test(m.messageId ?? '') || !m.senderId || m.unsent) return null;
  if (m.contentType === 'CHATEVENT') return null;
  const privileged = m.senderRole === 'admin' || m.senderRole === 'coAdmin' || protectedMembers.has(m.senderId);
  return {
    chatId: m.channelId, messageId: m.messageId, senderId: m.senderId,
    memberRole: privileged ? 'admin' : 'member',
    privileged,
    text: typeof m.text === 'string' ? m.text : null,
    expiresAt: Date.now() + 60 * 60_000
  };
}

/** All side effects are behind a verified local WS session and explicit admin opt-in. */
export class AntiScamLineJsBridge {
  constructor({
    allowedChats, token, webhookSecret, lineJsToken, antiScamUrl,
    liveVerified = false, actionsEnabled = false,
    protectedMembers = [], fetcher = fetch, makeSocket,
    log = () => {}
  }) {
    this.allowedChats = new Set(allowedChats ?? []);
    if (!this.allowedChats.size || [...this.allowedChats].some(id => !SAFE_CHAT_ID.test(id))) throw new Error('Configured OpenChat room IDs are required');
    this.token = requireNonEmpty('OPENCHAT_BRIDGE_TOKEN', token);
    this.webhookSecret = requireNonEmpty('WEBHOOK_SECRET', webhookSecret);
    this.lineJsToken = requireNonEmpty('LINEJS_API_TOKEN', lineJsToken);
    if (!antiScamUrl || !RISK_HOST.test(antiScamUrl)) throw new Error('ANTISCAM_API_URL must be loopback http(s) by default');
    this.antiScamUrl = antiScamUrl.replace(/\/$/, '');
    this.liveVerified = liveVerified === true;
    this.actionsEnabled = actionsEnabled === true;
    this.protectedMembers = new Set(protectedMembers);
    this.fetcher = fetcher;
    this.makeSocket = makeSocket;
    this.log = log;
    this.socket = null;
    this.isOpen = false;
    this.isReady = false;
    this.known = new Map();
    this.pending = new Map();
    this.completed = new Map();
    this.inFlight = new Map();
  }
  get usable() { return this.isOpen && this.isReady && this.liveVerified && this.actionsEnabled; }
  capabilities() {
    return {
      platform: 'line-openchat',
      verified: this.usable,
      verifiedAt: this.usable ? new Date().toISOString() : null,
      capabilities: Object.fromEntries(Object.entries(KNOWN_CAPS).map(([key,value]) => [key, value && (key === 'readMessage' ? this.isOpen && this.isReady : this.usable)])),
      limitations: ['readJoin not supported', 'blockMember not supported: removal does not ban re-entry'],
      connection: this.isReady ? 'ready' : this.isOpen ? 'waiting-auth' : 'disconnected'
    };
  }
  attachSocket(socket) {
    this.socket = socket;
    socket.on('open', () => { this.isOpen = true; this.log('LINE.js websocket connected'); });
    socket.on('message', buf => { void this.receive(buf).catch(e => this.log(`LINE.js frame error: ${e.message}`)); });
    const closed = () => {
      this.isOpen = false; this.isReady = false;
      for (const [key,item] of this.pending) { clearTimeout(item.timer); item.reject(new Error('LINE.js connection lost')); this.pending.delete(key); }
    };
    socket.on('close', closed);
    socket.on('error', e => this.log(`LINE.js socket: ${e.message ?? 'error'}`));
    return socket;
  }
  async receive(raw) {
    let frame;
    try { frame = JSON.parse(String(raw)); } catch { return; }
    if (frame.type === 'auth:ready' && frame.profile?.userId) { this.isReady = true; return; }
    if (frame.type === 'auth:state' && frame.state !== 'ready') this.isReady = false;
    if (frame.requestId && this.pending.has(frame.requestId)) {
      const p = this.pending.get(frame.requestId);
      clearTimeout(p.timer); this.pending.delete(frame.requestId);
      if (frame.type === 'error') p.reject(new Error(`LINE.js error: ${frame.code ?? 'UNKNOWN'}`));
      else if (frame.type === p.response) p.resolve(frame);
      else p.reject(new Error(`Unexpected LINE.js response ${frame.type}`));
      return;
    }
    const m = allowedMessage(frame, this.allowedChats, this.protectedMembers);
    if (!m) return;
    this.known.set(`${m.chatId}:${m.messageId}`, m);
    if (this.known.size > MAX_KNOWN) this.known.delete(this.known.keys().next().value);
    if (!m.text || m.text.length > TEXT_LIMIT || !this.isReady) return;
    const payload = {
      type: 'message.created',
      eventId: `msg:${m.chatId}:${m.messageId}`,
      communityId: m.chatId,
      memberId: m.senderId,
      memberRole: m.memberRole,
      messageId: m.messageId,
      text: m.text
    };
    const body = JSON.stringify(payload);
    const stamp = Math.floor(Date.now() / 1000);
    const signature = `sha256=${createHmac('sha256', this.webhookSecret).update(`${stamp}.${body}`).digest('hex')}`;
    try {
      const res = await this.fetcher(`${this.antiScamUrl}/webhooks/openchat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-antiscam-timestamp': String(stamp), 'x-antiscam-signature': signature },
        body,
        signal: AbortSignal.timeout(6500)
      });
      if (!res.ok) this.log(`AntiScam ingest HTTP ${res.status} room=${m.chatId}`);
    } catch(e) { this.log(`AntiScam ingest failed: ${e.message}`); }
  }
  sendRequest(frame, response) {
    if (!this.usable || !this.socket || this.socket.readyState !== 1) throw new Error('LINE.js connection not authorized or ready');
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error('LINE.js acknowledgement timeout')); }, TIMEOUT_MS);
      this.pending.set(requestId, { timer, resolve, reject, response });
      try { this.socket.send(JSON.stringify({ ...frame, requestId })); }
      catch(e) { clearTimeout(timer); this.pending.delete(requestId); reject(e); }
    });
  }
  async action({ type, communityId, messageId, memberId, notice, actionKey }) {
    if (!this.usable) return { ok: false, confirmed: false, error: 'Bridge not verified/authorized for live operations' };
    if (!this.allowedChats.has(communityId)) return { ok: false, confirmed: false, error: 'Room is not authorized' };
    if (!Object.hasOwn(OPERATION, type)) return { ok: false, confirmed: false, error: 'Unsupported action (blockMember is not available)' };
    if (!actionKey || typeof actionKey !== 'string' || actionKey.length > 200) return { ok: false, confirmed: false, error: 'Valid idempotency key required' };
    if (this.completed.has(actionKey)) return this.completed.get(actionKey);
    if (this.inFlight.has(actionKey)) return this.inFlight.get(actionKey);
    if (type === 'send_notice') {
      if (typeof notice !== 'string' || !notice.trim() || notice.length > 750) return { ok: false, confirmed: false, error: 'Invalid announcement' };
    } else {
      if (!MESSAGE_ID.test(messageId ?? '')) return { ok: false, confirmed: false, error: 'Invalid messageId' };
      const seen = this.known.get(`${communityId}:${messageId}`);
      if (!seen || seen.expiresAt <= Date.now() || seen.privileged) return { ok: false, confirmed: false, error: 'Unknown, expired or protected message' };
      if (type === 'remove_member' && seen.senderId !== memberId) return { ok: false, confirmed: false, error: 'Member does not match the message sender' };
    }
    let frame = { type: OPERATION[type].upstream, chatId: communityId };
    if (type === 'send_notice') frame.text = notice;
    else frame.messageId = messageId;
    if (type === 'remove_member') frame.deleteMessage = false;
    const execution = (async () => {
    try {
      const ack = await this.sendRequest(frame, OPERATION[type].response);
      if (type !== 'send_notice' && (ack.chatId !== communityId || ack.messageId !== messageId)) {
        throw new Error('Acknowledged room or message does not match');
      }
      if (type === 'remove_member' && ack.memberId !== memberId) throw new Error('Acknowledged member does not match');
      if (type === 'send_notice' && !ack.messageId) throw new Error('No sent message ID acknowledged');
      const result = { ok: true, confirmed: true, confirmationId: `${type}:${communityId}:${ack.messageId ?? messageId}` };
      this.completed.set(actionKey, result);
      if (this.completed.size > 5000) this.completed.delete(this.completed.keys().next().value);
      return result;
    } catch(e) { return { ok: false, confirmed: false, error: String(e.message).slice(0,180) }; }
    })();
    this.inFlight.set(actionKey, execution);
    try { return await execution; } finally { this.inFlight.delete(actionKey); }
  }
}

function response(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(obj));
}
async function readBody(req, limit = 8192) {
  const parts = []; let size = 0;
  for await (const piece of req) {
    size += piece.length;
    if (size > limit) throw Error('Body too large');
    parts.push(piece);
  }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
export function createBridgeServer(bridge) {
  return createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') return response(res, 200, { ok: true, lineJsReady: bridge.isReady, liveActionsEnabled: bridge.usable });
    const bearer = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    if (!equals(bearer, bridge.token)) return response(res, 401, { error: 'Unauthorized' });
    if (req.method === 'GET' && req.url === '/v1/capabilities') return response(res, 200, bridge.capabilities());
    if (req.method === 'POST' && req.url === '/v1/actions') {
      try {
        const b = await readBody(req);
        if (req.headers['idempotency-key'] !== b.actionKey) return response(res, 400, { error: 'Idempotency key mismatch' });
        const result = await bridge.action(b);
        return response(res, result.ok ? 200 : 409, result);
      } catch(e) { return response(res, 400, { error: e.message === 'Body too large' ? e.message : 'Invalid request' }); }
    }
    return response(res, 404, { error: 'Not found' });
  });
}
