/**
 * One-time, on-device configuration for AntiScam Windows pilot.
 * Never uploads LINE sessions or credentials. Default: monitor only.
 */
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, chmod, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const BRIDGE = join(ROOT, 'bridge');
const UPSTREAM = join(BRIDGE, '.runtime', 'anti-scam-helper');
const apiEnvFile = join(ROOT, '.env');
const bridgeEnvFile = join(BRIDGE, '.env');
const CHAT_ID = /^[m][A-Za-z0-9]{10,64}$/;

function secret(bytes = 32) { return randomBytes(bytes).toString('hex'); }
async function exists(path) { try { await access(path); return true; } catch { return false; } }
function parseEnv(source) {
  return Object.fromEntries(source.split(/\r?\n/).filter(line => /^[A-Z_]+=/i.test(line)).map(line => {
    const at = line.indexOf('='); return [line.slice(0,at), line.slice(at+1)];
  }));
}
async function readEnv(path) { return await exists(path) ? parseEnv(await readFile(path, 'utf8')) : {}; }
async function saveEnv(path, obj) {
  // Restrictive on POSIX. Windows: use a private folder, never a synced/shared/public directory.
  await writeFile(path, Object.entries(obj).map(([key,value])=>`${key}=${value}`).join('\n') + '\n', { mode:0o600 });
  if (process.platform !== 'win32') await chmod(path,0o600);
}
export async function initialize() {
  if (!await exists(join(UPSTREAM, 'package.json'))) throw Error('Missing LINE.js upstream; run 01-install-and-login.ps1 first');
  const oldApi = await readEnv(apiEnvFile);
  const oldBridge = await readEnv(bridgeEnvFile);
  const webhook = oldApi.WEBHOOK_SECRET || oldBridge.WEBHOOK_SECRET || secret(32);
  const bridgeToken = oldApi.OPENCHAT_BRIDGE_TOKEN || oldBridge.OPENCHAT_BRIDGE_TOKEN || secret(32);
  const api = {
    ...oldApi,
    ADMIN_PASSWORD: oldApi.ADMIN_PASSWORD || secret(24),
    WEBHOOK_SECRET: webhook,
    DATA_ENCRYPTION_KEY: oldApi.DATA_ENCRYPTION_KEY || secret(32),
    PORT: '3000', HOST: '127.0.0.1', NODE_ENV:'development',
    STORAGE_DRIVER: 'local', STORAGE_FILE: './data/local.json',
    DRY_RUN: 'true', AI_ENABLED: 'false',
    OPENCHAT_BRIDGE_URL:'http://127.0.0.1:3010',
    OPENCHAT_BRIDGE_TOKEN: bridgeToken
  };
  const bridge = {
    ...oldBridge,
    WEBHOOK_SECRET: webhook,
    OPENCHAT_BRIDGE_TOKEN: bridgeToken,
    OPENCHAT_CHAT_IDS:oldBridge.OPENCHAT_CHAT_IDS || '',
    LINEJS_API_TOKEN:oldBridge.LINEJS_API_TOKEN || '',
    LINEJS_WS_URL:'ws://127.0.0.1:3789/api/ws',
    ANTISCAM_API_URL:'http://127.0.0.1:3000',
    OPENCHAT_BRIDGE_PORT:'3010',
    OPENCHAT_LIVE_VERIFIED: 'false',
    OPENCHAT_ACTIONS_ENABLED: 'false'
  };
  // Keep the upstream UI loopback-only and avoid altering read receipts on login.
  // This config is local-only and does not need an OpenChat room ID yet.
  const configFile = join(UPSTREAM, 'config.yaml');
  const sourceConfig = await readFile(await exists(configFile) ? configFile : join(UPSTREAM, 'config.example.yaml'),'utf8');
  const require = createRequire(join(UPSTREAM, 'package.json'));
  const yaml = require('yaml');
  const config = yaml.parse(sourceConfig);
  config.server = { ...(config.server||{}),host:'127.0.0.1' };
  config.chat = { ...(config.chat||{}),sendReadReceipts:false };
  config.update = { ...(config.update||{}),check:false };
  config.api = { ...(config.api||{}),moderation:false };
  await writeFile(configFile, yaml.stringify(config), {mode:0o600});
  // Always force monitor-only defaults when using the local setup tool.
  await saveEnv(apiEnvFile,api);
  await saveEnv(bridgeEnvFile,bridge);
  return { root:ROOT, upstream:UPSTREAM };
}
export async function configureChat(chatId) {
  if (!CHAT_ID.test(chatId || '')) throw Error('OpenChat channel ID must be the actual m... ID copied from LINE.js, not the invite URL');
  await initialize();
  const configFile = join(UPSTREAM, 'config.yaml');
  const original = await readFile(await exists(configFile) ? configFile : join(UPSTREAM,'config.example.yaml'),'utf8');
  // yaml is installed/pinned as part of the upstream npm ci.
  const require = createRequire(join(UPSTREAM, 'package.json'));
  const yaml = require('yaml');
  const doc = yaml.parse(original);
  doc.server = { ...(doc.server||{}),host:'127.0.0.1' };
  doc.chat = { ...(doc.chat||{}),sendReadReceipts:false };
  doc.update = { ...(doc.update||{}),check:false };
  doc.api = { ...(doc.api||{}),enabled:true,chats:[chatId],moderation:false,sendsPerMinute:10 };
  await writeFile(configFile,yaml.stringify(doc),{mode:0o600});
  const bridge = await readEnv(bridgeEnvFile);
  bridge.OPENCHAT_CHAT_IDS=chatId;
  await saveEnv(bridgeEnvFile,bridge);
  return chatId;
}
export async function storeLineToken(token) {
  if (!/^[\x21-\x7e]{24,512}$/.test(token)) throw Error('LINE.js bot API token has an unexpected format');
  const bridge=await readEnv(bridgeEnvFile);
  bridge.LINEJS_API_TOKEN=token;
  await saveEnv(bridgeEnvFile,bridge);
}
export async function loadLocalSettings() {
  return {api:await readEnv(apiEnvFile),bridge:await readEnv(bridgeEnvFile),root:ROOT,upstream:UPSTREAM};
}

if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const [, , command, value] = process.argv;
    if (command==='init') {
      await initialize();
      console.log('Local secrets generated in AntiScam/.env and AntiScam/bridge/.env (never committed).');
      console.log('Live actions and AI disabled; all services bind to localhost for the local pilot.');
    } else if (command==='chat') {
      console.log(`Configured local OpenChat scope: ${await configureChat(value)}`);
    } else {throw Error('Usage: node configure.mjs init | chat <OpenChat m... channel ID>');}
  } catch(e) {console.error(`Local setup error: ${e.message}`);process.exitCode=1;}
}
