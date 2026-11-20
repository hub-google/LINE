import { analyzeMessage } from './src/analyzer.js';

const $=id=>document.getElementById(id);
const demo=location.hostname.endsWith('.github.io') || location.protocol==='file:';
const demoCommunity={id:'demo-openchat',name:'示範社群（模擬資料）',mode:'monitor',blocked_domains:['scam-example.test'],allowed_member_keys:[],automation_approved:false};
const demoEvents=[
  {id:'demo-1',community_id:demoCommunity.id,preview:'官方客服請立即轉帳並輸入驗證碼 [網址已隱藏]',level:'critical',score:100,categories:['假冒客服','帳密釣魚'],created_at:'2026-11-19T04:12:00Z',status:'reviewable',is_privileged:false},
  {id:'demo-2',community_id:demoCommunity.id,preview:'限時領取獎金，歡迎私訊了解',level:'high',score:58,categories:['誘導詐騙'],created_at:'2026-11-19T04:08:00Z',status:'reviewable',is_privileged:false},
  {id:'demo-3',community_id:demoCommunity.id,preview:'我今天閱讀了防詐新聞，大家要小心假投資',level:'low',score:0,categories:[],created_at:'2026-11-19T03:50:00Z',status:'reviewable',is_privileged:false}
];
const emptyCaps={readMessage:false,readJoin:false,deleteOtherMessage:false,removeMember:false,blockMember:false,sendNotice:false};
const state={demo,authenticated:false,communities:demo?[demoCommunity]:[],events:demo?demoEvents:[],status:{connector:{status:'unavailable',capabilities:emptyCaps},dryRun:true,storage:'local'}};
const labels={critical:'緊急',high:'高',medium:'中',low:'低'};
const caps={readMessage:'讀取新訊息',readJoin:'讀取成員加入事件',deleteOtherMessage:'刪除其他成員訊息',removeMember:'移出成員',blockMember:'封鎖再次加入',sendNotice:'在社群發布警示'};
let toastTimer;
function elt(tag,text,cls){const node=document.createElement(tag);if(text!==undefined&&text!==null)node.textContent=String(text);if(cls)node.className=cls;return node;}
function clean(node){node.replaceChildren();return node;}
function append(node,...children){node.append(...children);return node;}
function toast(message){const t=$('toast');t.textContent=message;t.classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.add('hidden'),4000);}
async function api(path,method='GET',payload){const response=await fetch(path,{method,credentials:'same-origin',headers:payload?{'Content-Type':'application/json'}:{},body:payload?JSON.stringify(payload):undefined});let body={};try{body=await response.json();}catch{}if(!response.ok)throw new Error(body.error??`HTTP ${response.status}`);return body;}
function selectView(view){for(const node of document.querySelectorAll('.view'))node.classList.toggle('hidden',node.id!==`view-${view}`);for(const b of document.querySelectorAll('.nav-item'))b.classList.toggle('active',b.dataset.view===view);}
function formatDate(iso){try{return new Date(iso).toLocaleString('zh-TW',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});}catch{return '-';}}
function getCommunity(id){return state.communities.find(x=>x.id===id);}
function levelPill(level){return elt('span',labels[level]??level,`level level-${level}`);}
function renderBanner(){const banner=$('system-banner');const title=banner.querySelector('strong');const desc=banner.querySelector('p');const connected=state.status.connector.status==='connected';
  if(state.demo){title.textContent='GitHub Pages 展示模式';desc.textContent='以下事件都是示範資料，風險分析在瀏覽器執行。尚未連接 LINE OpenChat，也不會刪文或踢人。';}
  else if(!state.authenticated){title.textContent='尚未登入管理後台';desc.textContent='使用右上角的登入按鈕，登入後才能讀取社群設定與真實事件。';}
  else if(state.status.connector.status==='monitoring'){title.textContent='LINE.js 已登入，監控模式';desc.textContent=state.status.connector.detail;}
  else{title.textContent=connected?'連接器已回報連線（須實機驗證）':'OpenChat 連接器尚未接通';desc.textContent=`目前 ${state.status.dryRun?'Dry Run 模擬啟用':'Dry Run 已關閉'}；${connected?'操作仍須逐項取得確認結果。':'即使開啟全自動也不能真的刪文／踢人。'}`;}
  banner.classList.toggle('live',!state.demo&&state.authenticated&&connected);
  $('top-mode').textContent=state.demo?'展示模式':!state.authenticated?'尚未登入':state.status.dryRun?'Dry Run':'實際模式';
  $('auth-btn').textContent=state.demo?'GitHub 展示版':state.authenticated?'登出':'登入後台';
  $('auth-btn').disabled=state.demo;
}
function renderOverview(){const e=state.events;const high=e.filter(x=>['critical','high'].includes(x.level)).length;
  $('metric-groups').textContent=state.communities.length;$('metric-events').textContent=e.length;$('metric-critical').textContent=high;
  $('metric-success').textContent=state.demo?'0（示範）':String(state.status.confirmedSuccess??0);
  const list=clean($('latest-events'));
  if(!e.length)append(list,elt('div','目前沒有事件紀錄','empty'));
  e.slice(0,5).forEach(item=>{
    const icon=elt('div','!','event-icon');const body=elt('div',null,'event-body');
    append(body,elt('div',item.preview??'（無內容）','event-title'),elt('div',getCommunity(item.community_id)?.name??item.community_id,'event-desc'));
    const meta=elt('div',null,'event-meta');append(meta,levelPill(item.level),elt('span',formatDate(item.created_at)));body.append(meta);
    append(list,append(elt('div',null,'event-item'),icon,body));
  });
  const health=clean($('health-list'));const rows=[['訊息監控',state.status.connector.capabilities?.readMessage?'已回報支援':'未驗證'],['刪除他人訊息',state.status.connector.capabilities?.deleteOtherMessage?'已確認能力':'不可用'],['踢出社群成員',state.status.connector.capabilities?.removeMember?'已確認能力':'不可用'],['操作模式',state.demo?'模擬展示':state.status.dryRun?'Dry Run（模擬）':'可能執行真實操作']];
  rows.forEach(([label,value])=>append(health,append(elt('div',null,'health-row'),elt('span',label,'secondary'),elt('strong',value,'health-value'))));
}
function renderEvents(){const group=$('event-group').value,level=$('event-level').value;const events=state.events.filter(e=>(!group||group===e.community_id)&&(!level||level===e.level));const container=clean($('event-table'));
  if(!events.length){append(container,elt('div','沒有符合條件的事件。','empty'));return;}
  const table=elt('table');const head=elt('thead');const tr=elt('tr');['時間','社群','訊息摘要','風險','分數','處置'].forEach(t=>tr.append(elt('th',t)));head.append(tr);table.append(head);
  const tbody=elt('tbody');events.forEach(e=>{const row=elt('tr');append(row,elt('td',formatDate(e.created_at)),elt('td',getCommunity(e.community_id)?.name??e.community_id));
    const textCell=elt('td');textCell.append(elt('div',e.preview,'line'));row.append(textCell);
    const levelCell=elt('td');levelCell.append(levelPill(e.level));row.append(levelCell);row.append(elt('td',e.score));
    const actions=elt('td');if(state.demo)actions.append(elt('span','展示事件（無實際操作）'));
    else if(!state.authenticated)actions.append(elt('span','請先登入'));
    else{for(const [action,label] of [['delete_message','刪除此訊息'],['remove_member','踢出成員'],['block_member','加入黑名單']]){
      const b=elt('button',label,'action-button');b.onclick=()=>executeAction(e.id,action);actions.append(b);
    }}
    row.append(actions);tbody.append(row);});table.append(tbody);container.append(table);
}
function fillSelect(element,items,{placeholder=false}={}){const current=element.value;clean(element);if(placeholder)element.append(new Option('全部社群',''));items.forEach(c=>element.append(new Option(c.name,c.id)));if([...element.options].some(o=>o.value===current))element.value=current;}
function renderSettings(){fillSelect($('event-group'),state.communities,{placeholder:true});fillSelect($('test-group'),state.communities,{placeholder:true});fillSelect($('settings-group'),state.communities);setSettingsFields();
  const disabled=state.demo||!state.authenticated;$('create-group').querySelectorAll('input,button').forEach(e=>e.disabled=disabled);$('save-group').disabled=disabled;
  $('create-feedback').textContent=disabled?'展示模式只能查看介面；部署 API 並登入後才能新增社群。':'';
}
function setSettingsFields(){const c=getCommunity($('settings-group').value);$('settings-mode').value=c?.mode??'monitor';$('settings-domains').value=(c?.blocked_domains??[]).join('\n');$('settings-confirm').value='';}
function renderSystem(){const box=clean($('capabilities'));
  append(box,append(elt('div',null,'capability'),elt('strong','連接器狀態'),elt('span',state.status.connector.status==='connected'?'已連線（未代表實機通過）':state.status.connector.status==='monitoring'?'已登入（監控）':'未連線','bad')));
  Object.entries(caps).forEach(([key,label])=>append(box,append(elt('div',null,'capability'),elt('span',label),elt('strong',state.status.connector.capabilities?.[key]?'已回報支援':'尚未取得權限',state.status.connector.capabilities?.[key]?'good':'bad'))));
  append(box,append(elt('div',null,'capability'),elt('span','資料儲存'),elt('strong',state.demo?'示範資料':state.status.storage??'尚未登入')));
}
function render(){renderBanner();renderOverview();renderEvents();renderSettings();renderSystem();}
async function loadData(){if(state.demo){render();return;}try{await api('/api/session');state.authenticated=true;const [communities,events,status]=await Promise.all([api('/api/communities'),api('/api/events'),api('/api/status')]);
    state.communities=communities.communities;state.events=events.events;state.status=status;
  }catch(e){state.authenticated=false;state.communities=[];state.events=[];state.status={connector:{status:'unavailable',capabilities:emptyCaps},dryRun:true};}render();}
async function executeAction(eventId,type){if(state.demo)return toast('展示模式，不會真的操作 LINE。');
  if(!confirm('確定要嘗試對 LINE 執行此管理動作？若連接器未授權，系統只會記錄不可用結果。'))return;
  try{const {action}=await api(`/api/events/${encodeURIComponent(eventId)}/actions`,'POST',{type,confirm:'EXECUTE'});toast(`操作結果：${action.status}。${action.detail??''}`);await loadData();}catch(e){toast(e.message);}
}
function showResult(r){const box=clean($('analysis-result'));const score=elt('div',r.score,'score-number');score.append(elt('small',' / 100'));box.append(score,levelPill(r.level));
  box.append(elt('p',r.autoEligible?'規則具備高信心自動處置條件（仍須正式連接器與管理員啟用）。':'未達自動踢黑條件；依社群模式進行監控或人工審核。','help'));
  if(!r.reasons?.length)box.append(elt('div','未命中已知風險規則；不代表完全安全。','empty'));
  (r.reasons??[]).forEach(reason=>append(box,append(elt('div',null,'reason'),elt('strong',reason.code),elt('small',reason.detail))));
  if(r.ai)box.append(elt('p',`AI 複核：${r.ai.suspected?'疑似':'未判定'}／${r.ai.reason}`,'help'));
  box.append(elt('p','此頁為風險分析，沒有執行真實刪文、踢人或 LINE 通知。','help'));
}
async function analyze(){const text=$('test-text').value.trim();if(!text)return toast('請先輸入測試訊息。');const communityId=$('test-group').value;
  try{const risk=state.demo?analyzeMessage({text,isNewMember:$('test-new').checked,blockedDomains:getCommunity(communityId)?.blocked_domains??[]}):
    (await api('/api/analyze','POST',{text,communityId,isNewMember:$('test-new').checked,withAI:$('test-ai').checked})).risk;
    showResult(risk);
  }catch(e){toast(e.message);}
}
function wire(){document.querySelectorAll('.nav-item').forEach(b=>b.onclick=()=>selectView(b.dataset.view));document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>selectView(b.dataset.go));document.querySelectorAll('.refresh').forEach(b=>b.onclick=loadData);
  $('event-group').onchange=renderEvents;$('event-level').onchange=renderEvents;$('settings-group').onchange=setSettingsFields;$('analyze-btn').onclick=analyze;
  $('sample-normal').onclick=()=>{$('test-text').value='我今天看了假投資詐騙的新聞，提醒大家不要隨便相信保證獲利廣告。';};
  $('sample-risk').onclick=()=>{$('test-text').value='官方客服通知：請立即轉帳並提供簡訊驗證碼，再點擊 https://scam-example.test/verify';};
  $('auth-btn').onclick=async()=>{if(state.authenticated){try{await api('/api/logout','POST');await loadData();toast('已登出');}catch(e){toast(e.message);}return;}if(!state.demo)$('login-modal').classList.remove('hidden');};
  $('login-close').onclick=()=>$('login-modal').classList.add('hidden');
  $('login-form').onsubmit=async e=>{e.preventDefault();try{await api('/api/login','POST',{password:$('admin-password').value});$('admin-password').value='';$('login-modal').classList.add('hidden');await loadData();toast('登入成功');}catch(err){$('login-feedback').textContent=err.message;}};
  $('create-group').onsubmit=async e=>{e.preventDefault();try{await api('/api/communities','POST',{name:$('create-name').value,id:$('create-id').value});await loadData();toast('已新增社群（尚須 Connector 權限）');}catch(err){$('create-feedback').textContent=err.message;}};
  $('save-group').onclick=async()=>{const id=$('settings-group').value;if(!id)return toast('請先新增社群');try{await api(`/api/communities/${encodeURIComponent(id)}`,'PATCH',{mode:$('settings-mode').value,confirm:$('settings-confirm').value,blocked_domains:$('settings-domains').value.split('\n').map(x=>x.trim()).filter(Boolean)});await loadData();toast('設定已儲存');}catch(e){$('settings-feedback').textContent=e.message;}};
}
wire();loadData();
