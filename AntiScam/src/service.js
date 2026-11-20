import { randomUUID, createHash } from 'node:crypto';
import { analyzeMessage, normalizeText, redactPreview } from './analyzer.js';
import { actionKey, decryptMemberId, encryptMemberId, makeMemberKey } from './security.js';
import { ACTIONS, formatNotice, planActions } from './policy.js';
import { classifyWithGemini } from './ai.js';

const date = () => new Date().toISOString();
const hash = x => createHash('sha256').update(String(x)).digest('hex');
const cleanEvent = e => { if (!e) return null; const { encrypted_member_id, ...safe } = e; return safe; };
export class ModerationService {
  constructor({store, connector, secret, encryptionKey, aiConfig={}}) {
    this.store=store;this.connector=connector;this.secret=secret;this.encryptionKey=encryptionKey;this.aiConfig=aiConfig;
    this.notices=new Map();
  }
  async createCommunity(name, id=randomUUID()) {
    if (!name || typeof name !== 'string' || name.trim().length > 80 || !/^[a-zA-Z0-9_-]{3,90}$/.test(id)) throw new Error('社群名稱或識別碼格式錯誤');
    const now=date();
    return this.store.createCommunity({id,name:name.trim(),mode:'monitor',automation_approved:false,blocked_domains:[],allowed_member_keys:[],created_at:now,updated_at:now});
  }
  async updateCommunity(id, input) {
    const existing=await this.store.getCommunity(id);
    if(!existing) return null;
    const patch={updated_at:date()};
    if(input.name!==undefined){if(typeof input.name!=='string'||!input.name.trim()||input.name.length>80)throw new Error('無效社群名稱');patch.name=input.name.trim();}
    if(input.mode!==undefined){if(!['monitor','assist','auto'].includes(input.mode)) throw new Error('無效處置模式');patch.mode=input.mode;patch.automation_approved=input.mode==='auto' && input.confirm==='ENABLE_AUTOMATION';if(input.mode==='auto'&&!patch.automation_approved)throw new Error('須輸入 ENABLE_AUTOMATION 才能啟用自動處置');}
    if(input.blocked_domains!==undefined){if(!Array.isArray(input.blocked_domains)||input.blocked_domains.length>500||input.blocked_domains.some(v=>typeof v!=='string'||!/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(v)||v.length>253))throw new Error('網域必須為合法主機名稱，不得包含通訊協定與路徑');patch.blocked_domains=[...new Set(input.blocked_domains.map(x=>x.toLowerCase()))];}
    if(input.allowed_member_keys!==undefined){if(!Array.isArray(input.allowed_member_keys)||input.allowed_member_keys.length>1000||input.allowed_member_keys.some(v=>typeof v!=='string'||!/^[a-f0-9]{64}$/i.test(v)))throw new Error('白名單必須使用匿名成員識別碼');patch.allowed_member_keys=[...new Set(input.allowed_member_keys)];}
    return this.store.updateCommunity(id,patch);
  }
  async analyze({text,communityId,isNewMember=false,recentSameText=0,recentMessages=0,withAI=false}) {
    const community=communityId?await this.store.getCommunity(communityId):null;
    const rule=analyzeMessage({text,isNewMember,recentSameText,recentMessages,blockedDomains:community?.blocked_domains??[]});
    let ai=null;
    if(withAI && (rule.score>=20 || /https?:\/\//i.test(text)) && rule.score<95) ai=await classifyWithGemini(text,this.aiConfig);
    const score=Math.min(100,rule.score+(ai?.suspected&&ai.confidence>=.85?10:0));
    const level=score>=80?'critical':score>=50?'high':score>=25?'medium':'low';
    return {...rule,score,level,ai,autoEligible:rule.autoEligible};
  }
  async ingest(payload) {
    if (!payload || typeof payload!=='object') throw new Error('無效事件');
    const {type,eventId,communityId,memberId}=payload;
    if(!['member.joined','message.created'].includes(type)||![eventId,communityId,memberId].every(x=>typeof x==='string'&&x.length>0&&x.length<300))throw new Error('事件欄位不足或格式不正確');
    const community=await this.store.getCommunity(communityId);
    if(!community) throw new Error('社群尚未綁定；拒絕未知來源');
    const memberKey=makeMemberKey(this.secret,communityId,memberId);
    const now=date();
    if(type==='member.joined') {
      const member=await this.store.addMember({community_id:communityId,member_key:memberKey,joined_at:now,first_observed_at:now,join_verified:true});
      return {ok:true,type:'member.joined',memberKey:member.member_key};
    }
    if(typeof payload.text!=='string'||payload.text.length>10000||typeof payload.messageId!=='string'||payload.messageId.length>300)throw new Error('訊息欄位錯誤或超出長度');
    const sourceKey=hash(`${communityId}\u0000${eventId}`);
    const existing=await this.store.getEventBySource(sourceKey);
    if(existing) return {ok:true,duplicate:true,event:cleanEvent(existing),actions:await this.store.listActions(existing.id)};
    const member=await this.store.getMember(communityId,memberKey);
    if(!member)await this.store.addMember({community_id:communityId,member_key:memberKey,joined_at:null,first_observed_at:now,join_verified:false});
    const firstTime=member?.joined_at??member?.first_observed_at??now;
    const isNewMember=(Date.now()-new Date(firstTime).getTime())<24*60*60*1000;
    const prev=await this.store.recentMemberEvents(communityId,memberKey,new Date(Date.now()-60*1000).toISOString());
    const fingerprint=hash(normalizeText(payload.text));
    const recentSameText=prev.filter(x=>x.fingerprint===fingerprint).length;
    const role=String(payload.memberRole??'member');
    const privileged=['owner','admin','moderator'].includes(role)||(community.allowed_member_keys??[]).includes(memberKey);
    const risk=await this.analyze({text:payload.text,communityId,isNewMember,recentSameText,recentMessages:prev.length,withAI:!privileged});
    const event={id:randomUUID(),source_key:sourceKey,community_id:communityId,member_key:memberKey,encrypted_member_id:encryptMemberId(memberId,this.encryptionKey),message_id:payload.messageId,preview:redactPreview(payload.text),fingerprint,score:risk.score,level:risk.level,categories:risk.categories,reasons:risk.reasons,ai:risk.ai,auto_eligible:risk.autoEligible,is_privileged:privileged,member_recent:isNewMember,status:'assessed',happened_at:now,created_at:now};
    const inserted=await this.store.addEvent(event);
    if(!inserted.created)return {ok:true,duplicate:true,event:cleanEvent(inserted.event),actions:await this.store.listActions(inserted.event.id)};
    const planned=community.automation_approved?planActions({community,risk,privileged}):[];
    const actions=[];
    for(const type of planned) actions.push(await this.executeAction(event,type,{memberId,actor:'auto'}));
    await this.store.updateEvent(event.id,{status:planned.length?'handled':'reviewable'});
    return {ok:true,duplicate:false,event:cleanEvent({...event,status:planned.length?'handled':'reviewable'}),actions};
  }
  async executeAction(event,type,{memberId,actor='admin'}={}) {
    if(!ACTIONS.includes(type))throw new Error('未知處置類型');
    if (['remove_member', 'block_member'].includes(type)) {
      const community = await this.store.getCommunity(event.community_id);
      if (!community) throw new Error('找不到處置事件所屬的社群');
      if (event.is_privileged || community.allowed_member_keys?.includes(event.member_key)) {
        throw new Error('受保護管理員或白名單成員不可踢出');
      }
    }
    const key=actionKey(event.id,type);
    const saved=await this.store.addAction({id:randomUUID(),action_key:key,event_id:event.id,community_id:event.community_id,type,status:'pending',actor,detail:null,created_at:date(),updated_at:date()});
    if(!saved.created)return saved.action;
    let result;
    if(type==='send_notice') {
      const other=await this.store.listActions(event.id);
      if(!other.some(x=>['delete_message','remove_member'].includes(x.type)&&x.status==='succeeded'))result={status:'unavailable',detail:'尚無已確認的刪文或踢人結果，避免發送不實警告'};
      else if((Date.now()-(this.notices.get(event.community_id)??0))<60000)result={status:'suppressed',detail:'同社群公告冷卻中'};
    }
    if(!result) {
      const target=memberId??(event.encrypted_member_id?decryptMemberId(event.encrypted_member_id,this.encryptionKey):null);
      result=await this.connector.perform(type,{communityId:event.community_id,messageId:event.message_id,memberId:target,notice:type==='send_notice'?formatNotice():undefined,actionKey:key});
      if(type==='send_notice'&&result.status==='succeeded')this.notices.set(event.community_id,Date.now());
    }
    const updated=await this.store.updateAction(saved.action.id,{status:result.status,detail:result.detail??null,confirmation_id:result.confirmationId??null,updated_at:date()});
    await this.store.addAudit({id:randomUUID(),actor,operation:type,event_id:event.id,community_id:event.community_id,result:result.status,created_at:date()});
    return updated;
  }
  async manualAction(eventId,type) {
    const event=await this.store.getEvent(eventId);
    if(!event)throw new Error('找不到事件');
    if(type==='send_notice' || !ACTIONS.includes(type)) throw new Error('請先選擇刪文或踢出／封鎖');
    return this.executeAction(event,type,{actor:'admin'});
  }
  async listEvents(communityId=null){return (await this.store.listEvents(communityId)).map(cleanEvent);}
  async getEvent(id){const event=await this.store.getEvent(id);return event?{...cleanEvent(event),actions:await this.store.listActions(id)}:null;}
}
