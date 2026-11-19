import { createServer as createHttpServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { safeEquals, verifyWebhook } from './security.js';
import { FileStore, SupabaseStore } from './store.js';
import { OpenChatConnector } from './connector.js';
import { ModerationService } from './service.js';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const staticFiles=new Map([['/','index.html'],['/index.html','index.html'],['/ui.js','ui.js'],['/styles.css','styles.css'],['/src/analyzer.js','src/analyzer.js']]);
const mime={'html':'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8'};
function json(res,status,body,extras={}) {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extras});res.end(JSON.stringify(body));}
async function getBody(req,limit=65536){const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>limit)throw Object.assign(new Error('Request too large'),{status:413});chunks.push(chunk);}return Buffer.concat(chunks).toString('utf8');}
function parseJson(text){try{return JSON.parse(text);}catch{throw Object.assign(new Error('Invalid JSON'),{status:400});}}
function cookie(req,name){return (req.headers.cookie??'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)??null;}
function uuidPath(path,kind){const m=path.match(kind);return m?.[1]??null;}
export function createAppServer({service,store,connector,password,webhookSecret,secureCookie=false}) {
  if(!password || password.length<12)throw new Error('ADMIN_PASSWORD must have at least 12 characters');
  const sessions=new Map();const attempts=new Map();
  const sessionValid=req=>{const value=cookie(req,'as_session');const record=sessions.get(value);if(!record)return false;if(record<Date.now()){sessions.delete(value);return false;}return true;};
  const cookieAttrs=`HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secureCookie?'; Secure':''}`;
  return createHttpServer(async(req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    try {
      if(req.method==='GET'&&staticFiles.has(pathname)){
        const path=staticFiles.get(pathname);const body=await readFile(join(root,path));
        const ext=path.split('.').at(-1);
        res.writeHead(200,{'Content-Type':mime[ext]??'application/octet-stream','Cache-Control':'no-cache'});res.end(body);return;
      }
      if(req.method==='GET'&&pathname==='/health')return json(res,200,{ok:true,component:'AntiScam API',lineOpenChatConnected:false,checkedAt:new Date().toISOString()});
      if(req.method==='POST'&&pathname==='/webhooks/openchat'){
        if(!webhookSecret)return json(res,503,{error:'Webhook disabled'});
        const raw=await getBody(req);
        if(!verifyWebhook({raw,signature:req.headers['x-antiscam-signature'],timestamp:req.headers['x-antiscam-timestamp'],secret:webhookSecret}))return json(res,401,{error:'Invalid webhook signature or timestamp'});
        const result=await service.ingest(parseJson(raw));return json(res,200,result);
      }
      if(req.method==='POST'&&pathname==='/api/login'){
        const ip=req.socket.remoteAddress??'unknown';const state=attempts.get(ip)??{count:0,until:0};
        if(state.until>Date.now())return json(res,429,{error:'登入嘗試過多，稍後再試'});
        const body=parseJson(await getBody(req));
        if(typeof body.password!=='string'||!safeEquals(body.password,password)){
          const next=state.count+1;attempts.set(ip,{count:next>=5?0:next,until:next>=5?Date.now()+900000:0});
          return json(res,401,{error:'密碼不正確'});
        }
        attempts.delete(ip);const token=randomBytes(32).toString('base64url');sessions.set(token,Date.now()+43200000);
        return json(res,200,{ok:true},{'Set-Cookie':`as_session=${token}; ${cookieAttrs}`});
      }
      if(pathname.startsWith('/api/')) {
        if(!sessionValid(req))return json(res,401,{error:'請先登入後台'});
        if(req.method==='POST'&&pathname==='/api/logout'){
          sessions.delete(cookie(req,'as_session'));
          return json(res,200,{ok:true},{'Set-Cookie':`as_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureCookie?'; Secure':''}`});
        }
        if(req.method==='GET'&&pathname==='/api/session')return json(res,200,{authenticated:true});
        if(req.method==='GET'&&pathname==='/api/status'){
          const actions=await store.listAllActions();
          return json(res,200,{connector:await connector.capabilities(),dryRun:connector.dryRun,storage:store instanceof SupabaseStore?'supabase':'local',communities:(await store.listCommunities()).length,confirmedSuccess:actions.filter(a=>a.status==='succeeded'&&['delete_message','remove_member'].includes(a.type)).length});
        }
        if(req.method==='GET'&&pathname==='/api/communities')return json(res,200,{communities:await store.listCommunities()});
        if(req.method==='POST'&&pathname==='/api/communities'){
          const b=parseJson(await getBody(req));return json(res,201,{community:await service.createCommunity(b.name,b.id)});
        }
        const communityId=uuidPath(pathname,/^\/api\/communities\/([a-zA-Z0-9_-]{3,90})$/);
        if(req.method==='PATCH'&&communityId){const b=parseJson(await getBody(req));const c=await service.updateCommunity(communityId,b);return c?json(res,200,{community:c}):json(res,404,{error:'找不到社群'});}
        if(req.method==='GET'&&pathname==='/api/events'){
          const communityId=new URL(req.url,'http://localhost').searchParams.get('communityId');return json(res,200,{events:await service.listEvents(communityId)});
        }
        const eventId=uuidPath(pathname,/^\/api\/events\/([a-z0-9-]{36})$/i);
        if(req.method==='GET'&&eventId){const item=await service.getEvent(eventId);return item?json(res,200,{event:item}):json(res,404,{error:'找不到事件'});}
        const actionEventId=uuidPath(pathname,/^\/api\/events\/([a-z0-9-]{36})\/actions$/i);
        if(req.method==='POST'&&actionEventId){const b=parseJson(await getBody(req));if(b.confirm!=='EXECUTE')return json(res,400,{error:'請明確確認操作'});return json(res,200,{action:await service.manualAction(actionEventId,b.type)});}
        if(req.method==='POST'&&pathname==='/api/analyze'){
          const b=parseJson(await getBody(req));if(typeof b.text!=='string'||b.text.length>10000)return json(res,400,{error:'文字不符合長度限制'});
          const risk=await service.analyze({text:b.text,communityId:b.communityId,isNewMember:!!b.isNewMember,withAI:!!b.withAI});
          const {normalized,...safe}=risk;return json(res,200,{risk:safe,simulated:true});
        }
        if(req.method==='GET'&&pathname==='/api/audits')return json(res,200,{audits:await store.listAudits()});
      }
      return json(res,404,{error:'Not found'});
    }catch(error){const status=error.status??(error.message?.includes('找不到')?404:400);json(res,status,{error:status===500?'Server error':String(error.message??error).slice(0,160)});}
  });
}
export async function buildApp(env=process.env){
  const {ADMIN_PASSWORD,WEBHOOK_SECRET,DATA_ENCRYPTION_KEY}=env;
  if(!ADMIN_PASSWORD||ADMIN_PASSWORD.length<12||!WEBHOOK_SECRET||WEBHOOK_SECRET.length<24||!/^[a-f0-9]{64}$/i.test(DATA_ENCRYPTION_KEY??''))throw new Error('Missing ADMIN_PASSWORD (12+), WEBHOOK_SECRET (24+), or DATA_ENCRYPTION_KEY (64 hex)');
  if(env.NODE_ENV==='production'&&env.STORAGE_DRIVER!=='supabase')throw new Error('Production requires STORAGE_DRIVER=supabase');
  if(env.DRY_RUN==='false'&&(!env.OPENCHAT_BRIDGE_URL||!env.OPENCHAT_BRIDGE_TOKEN))throw new Error('Live actions require OPENCHAT_BRIDGE_URL and OPENCHAT_BRIDGE_TOKEN');
  const store=env.STORAGE_DRIVER==='supabase'?new SupabaseStore(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY):new FileStore(env.STORAGE_FILE??join(root,'data','local.json'));
  await store.init();
  const connector=new OpenChatConnector({url:env.OPENCHAT_BRIDGE_URL,token:env.OPENCHAT_BRIDGE_TOKEN,dryRun:env.DRY_RUN!=='false'});
  const service=new ModerationService({store,connector,secret:WEBHOOK_SECRET,encryptionKey:DATA_ENCRYPTION_KEY,aiConfig:{enabled:env.AI_ENABLED==='true',apiKey:env.GEMINI_API_KEY,model:env.GEMINI_MODEL}});
  return createAppServer({service,store,connector,password:ADMIN_PASSWORD,webhookSecret:WEBHOOK_SECRET,secureCookie:env.NODE_ENV==='production'});
}
if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]) {
  buildApp().then(server=>server.listen(Number(process.env.PORT??3000),process.env.HOST??'0.0.0.0',()=>console.log(`AntiScam listening on ${process.env.HOST??'0.0.0.0'}:${process.env.PORT??3000}`))).catch(error=>{console.error(error.message);process.exitCode=1;});
}
