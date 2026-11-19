/** Boundary for an authorized OpenChat connector. No unofficial LINE login is bundled. */
export const CAPABILITIES = ['readMessage', 'readJoin', 'deleteOtherMessage', 'removeMember', 'blockMember', 'sendNotice'];
const ACTION_CAP = { delete_message:'deleteOtherMessage', remove_member:'removeMember', block_member:'blockMember', send_notice:'sendNotice' };
export class OpenChatConnector {
  constructor({ url, token, dryRun=true, fetcher=fetch }={}) { this.url=url?.replace(/\/$/,''); this.token=token;this.dryRun=dryRun;this.fetcher=fetcher; }
  async capabilities() {
    const unsupported = Object.fromEntries(CAPABILITIES.map(x=>[x,false]));
    if (!this.url || !this.token) return { status:'unavailable', capabilities:unsupported, detail:'未設定 OpenChat 連接器' };
    try {
      const r=await this.fetcher(`${this.url}/v1/capabilities`,{headers:{Authorization:`Bearer ${this.token}`},signal:AbortSignal.timeout(4000)});
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data=await r.json();
      if (data.platform !== 'line-openchat' || data.verified !== true) throw new Error('連接器尚未完成 OpenChat 權限驗證');
      return {status:'connected',capabilities:Object.fromEntries(CAPABILITIES.map(x=>[x,data.capabilities?.[x]===true])),verifiedAt:data.verifiedAt??null};
    } catch { return {status:'degraded',capabilities:unsupported,detail:'連接器不可用或權限未驗證'}; }
  }
  async perform(type,{communityId,messageId,memberId,notice,actionKey}) {
    if (this.dryRun) return {status:'dry_run', detail:'僅模擬；未對 LINE 進行操作'};
    const check=await this.capabilities();
    if (check.status!=='connected' || !check.capabilities[ACTION_CAP[type]]) return {status:'unavailable',detail:'連接器未授權此功能'};
    if ((type==='delete_message'&&!messageId) || (['remove_member','block_member'].includes(type)&&!memberId)) return {status:'unavailable',detail:'缺少操作所需的訊息或成員識別'};
    try {
      const response=await this.fetcher(`${this.url}/v1/actions`,{method:'POST',headers:{Authorization:`Bearer ${this.token}`,'Content-Type':'application/json','Idempotency-Key':actionKey},body:JSON.stringify({type,communityId,messageId,memberId,notice,actionKey}),signal:AbortSignal.timeout(6000)});
      if (!response.ok) return {status:'failed',detail:`連接器 HTTP ${response.status}`};
      const body=await response.json();
      return body.ok===true && body.confirmed===true && typeof body.confirmationId==='string' && body.confirmationId
        ? {status:'succeeded',confirmationId:body.confirmationId}
        : {status:'unconfirmed',detail:'連接器未回傳可驗證的操作結果'};
    }catch{return {status:'failed',detail:'連接器逾時或連線錯誤'};}
  }
}
