
/* LINE Workforce static client. Demo runs against an intentionally isolated, fictional Supabase tenant. */
const API='https://unapiwajmgqqtdkixaab.supabase.co';
const KEY='sb_publishable_L09XC4Tekm6cZaPTTczm3g_Aap-SOSy'; // Publishable, never service_role.
const DEMO_ID='98d3505c-cbe6-46ed-a95a-13672e6d98f4';
const TABS={
 overview:['工作總覽','掌握團隊今天的排班、打卡及待審事項。'],
 schedule:['排班管理','查看、建立與發布班表，避免排班時間重疊。'],
 punch:['出勤打卡','打卡使用資料庫伺服器時間，並保留每次原始紀錄。'],
 requests:['請假與加班','建立請假、加班及補卡申請並追蹤審核結果。'],
 approvals:['審核中心','主管審核請假、補卡與加班申請，紀錄不可重複核准。'],
 employees:['員工與分店','管理企業員工、部門分店與聘僱型態。'],
 reports:['工時報表','查詢員工出勤與假期額度，匯出 CSV。'],
 settings:['系統資訊','檢視資料庫狀態、測試模式與功能限制。']
};
const app={mode:'demo',token:null,user:null,tenantId:DEMO_ID,tenants:[],data:null,tab:'overview',date:today(),focusMember:'',busy:false};
const $=id=>document.getElementById(id);
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function dayAdd(s,n){const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function taiDay(s){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(s));}
function taiTime(s){return new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(s));}
function taiStamp(s){return new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(s));}
function tzIso(input){if(!input)return '';return new Date(input+':00+08:00').toISOString();}
function status(v){const names={published:'已發布',draft:'草稿',cancelled:'已取消',pending:'待審核',approved:'已核准',rejected:'已駁回',active:'在職',inactive:'停用'};return '<span class="chip '+esc(v)+'">'+esc(names[v]||v)+'</span>';}
function kind(v){return ({IN:'上班',OUT:'下班',BREAK_START:'休息開始',BREAK_END:'休息結束',leave:'請假',correction:'補卡',overtime:'加班',swap:'換班',annual:'特休',sick:'病假',personal:'事假',other:'其他假'})[v]||v;}
function person(id){return (app.data?.members||[]).find(x=>x.id===id);}
function branch(id){return (app.data?.branches||[]).find(x=>x.id===id);}
function personLabel(id){return esc(person(id)?.display_name||'未知員工');}
function options(items,labelFn,selected=''){return items.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===selected?'selected':'')+'>'+esc(labelFn(x))+'</option>').join('');}
function role(){if(app.mode==='demo')return 'owner';return (app.data?.members||[]).find(x=>x.user_id===app.user?.id)?.role||'employee';}
function manager(){return app.mode==='demo'||['owner','hr','manager'].includes(role());}
function banner(m,err=false){$('toast').insertAdjacentHTML('beforeend','<div class="toast '+(err?'error':'')+'">'+esc(m)+'</div>');setTimeout(()=>{const e=$('toast').firstElementChild;if(e)e.remove();},4800);}
async function call(url,method='GET',data=null,token=KEY){const headers={apikey:KEY};if(token!==KEY)headers.Authorization='Bearer '+token;if(data!==null)headers['Content-Type']='application/json';if(method==='POST'||method==='PATCH')headers.Prefer='return=representation';const res=await fetch(API+url,{method,headers,body:data===null?undefined:JSON.stringify(data),cache:'no-store'});const text=await res.text();let j;try{j=text?JSON.parse(text):null;}catch{j={message:text.slice(0,200)};}if(!res.ok)throw Error(j?.message||j?.error_description||j?.error||'連線失敗 ('+res.status+')');return j;}
async function demo(action='snapshot',data={}){return call('/rest/v1/rpc/wm_demo_api','POST',{p_action:action,p_data:data});}
async function query(table,params=''){return call('/rest/v1/'+table+'?'+params,'GET',null,app.token);}
async function reload(silent=false){
 if(app.busy)return;
 app.busy=true;if(!silent)$('appContent').innerHTML='<div class="loading">資料更新中，請稍後...</div>';
 try{
  if(app.mode==='demo'){app.data=await demo();}
  else if(!app.token){app.data=null;}
  else{
   app.tenants=await query('wm_tenants','select=id,name,is_demo&order=name');
   if(!app.tenants.find(t=>t.id===app.tenantId))app.tenantId=app.tenants[0]?.id||'';
   if(!app.tenantId){app.data=null;}else{
    const p='tenant_id=eq.'+encodeURIComponent(app.tenantId);
    const [branches,members,shifts,punches,requests,entitlements,availability]=await Promise.all([
     query('wm_branches','select=*&'+p+'&order=name'),query('wm_members','select=*&'+p+'&order=employee_code'),
     query('wm_shifts','select=*&'+p+'&order=starts_at.desc&limit=600'),query('wm_punches','select=*&'+p+'&order=punched_at.desc&limit=600'),
     query('wm_requests','select=*&'+p+'&order=created_at.desc&limit=300'),query('wm_leave_entitlements','select=*&'+p),
     query('wm_availability','select=*&'+p+'&limit=200')]);
    app.data={tenant:app.tenants.find(t=>t.id===app.tenantId),branches,members,shifts,punches,requests,entitlements,availability,server_at:new Date().toISOString()};
   }
  }
  $('connectionLabel').textContent=app.data?'已連線 Supabase 資料庫':'尚未登入';
  if(!silent)banner(app.data?'已取得最新資料':'請先登入或建立企業');
 }catch(e){$('connectionLabel').textContent='資料庫連線異常';if(!silent)banner(e.message,true);$('appContent').innerHTML='<div class="error">'+esc(e.message)+'<p><button class="btn" id="retryLoad">重新載入</button></p></div>';app.busy=false;return;}
 app.busy=false;render();
}
async function action(name,data){
 if(app.busy)return;
 app.busy=true;
 try{
  let result;
  if(app.mode==='demo'){result=await demo(name,data);}
  else{
   if(!app.token||!app.tenantId)throw Error('請先登入企業');
   const tenant_id=app.tenantId;
   if(name==='employee')result=await call('/rest/v1/wm_members','POST',{tenant_id,branch_id:data.branch_id,display_name:data.name,employee_code:data.code,role:data.role||'employee',employment_type:data.employment_type||'full_time'},app.token);
   else if(name==='branch')result=await call('/rest/v1/wm_branches','POST',{tenant_id,name:data.name},app.token);
   else if(name==='shift')result=await call('/rest/v1/wm_shifts','POST',{tenant_id,member_id:data.member_id,branch_id:data.branch_id,starts_at:data.starts_at,ends_at:data.ends_at,status:data.status||'published',notes:data.notes||'',created_by:app.user.id},app.token);
   else if(name==='shift_status')result=await call('/rest/v1/wm_shifts?id=eq.'+encodeURIComponent(data.id)+'&tenant_id=eq.'+encodeURIComponent(tenant_id),'PATCH',{status:data.status,updated_at:new Date().toISOString()},app.token);
   else if(name==='clock')result=await call('/rest/v1/rpc/wm_clock','POST',{p_member:data.member_id,p_kind:data.kind,p_key:data.key,p_lat:data.latitude||null,p_lng:data.longitude||null,p_accuracy:data.accuracy||null},app.token);
   else if(name==='request')result=await call('/rest/v1/rpc/wm_submit_request','POST',{p_member:data.member_id,p_kind:data.kind,p_start:data.starts_at,p_end:data.ends_at,p_reason:data.reason||'',p_leave_kind:data.leave_kind||null,p_target_member:null},app.token);
   else if(name==='decide')result=await call('/rest/v1/rpc/wm_decide_request','POST',{p_request:data.id,p_decision:data.status,p_note:data.note||''},app.token);
   else if(name==='availability')result=await call('/rest/v1/wm_availability','POST',{tenant_id,member_id:data.member_id,starts_at:data.starts_at,ends_at:data.ends_at,available:data.available,note:data.note||''},app.token);
   else throw Error('尚未支援此操作');
  }
  closeModal();app.busy=false;await reload(true);banner('已儲存到 Supabase 資料庫');
  return result;
 }catch(e){app.busy=false;banner(e.message,true);throw e;}
}
function setTab(tab){if(!TABS[tab])return;app.tab=tab;document.querySelectorAll('[data-tab]').forEach(el=>el.classList.toggle('active',el.dataset.tab===tab));document.querySelector('.sidebar').classList.remove('open');render();}
function heading(actions=''){const d=TABS[app.tab];$('pageTitle').textContent=d[0];$('pageName').textContent=d[0];$('pageDescription').textContent=d[1];$('pageActions').innerHTML=actions;}
function stat(label,value,note=''){return '<div class="stat"><div class="label">'+esc(label)+'</div><div class="value">'+esc(value)+'</div><div class="note">'+esc(note)+'</div></div>';}
function table(head,rows){return '<div class="table-wrap"><table class="data-table"><thead><tr>'+head.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+(rows.length?rows.join(''):'<tr><td colspan="'+head.length+'" class="empty">目前沒有資料</td></tr>')+'</tbody></table></div>';}
function tr(cells){return '<tr>'+cells.map(x=>'<td>'+x+'</td>').join('')+'</tr>';}
function panel(title,content,actions=''){return '<div class="panel"><div class="section-title"><h2>'+title+'</h2>'+actions+'</div>'+content+'</div>';}
function rowButtons(id,mode){if(!manager())return '';if(mode==='shift')return '<button class="btn small danger" data-action="cancelShift" data-id="'+id+'">取消班次</button>';if(mode==='draft')return '<button class="btn small" data-action="publishShift" data-id="'+id+'">發布</button>';return '';}
function memberFilter(selected='',name='member_id'){let arr=app.data?.members||[];if(app.mode==='real'&&!manager())arr=arr.filter(m=>m.user_id===app.user?.id);return '<select name="'+name+'" required>'+options(arr,m=>m.display_name+' · '+m.employee_code,selected)+'</select>';}
function branchFilter(selected='',name='branch_id'){return '<select name="'+name+'" required>'+options(app.data?.branches||[],b=>b.name,selected)+'</select>';}
function getSelected(){const arr=app.data?.members||[];if(!arr.some(m=>m.id===app.focusMember)){app.focusMember=(app.mode==='real'&&!manager()?arr.find(x=>x.user_id===app.user?.id):arr.find(x=>x.role==='employee')||arr[0])?.id||'';}return app.focusMember;}
function overview(){
 const d=app.data,m=d.members||[],s=d.shifts||[],req=d.requests||[],p=d.punches||[];
 const todayShifts=s.filter(x=>taiDay(x.starts_at)===today()&&x.status==='published');
 const todayPunch=p.filter(x=>taiDay(x.punched_at)===today());
 const pending=req.filter(x=>x.status==='pending');
 heading();
 const cards='<div class="cards">'+stat('員工總數',m.filter(x=>x.status==='active').length,'目前在職人數')+stat('今日排班',todayShifts.length,'已發布的班次')+stat('今日打卡',todayPunch.length,'伺服器實際紀錄')+stat('待審申請',pending.length,'請假、加班、補卡')+'</div>';
 const shiftRows=todayShifts.sort((a,b)=>a.starts_at.localeCompare(b.starts_at)).map(s=>tr([personLabel(s.member_id),esc(branch(s.branch_id)?.name||''),taiTime(s.starts_at)+'–'+taiTime(s.ends_at),status(s.status)]));
 const act=p.slice(0,6).map(x=>'<li><span><b>'+personLabel(x.member_id)+'</b>　'+esc(kind(x.kind))+'</span><small>'+taiStamp(x.punched_at)+'</small></li>').join('')||'<li class="muted">尚無打卡紀錄</li>';
 const reqRows=pending.slice(0,6).map(x=>tr([personLabel(x.member_id),esc(kind(x.kind)),taiDay(x.starts_at),status(x.status)]));
 $('appContent').innerHTML=cards+'<div class="panels">'+panel('今日排班',table(['員工','分店','時間','狀態'],shiftRows),'<button class="btn small" data-action="gotoSchedule">完整班表</button>')+panel('最近打卡','<ul class="activity">'+act+'</ul>')+'</div>'+panel('待審核申請',table(['員工','項目','開始日期','狀態'],reqRows),'<button class="btn small" data-action="gotoApprovals">進入審核</button>');
}
function schedule(){
 const date=app.date;const d=new Date(date+'T12:00:00Z');const mon=dayAdd(date,-((d.getUTCDay()+6)%7));
 const week=Array.from({length:7},(_,i)=>dayAdd(mon,i));const shifts=app.data.shifts||[];
 heading(manager()?'<button class="btn primary" data-action="newShift">＋ 新增班次</button>':'');
 const cards=week.map(day=>{
  const entries=shifts.filter(x=>taiDay(x.starts_at)===day&&x.status!=='cancelled').sort((a,b)=>a.starts_at.localeCompare(b.starts_at));
  return '<div class="day '+(day===today()?'today':'')+'"><strong>'+esc(day.slice(5))+'　'+esc('一二三四五六日'[week.indexOf(day)])+'</strong>'+entries.map(x=>'<div class="shift-card '+esc(x.status)+'"><b>'+personLabel(x.member_id)+'</b><span>'+taiTime(x.starts_at)+'－'+taiTime(x.ends_at)+'</span><div class="muted">'+esc(branch(x.branch_id)?.name||'')+' · '+esc(x.status==='draft'?'草稿':'已發布')+'</div></div>').join('')+(entries.length?'':'<span class="muted">無排班</span>')+'</div>';
 }).join('');
 const rows=shifts.filter(x=>taiDay(x.starts_at)>=mon&&taiDay(x.starts_at)<=week[6]).sort((a,b)=>a.starts_at.localeCompare(b.starts_at)).map(x=>tr([personLabel(x.member_id),esc(branch(x.branch_id)?.name||''),taiStamp(x.starts_at),taiStamp(x.ends_at),status(x.status),rowButtons(x.id,x.status==='draft'?'draft':'shift')]));
 $('appContent').innerHTML='<div class="panel"><div class="toolbar"><div class="field"><label>查看週次</label><input id="weekPicker" class="filter" type="date" value="'+esc(date)+'"></div><button class="btn" data-action="prevWeek">上一週</button><button class="btn" data-action="nextWeek">下一週</button><button class="btn" data-action="todayWeek">今天</button></div><div class="schedule-week">'+cards+'</div></div>'+panel('本週班表明細',table(['員工','分店','開始','結束','狀態','操作'],rows));
}
function punch(){
 const sel=getSelected();const punches=(app.data.punches||[]).filter(x=>x.member_id===sel).slice(0,40);
 heading();
 const history=table(['時間（台灣）','類型','來源'],punches.map(x=>tr([taiStamp(x.punched_at),esc(kind(x.kind)),esc(x.source||'web')])));
 const buttons=['IN','OUT','BREAK_START','BREAK_END'].map(k=>'<button type="button" data-action="clock" data-kind="'+k+'" class="btn '+(k==='IN'?'primary':'')+'">'+esc(kind(k))+'打卡</button>').join('');
 const roleDemo=app.mode==='demo'?'<div class="notice warning">DEMO 可切換虛構員工模擬操作；正式模式會由資料庫確認打卡者身分，不允許替其他員工打卡。</div>':'';
 $('appContent').innerHTML='<div class="split">'+panel('快速打卡',roleDemo+'<div class="field"><label>員工</label><select id="punchMember">'+options((app.mode==='real'&&!manager()?app.data.members.filter(x=>x.user_id===app.user?.id):app.data.members),x=>x.display_name+' · '+x.employee_code,sel)+'</select></div><p class="muted">定位資訊由使用者授權後才會讀取。沒有 GPS 的測試門市仍可打卡。</p><div class="flex">'+buttons+'</div><div class="inset" style="margin-top:18px"><strong>當前伺服器時間</strong><p id="serverTime">'+esc(taiStamp(new Date()))+'</p></div>')+panel('最近打卡紀錄',history)+'</div>';
}
function requests(){
 const sel=getSelected(),req=(app.data.requests||[]).slice(0,50);
 heading('<button class="btn primary" data-action="newRequest">＋ 新增申請</button>');
 const rows=req.map(x=>tr([personLabel(x.member_id),esc(kind(x.kind))+(x.kind==='leave'?' · '+esc(kind(x.leave_kind)):''),
 taiStamp(x.starts_at),taiStamp(x.ends_at),status(x.status),esc(x.reason||'—')]));
 const balances=(app.data.entitlements||[]).filter(x=>x.member_id===sel).map(x=>{
  const used=(app.data.requests||[]).filter(r=>r.member_id===sel&&r.kind==='leave'&&r.leave_kind===x.leave_kind&&r.status==='approved'&&Number(r.starts_at.slice(0,4))===x.year).reduce((a,r)=>a+(new Date(r.ends_at)-new Date(r.starts_at))/3600000,0);
  return '<div class="bar-row"><span>'+esc(kind(x.leave_kind))+' · '+x.year+'</span><strong>剩餘 '+Math.max(0,Number(x.hours)-used).toFixed(1)+' / '+Number(x.hours).toFixed(1)+' 小時</strong></div>';
 }).join('');
 $('appContent').innerHTML=panel('申請紀錄',table(['員工','項目','開始','結束','結果','說明'],rows))+'<div class="split">'+panel('假期額度','<div class="field"><label>查詢員工</label><select id="balanceMember">'+options(app.data.members,x=>x.display_name,sel)+'</select></div>'+balances)+panel('申請注意事項','<div class="notice">核准後會記錄審核時間與結果。原始出勤紀錄不會因申請或補卡被覆寫。</div><p class="muted">目前的額度是示範資料，不代表法定特休、病假給付的自動法令計算。</p>')+'</div>';
}
function approvals(){
 heading();
 const req=(app.data.requests||[]);const pending=req.filter(x=>x.status==='pending');
 const rows=req.map(x=>tr([personLabel(x.member_id),esc(kind(x.kind)),esc(kind(x.leave_kind||'')),taiStamp(x.starts_at),taiStamp(x.ends_at),status(x.status),
 x.status==='pending'&&manager()?'<div class="flex"><button class="btn small primary" data-action="approve" data-id="'+x.id+'">核准</button><button class="btn small danger" data-action="reject" data-id="'+x.id+'">駁回</button></div>':'<span class="muted">'+esc(x.decision_note||'已處理')+'</span>']));
 $('appContent').innerHTML='<div class="cards">'+stat('待審件數',pending.length,'待處理的全部申請')+stat('已核准',req.filter(x=>x.status==='approved').length,'累計件數')+stat('已駁回',req.filter(x=>x.status==='rejected').length,'累計件數')+stat('申請總量',req.length,'資料庫申請紀錄')+'</div>'+panel('簽核工作清單',table(['員工','申請','假別','開始','結束','狀態','操作'],rows))+
 (!manager()?'<div class="notice warning">只有主管或人資可以執行審核。</div>':'');
}
function employees(){
 heading(manager()?'<button class="btn primary" data-action="newEmployee">＋ 新增員工</button>':'');
 const rows=(app.data.members||[]).map(x=>tr(['<span class="person"><span class="avatar">'+esc(x.display_name[0]||'?')+'</span>'+esc(x.display_name)+'</span>',esc(x.employee_code),esc(branch(x.branch_id)?.name||'—'),esc(({owner:'擁有者',manager:'店長',hr:'人資',employee:'員工'})[x.role]||x.role),esc(x.employment_type==='part_time'?'兼職':'正職'),status(x.status)]));
 $('appContent').innerHTML=panel('企業員工　'+app.data.members.length+' 人',table(['姓名','員工編號','分店','角色','聘僱型態','狀態'],rows))+
 panel('分店據點',table(['分店','定位打卡','範圍'],app.data.branches.map(x=>tr([esc(x.name),x.gps_required?'需要 GPS':'未強制 GPS',esc(x.radius_m)+' 公尺']))),manager()?'<button class="btn small" data-action="newBranch">＋ 新增分店</button>':'')+
 '<div class="notice warning">公開 DEMO 的員工皆為虛構人物；正式企業員工邀請與 LINE 身分綁定尚待整合。</div>';
}
function reports(){
 heading('<button class="btn primary" data-action="exportCsv">⬇ 匯出 CSV</button>');
 const people=app.data.members||[];
 const start=app.date;const end=dayAdd(start,6);
 const rows=people.map(m=>{
 const entries=(app.data.punches||[]).filter(p=>p.member_id===m.id&&taiDay(p.punched_at)>=start&&taiDay(p.punched_at)<=end).sort((a,b)=>a.punched_at.localeCompare(b.punched_at));
 let inAt=null,secs=0;
 entries.forEach(p=>{if(p.kind==='IN')inAt=p.punched_at;if(p.kind==='OUT'&&inAt){secs+=(new Date(p.punched_at)-new Date(inAt))/1000;inAt=null;}});
 const hours=Math.max(0,secs/3600);
 return {m,entries,hours};
 });
 app.reportRows=rows;
 $('appContent').innerHTML='<div class="cards">'+stat('期間',start.slice(5)+'～'+end.slice(5),'統計起訖日')+stat('打卡筆數',rows.reduce((a,b)=>a+b.entries.length,0),'上下班與休息事件')+stat('核算工時',rows.reduce((a,b)=>a+b.hours,0).toFixed(1),'僅按成對 IN/OUT 計算')+stat('員工人數',people.length,'包含未打卡員工')+'</div>'+
 panel('期間打卡與工時','<div class="toolbar"><div class="field"><label>起始日期（7 日）</label><input type="date" class="filter" id="reportDate" value="'+esc(start)+'"></div><button class="btn" data-action="refreshReport">查詢</button></div>'+
 table(['員工','分店','打卡事件','已配對工時','未完成打卡'],rows.map(x=>tr([esc(x.m.display_name),esc(branch(x.m.branch_id)?.name||''),String(x.entries.length),x.hours.toFixed(2)+' 小時',x.entries.filter(e=>e.kind==='IN').length>x.entries.filter(e=>e.kind==='OUT').length?'有':'—'])))+
 '<div class="notice warning">這是以配對打卡計算的測試工時，不等於依法核認的加班、特休與薪資結算。跨日、休息及異常需要另外確認。</div>');
}
function settings(){
 heading();
 $('appContent').innerHTML=panel('目前連線狀態','<div class="bar-row"><span>模式</span><strong>'+esc(app.mode==='demo'?'公開測試租戶':'正式 Supabase Auth')+'</strong></div><div class="bar-row"><span>企業</span><strong>'+esc(app.data.tenant?.name||'—')+'</strong></div><div class="bar-row"><span>後端</span><strong>Supabase PostgreSQL</strong></div><div class="bar-row"><span>資料更新</span><strong>'+esc(taiStamp(app.data.server_at||new Date()))+'</strong></div><div class="bar-row"><span>前端</span><strong>GitHub Pages（靜態網頁）</strong></div><div class="notice">打卡、申請、核准與班表透過 Supabase API 即時讀寫，並非 localStorage 的假資料。</div>')+
 panel('開發與限制說明','<div class="bar-row"><span>已接通</span><strong>員工／分店、排班、打卡、請假、審核、CSV 匯出</strong></div><div class="bar-row"><span>尚未接通</span><strong>LINE LIFF / OA、動態 QR、正式人資邀請</strong></div><div class="bar-row"><span>需後續驗收</span><strong>法定工時計算、月結、加班與複雜輪班規則</strong></div><p><a href="https://github.com/hub-google/LINE/blob/main/workforce-management/PRD.md" target="_blank" rel="noopener noreferrer">查看完整 PRD</a></p>');
}
function noTenant(){
 heading();
 $('appContent').innerHTML='<div class="panel"><h2>歡迎使用 LINE Workforce</h2><p class="muted">'+(app.token?'目前帳號尚未加入任何企業，你可以建立自己的測試企業。':'請登入企業帳號，或使用上方公開 DEMO 直接試用。')+'</p><button class="btn primary" data-action="'+(app.token?'createTenant':'login')+'">'+(app.token?'建立企業':'企業登入')+'</button> <button class="btn" data-action="demoMode">使用公開 DEMO</button></div>';
}
function render(){
 $('modePill').textContent=app.mode==='demo'?'公開 DEMO':'企業模式';
 $('modePill').className='pill '+(app.mode==='demo'?'demo-pill':'real-pill');
 $('demoBanner').hidden=app.mode!=='demo';
 $('authBtn').textContent=app.token?'登出':'企業登入';
 $('tenantPicker').hidden=app.mode==='demo'||app.tenants.length<2;
 $('tenantPicker').innerHTML=app.tenants.map(t=>'<option value="'+esc(t.id)+'" '+(t.id===app.tenantId?'selected':'')+'>'+esc(t.name)+'</option>').join('');
 const pending=app.data?.requests?.filter(x=>x.status==='pending').length||0;
 $('pendingDot').hidden=!pending;$('pendingDot').textContent=pending;
 if(!app.data){noTenant();return;}
 const fn={overview,schedule,punch,requests,approvals,employees,reports,settings}[app.tab]||overview;fn();
}
function openModal(title,body){
 $('overlay').hidden=false;$('overlay').innerHTML='<div class="modal" role="dialog" aria-modal="true" aria-label="'+esc(title)+'"><div class="modal-head"><h2>'+esc(title)+'</h2><button type="button" class="icon-btn" data-action="closeModal" aria-label="關閉">×</button></div>'+body+'</div>';
 $('overlay').querySelector('input,select,textarea')?.focus();
}
function closeModal(){$('overlay').hidden=true;$('overlay').innerHTML='';}
function formFields(items){return items.map(i=>'<div class="field '+(i.wide?'wide':'')+'"><label for="'+esc(i.name)+'">'+esc(i.label)+'</label>'+i.html+'</div>').join('');}
function modalForm(name,fields,submit='儲存'){return '<form data-form="'+name+'"><div class="form-grid">'+formFields(fields)+'</div><div class="modal-actions"><button type="button" class="btn" data-action="closeModal">取消</button><button type="submit" class="btn primary">'+esc(submit)+'</button></div></form>';}
function input(name,type='text',value='',extras=''){return '<input id="'+name+'" name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+extras+(name==='notes'?'':' required')+'>';}
function selectField(name,html){return '<select id="'+name+'" name="'+name+'" required>'+html+'</select>';}
function showShift(){
 const day=app.date;
 const body=modalForm('shift',[
 {name:'member_id',label:'員工',html:memberFilter(getSelected())},
 {name:'branch_id',label:'上班分店',html:branchFilter()},
 {name:'starts_at',label:'上班時間',html:input('starts_at','datetime-local',day+'T09:00')},
 {name:'ends_at',label:'下班時間',html:input('ends_at','datetime-local',day+'T18:00')},
 {name:'status',label:'狀態',html:selectField('status','<option value="published">立即發布</option><option value="draft">儲存草稿</option>')},
 {name:'notes',label:'備註',html:input('notes','text','','maxlength="120"'),wide:true}
 ],'建立班次');
 openModal('新增排班',body);
}
function showRequest(){
 const day=today();
 const body=modalForm('request',[
 {name:'member_id',label:'申請員工',html:memberFilter(getSelected())},
 {name:'kind',label:'申請項目',html:selectField('kind','<option value="leave">請假</option><option value="overtime">加班</option><option value="correction">補卡／出勤更正</option><option value="swap">換班</option>')},
 {name:'leave_kind',label:'假別（請假時）',html:selectField('leave_kind','<option value="annual">特休</option><option value="sick">病假</option><option value="personal">事假</option><option value="other">其他假</option>')},
 {name:'starts_at',label:'開始時間',html:input('starts_at','datetime-local',day+'T09:00')},
 {name:'ends_at',label:'結束時間',html:input('ends_at','datetime-local',day+'T18:00')},
 {name:'reason',label:'原因／說明',wide:true,html:'<textarea id="reason" name="reason" maxlength="500" placeholder="請填寫申請原因"></textarea>'}
 ],'送出申請');
 openModal('新增請假／加班／補卡申請',body);
}
function showEmployee(){openModal('新增員工',modalForm('employee',[
{name:'name',label:'員工姓名',html:input('name','text','','maxlength="40"')},
{name:'code',label:'員工編號',html:input('code','text','','maxlength="20"')},
{name:'branch_id',label:'分店',html:branchFilter()},
{name:'role',label:'角色',html:selectField('role','<option value="employee">員工</option><option value="manager">店長／主管</option>')},
{name:'employment_type',label:'聘僱類型',html:selectField('employment_type','<option value="full_time">正職</option><option value="part_time">兼職</option>'),wide:true}
 ],'新增員工'));}
function showBranch(){openModal('新增分店',modalForm('branch',[{name:'name',label:'分店名稱',html:input('name','text','','maxlength="60"'),wide:true}],'建立分店'));}
function showAuth(){
 const body='<div class="tabs-secondary"><button type="button" class="active" id="loginTab">登入</button><button type="button" id="registerTab">註冊</button></div>'+
 '<form data-form="auth"><div class="form-grid"><div class="field wide"><label>電子郵件</label><input type="email" name="email" required autocomplete="email"></div><div class="field wide"><label>密碼</label><input type="password" name="password" minlength="8" required autocomplete="current-password"></div></div><div class="modal-actions"><button class="btn primary" type="submit" id="authSubmit">登入</button></div></form>'+
 '<div class="auth-note">正式企業採 Supabase Auth 與資料表 RLS 權限驗證，僅建立帳號不會自動加入他人企業。新帳號可能需要先完成電子郵件驗證。</div>';
 openModal('企業帳號登入',body);
 $('loginTab').onclick=()=>authTab(false);$('registerTab').onclick=()=>authTab(true);
}
let register=false;
function authTab(v){register=v;$('registerTab').classList.toggle('active',v);$('loginTab').classList.toggle('active',!v);$('authSubmit').textContent=v?'建立帳號':'登入';}
function showTenant(){openModal('建立企業',modalForm('tenant',[{name:'name',label:'企業名稱',html:input('name','text','','maxlength="120"'),wide:true}],'建立企業')); }
function csvSave(){
 const data=[['員工編號','姓名','分店','打卡筆數','配對工時(小時)'],...(app.reportRows||[]).map(x=>[x.m.employee_code,x.m.display_name,branch(x.m.branch_id)?.name||'',x.entries.length,x.hours.toFixed(2)])];
 const csv='\uFEFF'+data.map(row=>row.map(c=>'"'+String(c).replaceAll('"','""')+'"').join(',')).join('\r\n');
 const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='LINE-Workforce-'+app.date+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);banner('CSV 已產生');
}
async function clockPunch(kindValue){
 const member=$('punchMember')?.value||getSelected();if(!member)return banner('請先選擇員工',true);
 const key='wm-'+crypto.randomUUID();const payload={member_id:member,kind:kindValue,key};
 // Location is optional for demo unless a branch has gps_required; production validation lives in wm_clock.
 if(navigator.geolocation&&app.mode==='real'){
  try{const pos=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:5000,maximumAge:0}));payload.latitude=pos.coords.latitude;payload.longitude=pos.coords.longitude;payload.accuracy=pos.coords.accuracy;}
  catch{ /* Server will reject if the relevant branch requires GPS. */ }
 }
 await action('clock',payload);
}
async function approve(id,approved){if(!confirm(approved?'確定要核准這筆申請？':'確定要駁回這筆申請？'))return;const note=approved?'':'主管駁回';await action('decide',{id,status:approved?'approved':'rejected',note});}
document.querySelector('#nav').addEventListener('click',e=>{const btn=e.target.closest('[data-tab]');if(btn)setTab(btn.dataset.tab);});
$('menuToggle').onclick=()=>document.querySelector('.sidebar').classList.toggle('open');
$('refreshBtn').onclick=()=>reload();
$('authBtn').onclick=()=>app.token?logout():showAuth();
$('switchReal').onclick=()=>{app.mode='real';app.data=null;app.tab='overview';render();showAuth();};
$('tenantPicker').onchange=async e=>{app.tenantId=e.target.value;await reload(true);};
$('appContent').addEventListener('change',e=>{
 if(e.target.id==='weekPicker'){app.date=e.target.value;render();}
 if(e.target.id==='reportDate'){app.date=e.target.value;render();}
 if(e.target.id==='punchMember'){app.focusMember=e.target.value;render();}
 if(e.target.id==='balanceMember'){app.focusMember=e.target.value;render();}
});
$('appContent').addEventListener('click',async e=>{
 const b=e.target.closest('[data-action]');if(!b)return;
 const a=b.dataset.action,id=b.dataset.id;
 try{
 if(a==='gotoSchedule')setTab('schedule');else if(a==='gotoApprovals')setTab('approvals');
 else if(a==='newShift')showShift();else if(a==='newRequest')showRequest();else if(a==='newEmployee')showEmployee();else if(a==='newBranch')showBranch();
 else if(a==='prevWeek'){app.date=dayAdd(app.date,-7);render();}
 else if(a==='nextWeek'){app.date=dayAdd(app.date,7);render();}
 else if(a==='todayWeek'){app.date=today();render();}
 else if(a==='refreshReport')render();else if(a==='exportCsv')csvSave();
 else if(a==='clock')await clockPunch(b.dataset.kind);
 else if(a==='approve')await approve(id,true);else if(a==='reject')await approve(id,false);
 else if(a==='cancelShift'||a==='publishShift'){if(confirm('確認更新班別狀態？'))await action('shift_status',{id,status:a==='cancelShift'?'cancelled':'published'});}
 else if(a==='createTenant')showTenant();else if(a==='login')showAuth();
 else if(a==='demoMode'){app.mode='demo';app.token=null;app.tenantId=DEMO_ID;app.tenants=[];await reload(true);}
 else if(a==='retryLoad')await reload();
 }catch(e){/* handled by action */ }
});
$('overlay').addEventListener('click',e=>{const btn=e.target.closest('[data-action="closeModal"]');if(btn)closeModal();if(e.target===$('overlay'))closeModal();});
$('overlay').addEventListener('submit',async e=>{
 const form=e.target;if(!form.matches('[data-form]'))return;e.preventDefault();
 const f=Object.fromEntries(new FormData(form).entries());const submit=form.querySelector('button[type=submit]');submit.disabled=true;
 try{
  if(form.dataset.form==='auth'){
   const ep=register?'/auth/v1/signup':'/auth/v1/token?grant_type=password';
   const result=await call(ep,'POST',{email:f.email,password:f.password});
   if(register && !result.access_token){banner('註冊已送出，請先到信箱完成驗證');closeModal();return;}
   const token=result.access_token||result.session?.access_token,user=result.user||result.session?.user;
   if(!token||!user)throw Error('登入未取得有效工作階段，請確認信箱驗證');
   app.token=token;app.user=user;app.mode='real';app.tenantId='';
   sessionStorage.setItem('wm_auth',JSON.stringify({token,user}));
   closeModal();await reload(true);banner('企業帳號登入成功');
  }else if(form.dataset.form==='tenant'){
   const result=await call('/rest/v1/wm_tenants','POST',{name:f.name,created_by:app.user.id},app.token);
   app.tenantId=result[0]?.id||'';closeModal();await reload(true);banner('企業建立完成');
  }else{
   if(f.starts_at)f.starts_at=tzIso(f.starts_at);
   if(f.ends_at)f.ends_at=tzIso(f.ends_at);
   if(form.dataset.form==='request'&&f.kind!=='leave')f.leave_kind=null;
   await action(form.dataset.form,f);
  }
 }catch(err){banner(err.message,true);submit.disabled=false;}
});
function logout(){app.token=null;app.user=null;app.data=null;app.tenants=[];app.mode='demo';app.tenantId=DEMO_ID;sessionStorage.removeItem('wm_auth');reload(true);banner('已登出企業模式');}
try{const saved=JSON.parse(sessionStorage.getItem('wm_auth')||'null');if(saved?.token&&saved?.user){app.token=saved.token;app.user=saved.user;app.mode='real';app.tenantId='';}}catch{}
reload(true);
