import { readFile, mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const initialState = () => ({ communities: [], members: [], events: [], actions: [], audits: [] });
const clone = value => structuredClone(value);

/** Single-process development storage. Never use this driver for multi-instance production. */
export class FileStore {
  constructor(filePath) { this.path = filePath; this.state = initialState(); this.queue = Promise.resolve(); }
  async init() {
    try { this.state = { ...initialState(), ...JSON.parse(await readFile(this.path, 'utf8')) }; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  async transact(fn) {
    const run = this.queue.then(async () => {
      const draft = clone(this.state);
      const result = fn(draft);
      await mkdir(dirname(this.path), { recursive: true });
      const temp = `${this.path}.${process.pid}.tmp`;
      await writeFile(temp, JSON.stringify(draft), { mode: 0o600 });
      await rename(temp, this.path);
      this.state = draft;
      return clone(result);
    });
    this.queue = run.catch(() => {});
    return run;
  }
  async listCommunities() { return clone(this.state.communities); }
  async getCommunity(id) { return clone(this.state.communities.find(x => x.id === id) ?? null); }
  async createCommunity(item) { return this.transact(s => { if (s.communities.some(x => x.id === item.id)) throw new Error('Community already exists'); s.communities.push(item); return item; }); }
  async updateCommunity(id, patch) { return this.transact(s => { const c=s.communities.find(x => x.id === id); if (!c) return null; Object.assign(c, patch); return c; }); }
  async getMember(communityId, memberKey) { return clone(this.state.members.find(x => x.community_id === communityId && x.member_key === memberKey) ?? null); }
  async addMember(item) { return this.transact(s => { const existing=s.members.find(x => x.community_id === item.community_id && x.member_key === item.member_key); if (existing) return existing; s.members.push(item); return item; }); }
  async getEventBySource(sourceKey) { return clone(this.state.events.find(x => x.source_key === sourceKey) ?? null); }
  async getEvent(id) { return clone(this.state.events.find(x => x.id === id) ?? null); }
  async listEvents(communityId = null, limit = 100) { return clone(this.state.events.filter(e => !communityId || e.community_id === communityId).sort((a,b) => b.created_at.localeCompare(a.created_at)).slice(0, limit)); }
  async addEvent(item) { return this.transact(s => { const existing=s.events.find(x=>x.source_key===item.source_key); if (existing) return { created:false, event:existing }; s.events.push(item); return {created:true,event:item}; }); }
  async updateEvent(id, patch) { return this.transact(s => { const e=s.events.find(x=>x.id===id); if(!e)return null; Object.assign(e,patch); return e; }); }
  async addAction(item) { return this.transact(s => { const existing=s.actions.find(x=>x.action_key===item.action_key); if(existing) return {created:false,action:existing};s.actions.push(item);return {created:true,action:item}; }); }
  async updateAction(id, patch) { return this.transact(s => { const a=s.actions.find(x=>x.id===id);if(!a)return null;Object.assign(a,patch);return a; }); }
  async listActions(eventId) { return clone(this.state.actions.filter(x=>x.event_id===eventId)); }
  async listAllActions() { return clone(this.state.actions); }
  async addAudit(item) { return this.transact(s=>{s.audits.push(item);return item;}); }
  async listAudits(limit=100) { return clone(this.state.audits.slice(-limit).reverse()); }
  async recentMemberEvents(communityId, memberKey, since) { return clone(this.state.events.filter(x=>x.community_id===communityId&&x.member_key===memberKey&&x.happened_at>=since)); }
}

/** Server-side PostgREST driver, using Supabase service role ONLY on the backend. */
export class SupabaseStore {
  constructor(url, key) { if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required'); this.base = `${url.replace(/\/$/,'')}/rest/v1`; this.key=key; }
  async init() { await this.listCommunities(); }
  async request(table, { method='GET', filters={}, select='*', data, conflict }={}) {
    const params = new URLSearchParams();
    if (method === 'GET' || method === 'PATCH') { for (const [key,value] of Object.entries(filters)) params.set(key,`eq.${value}`); }
    if (method === 'GET') params.set('select',select);
    if (conflict) params.set('on_conflict', conflict);
    const url = `${this.base}/${table}${params.size?'?'+params:''}`;
    const headers = { apikey:this.key, Authorization:`Bearer ${this.key}`, Accept:'application/json', Prefer: conflict?'resolution=ignore-duplicates,return=representation':'return=representation' };
    if (data !== undefined) headers['Content-Type']='application/json';
    const response=await fetch(url,{method,headers,body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(8000)});
    const body=await response.text();
    if (!response.ok) throw new Error(`Supabase ${table} ${response.status}: ${body.slice(0,160)}`);
    return body?JSON.parse(body):[];
  }
  async listCommunities(){return this.request('as_communities');}
  async getCommunity(id){return (await this.request('as_communities',{filters:{id}}))[0]??null;}
  async createCommunity(item){return (await this.request('as_communities',{method:'POST',data:item}))[0];}
  async updateCommunity(id,patch){return (await this.request('as_communities',{method:'PATCH',filters:{id},data:patch}))[0]??null;}
  async getMember(communityId,memberKey){return (await this.request('as_members',{filters:{community_id:communityId,member_key:memberKey}}))[0]??null;}
  async addMember(item){const rows=await this.request('as_members',{method:'POST',data:item,conflict:'community_id,member_key'});return rows[0]??this.getMember(item.community_id,item.member_key);}
  async getEventBySource(sourceKey){return (await this.request('as_events',{filters:{source_key:sourceKey}}))[0]??null;}
  async getEvent(id){return (await this.request('as_events',{filters:{id}}))[0]??null;}
  async listEvents(communityId=null,limit=100){const all=await this.request('as_events',{filters:communityId?{community_id:communityId}:{}});return all.sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,limit);}
  async addEvent(item){const rows=await this.request('as_events',{method:'POST',data:item,conflict:'source_key'});return rows.length?{created:true,event:rows[0]}:{created:false,event:await this.getEventBySource(item.source_key)};}
  async updateEvent(id,patch){return (await this.request('as_events',{method:'PATCH',filters:{id},data:patch}))[0]??null;}
  async addAction(item){const rows=await this.request('as_actions',{method:'POST',data:item,conflict:'action_key'});return rows.length?{created:true,action:rows[0]}:{created:false,action:(await this.request('as_actions',{filters:{action_key:item.action_key}}))[0]};}
  async updateAction(id,patch){return (await this.request('as_actions',{method:'PATCH',filters:{id},data:patch}))[0]??null;}
  async listActions(eventId){return this.request('as_actions',{filters:{event_id:eventId}});}
  async listAllActions(){return this.request('as_actions');}
  async addAudit(item){return (await this.request('as_audit_logs',{method:'POST',data:item}))[0];}
  async listAudits(limit=100){return (await this.request('as_audit_logs')).sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,limit);}
  async recentMemberEvents(communityId,memberKey,since){const all=await this.request('as_events',{filters:{community_id:communityId,member_key:memberKey}});return all.filter(x=>x.happened_at>=since);}
}
