
/* LINE Workforce static client. Demo runs against an intentionally isolated, fictional Supabase tenant. */
const API='https://unapiwajmgqqtdkixaab.supabase.co';
const KEY='sb_publishable_L09XC4Tekm6cZaPTTczm3g_Aap-SOSy'; // Publishable, never service_role.
const DEMO_ID='98d3505c-cbe6-46ed-a95a-13672e6d98f4';
const TABS={
 overview:['工作總覽','掌握團隊今天的排班、打卡及待審事項。'],
 schedule:['排班管理','查看、建立與發布班表，避免排班時間重疊。'],
 punch:['出勤打卡','上下班打卡並查看自己的出勤紀錄。'],
 requests:['差勤申請','分別提出請假、加班及補卡申請，查看審核進度。'],
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
function role(){if(app.mode==='demo')return 'owner';return (app.data?.members||[]).find(x=>x.tenant_id===app.tenantId&&x.user_id===app.user?.id)?.role||'employee';}
function manager(){return app.mode==='demo'||['owner','hr','manager'].includes(role());}
function banner(m,err=false){$('toast').insertAdjacentHTML('beforeend','<div class="toast '+(err?'error':'')+'">'+esc(m)+'</div>');setTimeout(()=>{const e=$('toast').firstElementChild;if(e)e.remove();},4800);}
async function call(url,method='GET',data=null,token=KEY,retry=true){const headers={apikey:KEY};if(token!==KEY)headers.Authorization='Bearer '+token;if(data!==null)headers['Content-Type']='application/json';if(method==='POST'||method==='PATCH')headers.Prefer=(method==='POST'&&['/rest/v1/wm_tenants','/rest/v1/wm_members'].includes(url)?'return=minimal':'return=representation');const res=await fetch(API+url,{method,headers,body:data===null?undefined:JSON.stringify(data),cache:'no-store'});const text=await res.text();let j;try{j=text?JSON.parse(text):null;}catch{j={message:text.slice(0,200)};}if(!res.ok&&res.status===401&&retry&&token!==KEY){const renewed=await renewSession();return call(url,method,data,renewed,false);}if(!res.ok)throw Error(j?.message||j?.error_description||j?.error||'連線失敗 ('+res.status+')');return j;}
async function renewSession(){
 let saved={};try{saved=JSON.parse(sessionStorage.getItem('wm_auth')||'{}')}catch{}
 if(!saved.refresh_token)throw Error('登入已過期，請重新登入企業帳號');
 const response=await fetch(API+'/auth/v1/token?grant_type=refresh_token',{
  method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},
  body:JSON.stringify({refresh_token:saved.refresh_token}),cache:'no-store'
 });
 const value=await response.json();
 if(!response.ok||!value.access_token)throw Error('登入有效期已結束，請重新登入');
 app.token=value.access_token;app.user=value.user||saved.user;
 sessionStorage.setItem('wm_auth',JSON.stringify({token:app.token,user:app.user,
  refresh_token:value.refresh_token||saved.refresh_token,expires_at:value.expires_at||0}));
 return app.token;
}
async function demo(action='snapshot',data={}){return call('/rest/v1/rpc/wm_demo_api','POST',{p_action:action,p_data:data});}
async function query(table,params=''){return call('/rest/v1/'+table+'?'+params,'GET',null,app.token);}
async function reload(silent=false){
 if(app.busy){app.reloadQueued=true;$('connectionLabel').textContent='資料更新中';return;}
 const loadingMode=app.mode,loadingToken=app.token;
 app.busy=true;$('connectionLabel').textContent='資料更新中';if(!silent)$('appContent').innerHTML='<div class="loading">資料更新中，請稍後...</div>';
 try{
  if(app.mode==='demo'){
   const [snapshot,leaveSnapshot,anomalySnapshot,scheduleRules,memberBranches]=await Promise.all([
    demo(),call('/rest/v1/rpc/wm_demo_leave_api','POST',{p_action:'snapshot',p_data:{}}),
    call('/rest/v1/rpc/wm_demo_attendance_api','POST',{p_action:'snapshot',p_data:{}}),
    call('/rest/v1/rpc/wm_demo_schedule_api','POST',{p_action:'snapshot',p_data:{}}),
    call('/rest/v1/rpc/wm_demo_branch_support','POST',{p_action:'snapshot',p_data:{}})]);
   app.data={...snapshot,...leaveSnapshot,...anomalySnapshot,scheduleRules,memberBranches};
  }
  else if(!app.token){app.data=null;}
  else{
   app.tenants=await query('wm_tenants','select=id,name,is_demo&order=name');
   if(!app.tenants.find(t=>t.id===app.tenantId))app.tenantId=app.tenants[0]?.id||'';
   if(!app.tenantId){app.data=null;}else{
    const p='tenant_id=eq.'+encodeURIComponent(app.tenantId);
    const [branches,members,shifts,punches,requests,entitlements,availability,departments,templates,requirements,notifications,closures,adjustments,corrections,leavePolicies,attendanceCases,attendanceRuleRows,requestDocs,scheduleRuleRows,memberBranches,qrSettings,leaveCancellations]=await Promise.all([
     query('wm_branches','select=*&'+p+'&order=name'),query('wm_members','select=id,tenant_id,branch_id,user_id,display_name,employee_code,role,employment_type,status,created_at,department_id,reports_to,job_title,hired_on,left_on,skills&'+p+'&order=employee_code'),
     query('wm_shifts','select=*&'+p+'&order=starts_at.desc&limit=600'),query('wm_punches','select=*&'+p+'&order=punched_at.desc&limit=600'),
     query('wm_requests','select=*&'+p+'&order=created_at.desc&limit=300'),query('wm_leave_entitlements','select=*&'+p),
     query('wm_availability','select=*&'+p+'&limit=200'),
     query('wm_departments','select=*&'+p),query('wm_shift_templates','select=*&'+p),query('wm_staffing_requirements','select=*&'+p),
     query('wm_notifications','select=*&'+p+'&order=created_at.desc&limit=200'),
     query('wm_period_closures','select=*&'+p+'&order=closed_at.desc&limit=36'),query('wm_period_adjustments','select=*&'+p+'&limit=300'),
     query('wm_attendance_adjustments','select=*&'+p+'&limit=300'),query('wm_leave_policies','select=*&'+p+'&order=effective_from.desc'),
     query('wm_attendance_anomalies','select=*&'+p+'&order=created_at.desc&limit=300'),
     query('wm_attendance_rules','select=*&'+p+'&limit=1'),query('wm_request_documents','select=*&'+p+'&order=created_at.desc&limit=300'),
     query('wm_schedule_rules','select=*&'+p+'&order=effective_from.desc&limit=10'),
     query('wm_member_branches','select=*&'+p+'&order=active_from.desc'),
     query('wm_branch_qr_settings','select=*&'+p),
     call('/rest/v1/rpc/wm_list_leave_cancellations','POST',{p_tenant:app.tenantId},app.token) ]);
    if(members.some(m=>m.user_id===app.user?.id&&['owner','hr'].includes(m.role))){
      const wages=await call('/rest/v1/rpc/wm_staff_wages','POST',{p_tenant:app.tenantId},app.token);
      const lookup=new Map((wages||[]).map(w=>[w.member_id,w.hourly_rate]));
      members.forEach(m=>{m.hourly_rate=lookup.has(m.id)?lookup.get(m.id):null;});
    }
    app.data={tenant:app.tenants.find(t=>t.id===app.tenantId),branches,members,shifts,punches,requests,
      entitlements,availability,departments,templates,requirements,notifications,closures,
      adjustments,corrections,leavePolicies,attendanceCases,attendanceRules:attendanceRuleRows[0]||null,requestDocs,scheduleRules:scheduleRuleRows.find(x=>x.effective_from<=today())||null,memberBranches,qrSettings,leaveCancellations,
      leaveBalances:{},requestStages:[],server_at:new Date().toISOString()};
    const selected=getSelected();
    if(selected){
      const [balances,steps]=await Promise.all([
       call('/rest/v1/rpc/wm_leave_balances','POST',{p_tenant:app.tenantId,p_member:selected,p_on:today()},app.token),
       call('/rest/v1/rpc/wm_request_step_status','POST',{p_tenant:app.tenantId},app.token)]);
      app.data.leaveBalances[selected]=balances;
      app.data.requestStages=steps;
    }
   }
  }
  if(app.reloadQueued||loadingMode!==app.mode||loadingToken!==app.token){
   app.busy=false;app.reloadQueued=false;app.data=null;return reload(true);
  }
  $('connectionLabel').textContent=app.data?'資料已同步':'尚未登入';
  if(!silent)banner(app.data?'已取得最新資料':'請先登入或建立企業');
 }catch(e){$('connectionLabel').textContent='資料庫連線異常';if(!silent)banner(e.message,true);$('appContent').innerHTML='<div class="error">'+esc(e.message)+'<p><button class="btn" id="retryLoad" data-action="retryLoad">重新載入</button></p></div>';app.busy=false;
  if(app.reloadQueued||loadingMode!==app.mode||loadingToken!==app.token){app.reloadQueued=false;return reload(true);}
  return;}
 app.busy=false;
 if(app.reloadQueued||loadingMode!==app.mode||loadingToken!==app.token){app.reloadQueued=false;return reload(true);}
 render();
}
async function action(name,data){
 if(app.busy)throw Error('上一個操作仍在處理中，請勿重複送出');
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
  closeModal();app.busy=false;await reload(true);banner(name==='request'?'申請已送出，等待審核':name==='clock'?'打卡已完成':'操作已完成');
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
function memberFilter(selected='',name='member_id'){let arr=app.data?.members||[];if(app.mode==='real'&&!manager())arr=arr.filter(m=>m.user_id===app.user?.id);return '<select name="'+name+'" required>'+options(arr,m=>m.display_name,selected)+'</select>';}
function branchFilter(selected='',name='branch_id'){return '<select name="'+name+'" required>'+options(app.data?.branches||[],b=>b.name,selected)+'</select>';}
function getSelected(){const arr=app.data?.members||[];if(!arr.some(m=>m.id===app.focusMember)){app.focusMember=(app.mode==='real'&&!manager()?arr.find(x=>x.user_id===app.user?.id):arr.find(x=>x.role==='employee')||arr[0])?.id||'';}return app.focusMember;}
function requestShortcutButtons(){
 return '<div class="request-shortcuts"><button type="button" class="btn primary" data-action="newLeaveRequest">＋ 請假</button><button type="button" class="btn" data-action="newOvertimeRequest">＋ 加班</button><button type="button" class="btn" data-action="newCorrectionRequest">＋ 補卡</button></div>';
}
function overview(){
 const d=app.data,m=d.members||[],s=d.shifts||[],req=d.requests||[],p=d.punches||[];
 const todayShifts=s.filter(x=>taiDay(x.starts_at)===today()&&x.status==='published');
 const todayPunch=p.filter(x=>taiDay(x.punched_at)===today());
 const pending=req.filter(x=>x.status==='pending');
 heading(requestShortcutButtons());
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
  return '<div class="day '+(day===today()?'today':'')+'" data-schedule-day="'+esc(day)+'"><strong>'+esc(day.slice(5))+'　'+esc('一二三四五六日'[week.indexOf(day)])+'</strong>'+entries.map(x=>'<div class="shift-card '+esc(x.status)+'" data-shift-id="'+esc(x.id)+'" '+(manager()?'draggable="true"':'')+'><b>'+personLabel(x.member_id)+'</b><span>'+taiTime(x.starts_at)+'－'+taiTime(x.ends_at)+'</span><div class="muted">'+esc(branch(x.branch_id)?.name||'')+' · '+esc(x.status==='draft'?'草稿':'已發布')+'</div></div>').join('')+(entries.length?'':'<span class="muted">無排班</span>')+'</div>';
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
 $('appContent').innerHTML='<div class="split">'+panel('快速打卡',roleDemo+'<div class="field"><label>員工</label><select id="punchMember">'+options((app.mode==='real'&&!manager()?app.data.members.filter(x=>x.user_id===app.user?.id):app.data.members),x=>x.display_name,sel)+'</select></div><p class="muted">定位資訊由使用者授權後才會讀取。沒有 GPS 的測試門市仍可打卡。</p><div class="flex">'+buttons+'</div><div class="inset" style="margin-top:18px"><strong>當前伺服器時間</strong><p id="serverTime">'+esc(taiStamp(new Date()))+'</p></div>')+panel('最近打卡紀錄',history)+'</div>';
}
function requests(){
 const sel=getSelected(),allReq=(app.data.requests||[]).slice(0,50);
 const filter=app.requestFilter||'all',req=filter==='all'?allReq:allReq.filter(x=>x.kind===filter);
 const counts={all:allReq.length,leave:0,overtime:0,correction:0};
 for(const item of allReq){if(Object.prototype.hasOwnProperty.call(counts,item.kind))counts[item.kind]++;}
 const filterBar='<div class="request-filters" role="group" aria-label="篩選申請項目">'+
  [['all','全部'],['leave','請假'],['overtime','加班'],['correction','補卡']].map(([k,label])=>
  '<button type="button" class="request-filter '+(filter===k?'active':'')+'" aria-pressed="'+(filter===k)+'" data-action="filterRequests" data-kind="'+k+'">'+label+' <span>'+counts[k]+'</span></button>').join('')+'</div>';
 heading(requestShortcutButtons());
 const rows=req.map(x=>tr([personLabel(x.member_id),esc(kind(x.kind))+(x.kind==='leave'?' · '+esc(kind(x.leave_kind)):''),
 taiStamp(x.starts_at),taiStamp(x.ends_at),status(x.status),esc(x.reason||'—')]));
 const verifiedBalances=(app.data.leaveBalances||{})[sel]||[];
 const balances=verifiedBalances.length?verifiedBalances.map(b=>
   '<div class="bar-row"><span>'+esc(b.label)+' · '+esc(b.year)+'</span>'+
   '<strong>可用 '+Number(b.remaining_hours).toFixed(1)+' 小時</strong></div>'+
   '<p class="muted">'+esc(b.yearly_basis==='anniversary'?'週年制':'曆年制')+
   '；核定 '+Number(b.granted_hours).toFixed(1)+
   '、結轉 '+Number(b.carryover_hours).toFixed(1)+
   '、已核准 '+Number(b.approved_hours).toFixed(1)+
   '、待審占用 '+Number(b.pending_hours).toFixed(1)+' 小時</p>').join(''):
   '<p class="muted">尚未為這位員工設定生效中的假別政策。</p>';;
 $('appContent').innerHTML=panel('申請紀錄',filterBar+table(['員工','項目','開始','結束','結果','說明'],rows))+'<div class="split">'+panel('假期額度','<div class="field"><label>查詢員工</label><select id="balanceMember">'+options(app.data.members,x=>x.display_name,sel)+'</select></div>'+balances)+panel('申請注意事項','<div class="notice">核准後會記錄審核時間與結果。原始出勤紀錄不會因申請或補卡被覆寫。</div><p class="muted">目前的額度是示範資料，不代表法定特休、病假給付的自動法令計算。</p>')+'</div>';
}
function approvals(){
 heading();
 const req=(app.data.requests||[]);const pending=req.filter(x=>x.status==='pending');
 const rows=req.map(x=>tr([personLabel(x.member_id),esc(kind(x.kind)),esc(kind(x.leave_kind||'')),taiStamp(x.starts_at),taiStamp(x.ends_at),status(x.status),
 x.status==='pending'&&manager()?'<div class="flex"><button class="btn small primary" data-action="approve" data-id="'+x.id+'">核准</button><button class="btn small danger" data-action="reject" data-id="'+x.id+'">駁回</button></div>':'<span class="muted">'+esc(x.decision_note||'已處理')+'</span>']));
 $('appContent').innerHTML='<div class="cards">'+stat('待審件數',pending.length,'待處理的全部申請')+stat('已核准',req.filter(x=>x.status==='approved').length,'累計件數')+stat('已駁回',req.filter(x=>x.status==='rejected').length,'累計件數')+stat('申請總量',req.length,'全部申請')+'</div>'+panel('簽核工作清單',table(['員工','申請','假別','開始','結束','狀態','操作'],rows))+
 (!manager()?'<div class="notice warning">只有主管或人資可以執行審核。</div>':'');
}
function employees(){
 heading(manager()?'<button class="btn primary" data-action="newEmployee">＋ 新增員工</button>':'');
 const rows=(app.data.members||[]).map(x=>tr(['<span class="person"><span class="avatar">'+esc(x.display_name[0]||'?')+'</span>'+esc(x.display_name)+'</span>',esc(x.employee_code),esc(branch(x.branch_id)?.name||'—'),esc(({owner:'擁有者',manager:'店長',hr:'人資',employee:'員工'})[x.role]||x.role),esc(x.employment_type==='part_time'?'兼職':'正職'),status(x.status)]));
 $('appContent').innerHTML=panel('企業員工　'+app.data.members.length+' 人',table(['姓名','員工編號','分店','角色','聘僱型態','狀態'],rows))+
 panel('分店據點',table(['分店','定位打卡','範圍'],app.data.branches.map(x=>tr([esc(x.name),x.gps_required?'需要 GPS':'未強制 GPS',esc(x.radius_m)+' 公尺']))),manager()?'<button class="btn small" data-action="newBranch">＋ 新增分店</button>':'')+
 '<div class="notice warning">公開 DEMO 的員工皆為虛構人物。正式企業邀請請使用「組織與權限」；LINE 綁定請使用「LINE 通知」，需配置正式 Channel。</div>';
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
 panel('開發與限制說明','<div class="bar-row"><span>已具備程式</span><strong>企業註冊、組織邀請、排班、打卡、GPS／QR、假勤審核、CSV、站內通知、月結試算</strong></div><div class="bar-row"><span>仍須外部配置與驗收</span><strong>LINE LIFF／實際推播、企業自有 OA、Email 密碼重設回跳</strong></div><div class="bar-row"><span>尚未完整交付</span><strong>法定工時及假勤判定、跨企業排班衝突、進階排班最佳化、訂閱及平台營運</strong></div><p><a href="https://github.com/hub-google/LINE/blob/main/workforce-management/PRD.md" target="_blank" rel="noopener noreferrer">查看完整 PRD</a>　·　<a href="https://github.com/hub-google/LINE/blob/main/workforce-management/USER_SCENARIOS.md" target="_blank" rel="noopener noreferrer">查看全角色操作情境</a></p>');
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

const REQUEST_KINDS={
 leave:{title:'請假申請',action:'送出請假申請',start:'請假開始時間',end:'請假結束時間',reason:'請假原因'},
 overtime:{title:'加班申請',action:'送出加班申請',start:'加班開始時間',end:'加班結束時間',reason:'加班事由'},
 correction:{title:'補卡申請',action:'送出補卡申請',start:'出勤區間開始時間',end:'出勤區間結束時間',reason:'補卡原因'}
};
function showRequest(requestKind='leave'){
 if(!REQUEST_KINDS[requestKind])throw Error('不支援的申請項目');
 const config=REQUEST_KINDS[requestKind],day=today();
 const policies=[...(app.data?.leavePolicies||[])].filter(x=>x.effective_from<=day)
  .sort((a,b)=>b.effective_from.localeCompare(a.effective_from));
 const seen=new Set(),latest=[];
 for(const p of policies){if(!seen.has(p.leave_kind)){seen.add(p.leave_kind);if(p.is_active)latest.push(p);}}
 const leaveOptions=latest.length?latest.map(x=>'<option value="'+esc(x.leave_kind)+'">'+esc(x.label)+'</option>').join(''):
  '<option value="annual">特休</option><option value="sick">病假</option><option value="personal">事假</option><option value="other">其他假</option>';
 const fields=[{name:'member_id',label:'申請員工',html:memberFilter(getSelected())}];
 if(requestKind==='leave')fields.push({name:'leave_kind',label:'請假假別',html:selectField('leave_kind',leaveOptions)});
 if(requestKind==='correction')fields.push({name:'correction_type',label:'補卡類型',html:selectField('correction_type',
  '<option value="漏上班卡">漏上班卡</option><option value="漏下班卡">漏下班卡</option><option value="上下班皆漏卡">上下班皆漏卡</option><option value="出勤時間更正">出勤時間更正</option>')});
 fields.push(
  {name:'starts_at',label:config.start,html:input('starts_at','datetime-local',day+'T'+(requestKind==='overtime'?'18:00':'09:00'))},
  {name:'ends_at',label:config.end,html:input('ends_at','datetime-local',day+'T'+(requestKind==='overtime'?'20:00':'18:00'))},
  {name:'reason',label:config.reason,wide:true,html:'<textarea id="reason" name="reason" required maxlength="500" rows="3" placeholder="'+esc(requestKind==='overtime'?'請說明加班工作內容':requestKind==='correction'?'請說明漏卡或更正原因':'請填寫請假原因')+'"></textarea>'}
 );
 const tip=requestKind==='overtime'?'<p class="request-hint">請填寫預計加班的起訖時間。核准加班申請不等於完成出勤打卡或薪資結算。</p><p id="requestDuration" class="request-duration" aria-live="polite"></p>':
  requestKind==='correction'?'<p class="request-hint">填寫要補正的班次時間與原因。核准後仍保留原始打卡紀錄。</p>':
  '<p class="request-hint">請依實際請假時段填寫，額度以公司規則和審核結果為準。</p>';
 const body='<form data-form="request" data-request-kind="'+esc(requestKind)+'"><input type="hidden" name="kind" value="'+esc(requestKind)+'">'+
  '<div class="form-grid">'+formFields(fields)+'</div>'+tip+
  '<div class="modal-actions"><button type="button" class="btn" data-action="closeModal">取消</button><button type="submit" class="btn primary">'+esc(config.action)+'</button></div></form>';
 openModal(config.title,body);updateRequestDuration();
}
function updateRequestDuration(){
 const form=$('overlay')?.querySelector('form[data-request-kind="overtime"]');if(!form?.elements)return;
 const box=form.querySelector('#requestDuration');if(!box)return;
 const a=form.elements.starts_at?.value,b=form.elements.ends_at?.value;
 if(!a||!b){box.textContent='請選擇加班開始及結束時間';box.classList.remove('invalid');return;}
 const m=(new Date(b).getTime()-new Date(a).getTime())/60000;
 if(!Number.isFinite(m)||m<=0||m>1440){box.textContent='結束時間須晚於開始時間，單次申請不得超過 24 小時';box.classList.add('invalid');return;}
 box.classList.remove('invalid');
 const h=m/60;box.textContent='預計加班：'+(Number.isInteger(h)?h:h.toFixed(2).replace(/0+$/,'').replace(/\.$/,''))+' 小時（未扣除休息）';
}
$('overlay').addEventListener('input',e=>{
 if(e.target?.matches('form[data-request-kind="overtime"] [name="starts_at"],form[data-request-kind="overtime"] [name="ends_at"]'))updateRequestDuration();
});
$('overlay').addEventListener('change',e=>{
 if(e.target?.matches('form[data-request-kind="overtime"] [name="starts_at"],form[data-request-kind="overtime"] [name="ends_at"]'))updateRequestDuration();
});
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
 const csv='\uFEFF'+data.map(row=>row.map(c=>{let text=String(c);if(/^[=+@\-\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}).join(',')).join('\r\n');
 const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='LINE-Workforce-'+app.date+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);banner('CSV 已產生');
}
async function clockPunch(kindValue){
 const member=$('punchMember')?.value||getSelected();if(!member)return banner('請先選擇員工',true);
 const key='wm-'+crypto.randomUUID();const payload={member_id:member,kind:kindValue,key};
 // Location is optional for demo unless a branch has gps_required; production validation lives in wm_clock.
 if(navigator.geolocation&&(app.mode==='real'||branch(person(member)?.branch_id)?.gps_required)){
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
 if(e.target.id==='weekPicker'){app.date=e.target.value;app.autoSuggestions=null;render();}
 if(e.target.id==='reportDate'){app.date=e.target.value;render();}
 if(e.target.id==='punchMember'){app.focusMember=e.target.value;render();}
 if(e.target.id==='balanceMember'){app.focusMember=e.target.value;if(app.mode==='demo')render();}
});
document.addEventListener('click',async e=>{
 if(!e.target.closest('#appContent, #pageActions'))return;
 const b=e.target.closest('[data-action]');if(!b)return;
 const a=b.dataset.action,id=b.dataset.id;
 try{
 if(a==='gotoSchedule')setTab('schedule');else if(a==='gotoApprovals')setTab('approvals');
  else if(a==='filterRequests'){if(!['all','leave','overtime','correction'].includes(b.dataset.kind))return;app.requestFilter=b.dataset.kind;render();}
 else if(a==='newShift')showShift();else if(a==='newLeaveRequest')showRequest('leave');else if(a==='newOvertimeRequest')showRequest('overtime');else if(a==='newCorrectionRequest')showRequest('correction');else if(a==='newEmployee')showEmployee();else if(a==='newBranch')showBranch();
 else if(a==='prevWeek'){app.date=dayAdd(app.date,-7);app.autoSuggestions=null;render();}
 else if(a==='nextWeek'){app.date=dayAdd(app.date,7);app.autoSuggestions=null;render();}
 else if(a==='todayWeek'){app.date=today();app.autoSuggestions=null;render();}
 else if(a==='refreshReport')await reload(true);else if(a==='exportCsv')csvSave();
 else if(a==='clock')await clockPunch(b.dataset.kind);
 else if(a==='approve')await approve(id,true);else if(a==='reject')await approve(id,false);
 else if(a==='cancelShift'||a==='publishShift'){if(confirm('確認更新班別狀態？'))await action('shift_status',{id,status:a==='cancelShift'?'cancelled':'published'});}
 else if(a==='createTenant')showTenant();else if(a==='login')showAuth();
 else if(a==='demoMode'){app.mode='demo';app.token=null;app.tenantId=DEMO_ID;app.tenants=[];await reload(true);}
 else if(a==='retryLoad')await reload();
 }catch(e){banner(e.message||'操作失敗，請重試',true);}
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
   sessionStorage.setItem('wm_auth',JSON.stringify({token,user,refresh_token:result.refresh_token||result.session?.refresh_token||null,expires_at:result.expires_at||result.session?.expires_at||0}));
   closeModal();
   const invited=new URLSearchParams(location.hash.slice(1)).get('invite');
   if(invited){
    const accepted=await call('/rest/v1/rpc/wm_accept_invite','POST',{p_token:invited},app.token);
    history.replaceState(null,'',location.pathname+location.search);
    app.tenantId=accepted.tenant_id;
   }
   const orgInvitation=sessionStorage.getItem('wm_org_pending_invite');
   if(orgInvitation){
    const link=await call('/rest/v1/rpc/wm_org_accept_invite','POST',{p_token:orgInvitation},app.token);
    sessionStorage.removeItem('wm_org_pending_invite');app.tenantId=link.tenant_id;
   }
   await reload(true);banner('企業帳號登入成功');
  }else if(form.dataset.form==='tenant'){
   const newTenantId=crypto.randomUUID();
   await call('/rest/v1/wm_tenants','POST',{id:newTenantId,name:f.name,created_by:app.user.id},app.token);
   app.tenantId=newTenantId;closeModal();await reload(true);
   if(!app.tenants.some(t=>t.id===newTenantId))throw Error('企業已送出，但無法讀取建立結果，請重新登入確認');
   banner('企業建立完成');
  }else{
   if(f.starts_at)f.starts_at=tzIso(f.starts_at);
   if(f.ends_at)f.ends_at=tzIso(f.ends_at);
   if(form.dataset.form==='request'){
     const kindValue=form.dataset.requestKind;
     if(!REQUEST_KINDS[kindValue]||f.kind!==kindValue)throw Error('申請類型不正確，請重新開啟表單');
     const minutes=(Date.parse(f.ends_at)-Date.parse(f.starts_at))/60000;
     if(!Number.isFinite(minutes)||minutes<=0)throw Error('結束時間必須晚於開始時間');
     if(kindValue==='overtime'&&minutes>1440)throw Error('單次加班申請不得超過 24 小時');
     f.reason=String(f.reason||'').trim();
     if(!f.reason)throw Error('請填寫'+REQUEST_KINDS[kindValue].reason);
     if(kindValue==='correction'){
      if(!['漏上班卡','漏下班卡','上下班皆漏卡','出勤時間更正'].includes(f.correction_type))throw Error('請選擇補卡類型');
      f.reason='【'+f.correction_type+'】'+f.reason;
     }
     if(kindValue!=='leave')f.leave_kind=null;
     delete f.correction_type;
    }
   await action(form.dataset.form,f);
  }
 }catch(err){banner(err.message,true);submit.disabled=false;}
});
function logout(){app.token=null;app.user=null;app.data=null;app.tenants=[];app.mode='demo';app.tenantId=DEMO_ID;sessionStorage.removeItem('wm_auth');reload(true);banner('已登出企業模式');}
try{const saved=JSON.parse(sessionStorage.getItem('wm_auth')||'null');if(saved?.token&&saved?.user){app.token=saved.token;app.user=saved.user;app.mode='real';app.tenantId='';}}catch{}
reload(true);



/* Workforce PRD extension: uses existing modules, original tables, and real Supabase RPCs.
   The publicly accessible controls below only operate the isolated fictional demo tenant. */
TABS.inbox=['通知收件匣','班表變更及假勤審核通知統一由資料庫事件產生。'];
TABS.periods=['月度工時與月結','查看實際打卡片段、月結快照與後續調整單。'];
document.querySelector('#nav').insertAdjacentHTML('beforeend',
 '<button type="button" data-tab="inbox"><span>✉</span> 通知收件匣</button>'+
 '<button type="button" data-tab="periods"><span>▤</span> 月度工時與月結</button>');
const originalRender=render;
render=function(){
 if(app.data&&app.tab==='inbox'){showInbox();return;}
 if(app.data&&app.tab==='periods'){showPeriods();return;}
 originalRender();
};
const originalSchedule=schedule;
schedule=function(){
 originalSchedule();
 const d=app.data||{};
 const availability=(d.availability||[]).slice(0,50).map(a=>tr([
  personLabel(a.member_id),taiStamp(a.starts_at),taiStamp(a.ends_at),
  a.available?'可上班':'不可上班',esc(a.note||'—')]));
 const templates=(d.templates||[]).map(t=>tr([
  esc(t.name),esc(String(t.starts_local).slice(0,5))+'—'+esc(String(t.ends_local).slice(0,5)),
  esc(t.break_minutes||0)+' 分鐘']));
 const requirements=(d.requirements||[]).map(x=>tr([
  esc(branch(x.branch_id)?.name||'—'),
  esc(['日','一','二','三','四','五','六'][x.weekday]),
  esc(String(x.starts_local).slice(0,5))+'—'+esc(String(x.ends_local).slice(0,5)),
  String(x.needed)+' 人']));
 $('appContent').insertAdjacentHTML('beforeend',
  panel('可上班／不可上班時段',table(['員工','開始','結束','偏好','備註'],availability),
   '<button class="btn small" data-action="newAvailability">＋ 提供可上班時段</button>')+
  panel('班型範本',table(['名稱','時間','休息'],templates),
   manager()?'<div class="flex"><button class="btn small" data-action="newTemplate">＋ 新增班型</button><button class="btn small" data-action="copyWeek">複製本週至下週（草稿）</button></div>':'')+
  panel('門市最低人力需求',table(['門市','星期','班段','最低需求'],requirements),
   manager()?'<button class="btn small" data-action="newRequirement">＋ 設定人力需求</button>':''));
};
const originalEmployees=employees;
employees=function(){
 originalEmployees();
 const d=app.data||{},departments=(d.departments||[]),owner=app.mode==='real'&&role()==='owner';
 let rows=(d.members||[]).map(m=>tr([
  personLabel(m.id),esc(m.employee_code),esc(departments.find(x=>x.id===m.department_id)?.name||'—'),
  m.user_id?'<span class="chip active">已連結</span>':'<span class="chip pending">未連結</span>',
  (manager()?'<button class="btn small" data-action="employeeEdit" data-id="'+esc(m.id)+'">設定</button>':'')+
  (owner&&!m.user_id?'<button class="btn small" data-action="inviteMember" data-id="'+esc(m.id)+'">產生邀請</button>':'')
 ]));
 let deptRows=departments.map(x=>tr([esc(x.name),esc(branch(x.branch_id)?.name||'—')]));
 $('appContent').insertAdjacentHTML('beforeend',
 panel('部門設定',table(['部門','分店'],deptRows),manager()?'<button class="btn small" data-action="newDepartment">＋ 新增部門</button>':'')+
 panel('員工隸屬與正式帳號邀請',table(['員工','編號','部門','登入綁定','操作'],rows))+
 '<div class="notice">正式企業擁有者可產生七日有效的一次性邀請連結；使用者必須登入自己的帳號才可加入，僅分享連結不授予管理權限。</div>');
};
const originalRequests=requests;
requests=function(){
 originalRequests();
 const pending=(app.data?.requests||[]).filter(x=>x.status==='pending'
  &&(app.mode==='demo'||person(x.member_id)?.user_id===app.user?.id));
 if(pending.length)$('appContent').insertAdjacentHTML('beforeend',
 panel('撤回待審申請',table(['員工','類型','時間','操作'],
 pending.map(x=>tr([personLabel(x.member_id),esc(kind(x.kind)),taiStamp(x.starts_at),
 '<button class="btn small danger" data-action="withdrawReq" data-id="'+esc(x.id)+'">撤回</button>'])))));
};
const originalSettings=settings;
settings=function(){
 originalSettings();
 const d=app.data||{};
 const rows=(d.branches||[]).map(b=>tr([
  esc(b.name),b.gps_required?'必須定位':'非必要',
  b.latitude===null?'—':esc(b.latitude)+' / '+esc(b.longitude),
  esc(b.radius_m)+' 公尺',manager()?'<button class="btn small" data-action="gpsEdit" data-id="'+esc(b.id)+'">設定</button>':''
 ]));
 $('appContent').insertAdjacentHTML('beforeend',
 panel('GPS 定位打卡據點',table(['門市','政策','座標','容許半徑','操作'],rows))+
 '<div class="notice warning">正式 LINE LIFF／Messaging API 仍需自己的 Channel 設定及伺服器憑證；目前沒有用未授權帳號假冒 LINE 發送訊息。</div>');
};
function showInbox(){
 heading();
 const all=(app.data.notifications||[]),sel=getSelected();
 const visible=app.mode==='demo'?all.filter(n=>n.recipient_member_id===sel):
  all.filter(n=>person(n.recipient_member_id)?.user_id===app.user?.id);
 const rows=visible.map(n=>tr([
  esc(n.title),esc(n.body||''),taiStamp(n.created_at),
  n.read_at?'<span class="chip active">已讀</span>':'<span class="chip pending">未讀</span>',
  n.read_at?'':'<button class="btn small" data-action="readNotice" data-id="'+esc(n.id)+'">標記已讀</button>'
 ]));
 $('appContent').innerHTML=
 (app.mode==='demo'?'<div class="toolbar"><div class="field"><label>測試員工</label><select id="notificationMember">'+options(app.data.members||[],x=>x.display_name,sel)+'</select></div></div>':'')+
 panel('站內通知',table(['通知','內容','產生時間','狀態','操作'],rows))+
 '<div class="notice">所有通知來自排班與簽核資料庫事件。LINE OA 未完成授權時，仍可在這裡查詢，不會宣稱已送達 LINE。</div>';
}
app.monthSelected=dayAdd(today().slice(0,7)+'-01',-1).slice(0,7);
app.monthPreview=null;
function showPeriods(){
 heading();
 const d=app.data,month=app.monthSelected,year=Number(month.slice(0,4)),mo=Number(month.slice(5,7));
 const closure=(d.closures||[]).find(x=>x.year===year&&x.month===mo);
 const r=app.monthPreview&&app.monthPreview.year===year&&app.monthPreview.month===mo?app.monthPreview:closure?.snapshot||null;
 let rows=(r?.rows||[]).map(x=>tr([
  esc(x.name),esc(x.employee_code),Number(x.scheduled_minutes/60).toFixed(2),
  Number(x.observed_minutes/60).toFixed(2),Number(x.leave_minutes/60).toFixed(2),
  esc(x.incomplete_count),x.hourly_rate===null?'—':'NT$ '+Number(x.estimated_cost).toLocaleString('zh-TW')
 ]));
 let adjust=(d.adjustments||[]).filter(x=>x.closure_id===closure?.id).map(x=>tr([
  personLabel(x.member_id),String(x.minutes_delta)+' 分',esc(x.reason),taiStamp(x.created_at)]));
 let tool='<div class="toolbar"><div class="field"><label>選擇月份</label><input id="monthPicker" type="month" class="filter" value="'+esc(month)+'"></div>'+
 '<button class="btn" data-action="monthPreview">試算本月工時</button>'+
 (manager()&&closure?'':'')+
 ((app.mode==='demo'||['owner','hr'].includes(role()))&&!closure?'<button class="btn primary" data-action="monthClose">確認鎖定月結</button>':'')+
 '<button class="btn" data-action="monthExport" '+(!r?'disabled':'')+'>匯出 CSV</button></div>';
 $('appContent').innerHTML=panel('月度工時與假勤彙整',tool+
 '<div class="notice warning">這是以打卡事件配對和班表計算的行政試算；未涵蓋全部法定工時、補休及薪資規則，不可直接用來發放薪資。</div>'+
 (closure?'<p><span class="chip approved">已鎖定</span>　'+esc(taiStamp(closure.closed_at))+'，歷史快照不會被覆寫。</p>':'<p class="muted">目前未月結；請先試算並處理異常。</p>')+
 table(['員工','編號','排定時數','觀察工時','核准請假','未完成事件','預估成本'],rows))+
 (closure?panel('月結追溯更正',table(['員工','調整','原因','時間'],adjust),
 (app.mode==='demo'||['owner','hr'].includes(role()))?'<button class="btn small" data-action="newAdjustment" data-id="'+esc(closure.id)+'">＋ 新增調整單</button>':''):'');
}
const extraNames=new Set(['department','template','requirement','availability','branch_gps',
 'assign_department','employee_status','withdraw','notify_read','month_report',
 'month_close','period_adjustment','copy_week']);
const baseAction=action;
action=async function(name,data){
 if(!extraNames.has(name))return baseAction(name,data);
 if(app.busy)throw Error('上一個操作仍在處理中，請勿重複送出');
 app.busy=true;
 try{
  let result;
  if(app.mode==='demo'){
    if(name==='leave_policy'||name==='leave_grant')
      result=await call('/rest/v1/rpc/wm_demo_leave_api','POST',{
       p_action:name==='leave_policy'?'policy':'grant',p_data:data});
    else if(name==='schedule_rules')
      result=await call('/rest/v1/rpc/wm_demo_schedule_api','POST',{p_action:'save',p_data:data});
    else if(name==='assign_branch')
      result=await call('/rest/v1/rpc/wm_demo_branch_support','POST',{p_action:'assign',p_data:data});
    else if(name==='attendance_scan'||name==='attendance_resolve')
      result=await call('/rest/v1/rpc/wm_demo_attendance_api','POST',{
       p_action:name==='attendance_scan'?'scan':'resolve',p_data:data});
    else result=await demo(name,data);
   }
  else{
   if(!app.token||!app.tenantId)throw Error('請先完成企業登入');
   const tenant_id=app.tenantId;
   const rpc=(fn,values)=>call('/rest/v1/rpc/'+fn,'POST',values,app.token);
   const insert=(table,values)=>call('/rest/v1/'+table,'POST',{tenant_id,...values},app.token);
   const patch=(table,id,values)=>call('/rest/v1/'+table+'?tenant_id=eq.'+encodeURIComponent(tenant_id)+'&id=eq.'+encodeURIComponent(id),'PATCH',values,app.token);
   if(name==='department')result=await insert('wm_departments',{branch_id:data.branch_id,name:data.name});
   else if(name==='template')result=await insert('wm_shift_templates',{name:data.name,starts_local:data.starts_local,ends_local:data.ends_local,break_minutes:Number(data.break_minutes||0)});
   else if(name==='requirement')result=await insert('wm_staffing_requirements',{branch_id:data.branch_id,weekday:Number(data.weekday),starts_local:data.starts_local,ends_local:data.ends_local,needed:Number(data.needed)});
   else if(name==='assign_department')result=await patch('wm_members',data.member_id,{department_id:data.department_id||null});
   else if(name==='employee_status')result=await patch('wm_members',data.member_id,{status:data.status});
   else if(name==='branch_gps')result=await patch('wm_branches',data.branch_id,{gps_required:data.gps_required===true||data.gps_required==='true',latitude:data.latitude===''?null:Number(data.latitude),longitude:data.longitude===''?null:Number(data.longitude),radius_m:Number(data.radius_m)});
   else if(name==='withdraw')result=await rpc('wm_withdraw_request',{p_request:data.id});
   else if(name==='notify_read')result=await rpc('wm_mark_notification_read',{p_id:data.id});
   else if(name==='month_report')result=await rpc('wm_month_report',{p_tenant:tenant_id,p_year:Number(data.year),p_month:Number(data.month)});
   else if(name==='month_close')result=await rpc('wm_close_month',{p_tenant:tenant_id,p_year:Number(data.year),p_month:Number(data.month)});
   else if(name==='period_adjustment')result=await rpc('wm_adjust_closed_month',{p_close_id:data.closure_id,p_member_id:data.member_id,p_minutes:Number(data.minutes_delta),p_reason:data.reason});
   else if(name==='copy_week')result=await rpc('wm_copy_week',{p_tenant:tenant_id,p_week_start:data.week_start});
   else if(name==='employee_import')result=await rpc('wm_import_employees',{p_tenant:tenant_id,p_rows:data.rows});
   else if(name==='auto_draft')result=await rpc('wm_insert_draft_schedule',{p_tenant:tenant_id,p_assignments:data.assignments});
   else if(name==='leave_policy')result=await rpc('wm_save_leave_policy',{
    p_tenant:tenant_id,p_kind:data.leave_kind,p_label:data.label,p_effective:data.effective_from,
    p_basis:data.yearly_basis,p_needs_balance:data.balance_required==='true',
    p_carryover:Number(data.carryover_hours),p_levels:Number(data.approval_levels),
    p_document:data.requires_document==='true',p_active:data.is_active==='true'});
   else if(name==='leave_grant')result=await rpc('wm_grant_leave_hours',{
    p_tenant:tenant_id,p_member:data.member_id,p_year:Number(data.year),
    p_kind:data.leave_kind,p_hours:Number(data.hours)});
   else if(name==='attendance_scan')result=await rpc('wm_scan_attendance',{
    p_tenant:tenant_id,p_from:data.from,p_to:data.through});
   else if(name==='attendance_resolve')result=await rpc('wm_resolve_attendance_anomaly',{
    p_id:data.id,p_note:data.note});
   else if(name==='qr_setting')result=await rpc('wm_save_qr_setting',{
    p_tenant:tenant_id,p_branch:data.branch_id,
    p_enabled:data.enabled==='true',p_gps_replace:data.allow_gps_replacement==='true'});
   else if(name==='assign_branch')result=await rpc('wm_assign_branch',{
    p_tenant:tenant_id,p_member:data.member_id,p_branch:data.branch_id,
    p_from:data.active_from,p_until:data.active_until||null});
   else if(name==='schedule_rules')result=await rpc('wm_save_schedule_rules',{
    p_tenant:tenant_id,p_effective:data.effective_from,
    p_min_rest:Number(data.min_rest_minutes),p_max_shift:Number(data.max_shift_minutes),
    p_max_week:Number(data.max_week_minutes)});
   else if(name==='attendance_rule')result=await rpc('wm_save_attendance_rule',{
    p_tenant:tenant_id,p_grace:Number(data.grace_minutes),p_sla:Number(data.anomaly_sla_hours),
    p_quiet_from:data.quiet_from,p_quiet_until:data.quiet_until});
   else if(name==='leave_stage')result=await rpc('wm_review_request_step',{
    p_request:data.id,p_approved:data.approved===true,p_note:data.note||''});
   else if(name==='swap_create')result=await rpc('wm_create_swap',{p_source:data.source_shift_id,p_target:data.target_shift_id,p_reason:data.reason||''});
   else if(name==='swap_accept')result=await rpc('wm_consent_swap',{p_request:data.id,p_accepted:data.accepted===true});
   else if(name==='swap_review')result=await rpc('wm_review_swap',{p_request:data.id,p_approved:data.approved===true});
   else if(name==='shift_move')result=await rpc('wm_move_shift',{p_tenant:tenant_id,p_shift:data.id,p_start:data.starts_at});
   else if(name==='availability')result=await insert('wm_availability',{member_id:data.member_id,starts_at:data.starts_at,ends_at:data.ends_at,available:data.available===true||data.available==='true',note:data.note||''});
  }
  app.busy=false;closeModal();
  if(name!=='month_report'&&name!=='notify_read')app.autoSuggestions=null;
  if(name==='month_report'){app.monthPreview=result;render();banner('已取得資料庫月度試算');}
  else {if(name==='month_close')app.monthPreview=null;await reload(true);banner('已儲存到資料庫');}
  return result;
 }catch(e){app.busy=false;banner(e.message,true);throw e;}
};
function showExtraForm(title,name,fields,submit){openModal(title,modalForm(name,fields,submit));}
function showAvailability(){
 showExtraForm('提供可排班時段','availability',[
  {name:'member_id',label:'員工',html:memberFilter(getSelected())},
  {name:'available',label:'狀態',html:selectField('available','<option value="true">可上班</option><option value="false">不可上班／排休</option>')},
  {name:'starts_at',label:'開始',html:input('starts_at','datetime-local',today()+'T09:00')},
  {name:'ends_at',label:'結束',html:input('ends_at','datetime-local',today()+'T18:00')},
  {name:'note',label:'備註',wide:true,html:'<input id="note" name="note" maxlength="200">'}
 ],'送出時段');
}
function showTemplate(){
 showExtraForm('建立班型範本','template',[
  {name:'name',label:'班型名稱',html:input('name','text','','maxlength="80"')},
  {name:'break_minutes',label:'休息分鐘',html:input('break_minutes','number','60','min="0" max="240"')},
  {name:'starts_local',label:'開始時間',html:input('starts_local','time','09:00')},
  {name:'ends_local',label:'結束時間',html:input('ends_local','time','18:00')}
 ],'儲存班型');
}
function showRequirement(){
 showExtraForm('設定分店最低人力需求','requirement',[
  {name:'branch_id',label:'門市',html:branchFilter()},
  {name:'weekday',label:'星期',html:selectField('weekday',Array.from({length:7},(_,i)=>'<option value="'+i+'">週'+['日','一','二','三','四','五','六'][i]+'</option>').join(''))},
  {name:'starts_local',label:'開始時間',html:input('starts_local','time','09:00')},
  {name:'ends_local',label:'結束時間',html:input('ends_local','time','18:00')},
  {name:'needed',label:'最低人數',html:input('needed','number','2','min="1" max="100"'),wide:true}
 ],'儲存人力需求');
}
function showDepartment(){
 showExtraForm('新增部門','department',[
  {name:'name',label:'部門名稱',html:input('name','text','','maxlength="80"')},
  {name:'branch_id',label:'所屬分店',html:branchFilter()}
 ],'新增部門');
}
function showEmployeeSettings(id){
 const m=person(id);
 if(!m)return;
 showExtraForm('員工設定：'+m.display_name,'assign_department',[
  {name:'member_id',label:'員工識別碼',html:'<input id="member_id" name="member_id" value="'+esc(m.id)+'" readonly>'},
  {name:'department_id',label:'部門',html:'<select id="department_id" name="department_id"><option value="">不指定</option>'+
    options(app.data.departments||[],d=>d.name,m.department_id)+'</select>'}
 ],'儲存部門');
}
function showGpsSettings(id){
 const b=branch(id);if(!b)return;
 showExtraForm('定位打卡規則：'+b.name,'branch_gps',[
  {name:'branch_id',label:'分店',html:'<input id="branch_id" name="branch_id" value="'+esc(b.id)+'" readonly>'},
  {name:'gps_required',label:'強制定位',html:selectField('gps_required','<option value="false" '+(!b.gps_required?'selected':'')+'>否</option><option value="true" '+(b.gps_required?'selected':'')+'>是</option>')},
  {name:'latitude',label:'緯度',html:'<input id="latitude" name="latitude" type="number" step="any" value="'+esc(b.latitude??'')+'">'},
  {name:'longitude',label:'經度',html:'<input id="longitude" name="longitude" type="number" step="any" value="'+esc(b.longitude??'')+'">'},
  {name:'radius_m',label:'半徑（公尺）',html:input('radius_m','number',b.radius_m||200,'min="30" max="5000"'),wide:true}
 ],'儲存打卡規則');
}
function showPeriodAdjustment(id){
 showExtraForm('月結更正單','period_adjustment',[
  {name:'closure_id',label:'月結 ID',html:'<input id="closure_id" name="closure_id" value="'+esc(id)+'" readonly>'},
  {name:'member_id',label:'員工',html:memberFilter(getSelected())},
  {name:'minutes_delta',label:'調整分鐘（可為負數）',html:input('minutes_delta','number','30','min="-43200" max="43200"')},
  {name:'reason',label:'更正原因',wide:true,html:'<textarea id="reason" name="reason" minlength="3" maxlength="500" required></textarea>'}
 ],'確認新增更正');
}
function monthCsvExport(){
 const closed=(app.data?.closures||[]).find(x=>x.year===Number(app.monthSelected.slice(0,4))&&x.month===Number(app.monthSelected.slice(5,7)));
 const source=app.monthPreview||closed?.snapshot;
 if(!source)return banner('請先試算月份',true);
 const rows=[['員工','員工編號','排班分鐘','出勤分鐘','請假分鐘','未完成事件','成本預估'],
  ...(source.rows||[]).map(r=>[r.name,r.employee_code,r.scheduled_minutes,r.observed_minutes,r.leave_minutes,r.incomplete_count,r.estimated_cost])];
 const cell=v=>{let text=String(v??'');if(/^[\s]*[=+@\-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
 const blob=new Blob(['\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='LINE-Workforce-'+app.monthSelected+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function showInvite(memberId){
 if(app.mode==='demo')throw Error('邀請正式員工需使用企業帳號，Demo 不能綁定真人身分');
 if(role()!=='owner')throw Error('只有企業擁有者可以邀請');
 const token=await call('/rest/v1/rpc/wm_create_invite','POST',
  {p_tenant:app.tenantId,p_member:memberId},app.token);
 const href=location.origin+location.pathname+'#invite='+encodeURIComponent(token);
 openModal('員工一次性邀請','<p>此邀請七日內有效，且只能使用一次。請將連結交給指定員工，他登入自己的帳號後才可加入企業。</p>'+
 '<div class="field"><label>邀請網址</label><textarea readonly id="inviteUrl" rows="4">'+esc(href)+'</textarea></div>'+
 '<div class="modal-actions"><button class="btn primary" data-extra="copyInvite">複製邀請連結</button></div>');
}
async function acceptPendingInvite(){
 const token=new URLSearchParams(location.hash.slice(1)).get('invite');
 if(!token)throw Error('網址沒有邀請憑證');
 if(!app.token){showAuth();return;}
 const accepted=await call('/rest/v1/rpc/wm_accept_invite','POST',{p_token:token},app.token);
 history.replaceState(null,'',location.pathname+location.search);
 app.mode='real';app.tenantId=accepted.tenant_id;
 await reload(true);banner('已加入企業：'+accepted.name);
}
const originalNoTenant=noTenant;
noTenant=function(){
 originalNoTenant();
 if(location.hash.includes('invite=')){
  $('appContent').insertAdjacentHTML('beforeend','<div class="notice">偵測到員工邀請。登入或註冊後可接受邀請。</div>'+
   '<button class="btn primary" data-extra="acceptInvite">接受員工邀請</button>');
 }
};
const olderRender=render;
render=function(){olderRender();if(app.tab==='overview'&&app.data&&(app.data.notifications||[]).some(x=>!x.read_at)){
 $('appContent').insertAdjacentHTML('beforeend',panel('通知提醒',
  '<p>你有尚未閱讀的班表或審核通知。</p><button class="btn" data-extra="openInbox">前往通知收件匣</button>'));
}};
$('appContent').addEventListener('change',e=>{
 if(e.target.id==='notificationMember'){app.focusMember=e.target.value;render();}
 if(e.target.id==='monthPicker'){app.monthSelected=e.target.value;app.monthPreview=null;render();}
});
document.addEventListener('click',async e=>{
 if(!e.target.closest('#appContent, #pageActions'))return;
 const b=e.target.closest('[data-action],[data-extra]');if(!b)return;
 const a=b.dataset.action||b.dataset.extra;
 try{
  if(a==='newAvailability')showAvailability();
  else if(a==='newTemplate')showTemplate();
  else if(a==='newRequirement')showRequirement();
  else if(a==='newDepartment')showDepartment();
  else if(a==='employeeEdit')showEmployeeSettings(b.dataset.id);
  else if(a==='gpsEdit')showGpsSettings(b.dataset.id);
  else if(a==='newAdjustment')showPeriodAdjustment(b.dataset.id);
  else if(a==='inviteMember')await showInvite(b.dataset.id);
  else if(a==='withdrawReq'){if(confirm('撤回後不得恢復，確定嗎？'))await action('withdraw',{id:b.dataset.id});}
  else if(a==='readNotice')await action('notify_read',{id:b.dataset.id});
  else if(a==='monthPreview')await action('month_report',{year:Number(app.monthSelected.slice(0,4)),month:Number(app.monthSelected.slice(5,7))});
  else if(a==='monthClose'){
   if(confirm('確認鎖定此月份？鎖定後只能用更正單調整，不能覆寫快照。'))
    await action('month_close',{year:Number(app.monthSelected.slice(0,4)),month:Number(app.monthSelected.slice(5,7))});
  }
  else if(a==='monthExport')monthCsvExport();
  else if(a==='copyWeek'){
   const date=app.date;const d=new Date(date+'T12:00:00Z');
   const mon=dayAdd(date,-((d.getUTCDay()+6)%7));
   if(confirm('將這週班表複製成下週草稿？有衝突的班別會保留原資料。'))
    await action('copy_week',{week_start:mon+'T00:00:00+08:00'});
  }
  else if(a==='openInbox')setTab('inbox');
  else if(a==='acceptInvite')await acceptPendingInvite();
 }catch(e){banner(e.message,true);}
});
$('overlay').addEventListener('click',async e=>{
 const b=e.target.closest('[data-extra]');if(!b)return;
 if(b.dataset.extra==='copyInvite'){
  try{await navigator.clipboard.writeText($('inviteUrl').value);banner('邀請網址已複製');}
  catch{banner('無法存取剪貼簿，請手動複製',true);}
 }
});



/* HR-SCH-06: two-party shift exchange; manager review cannot bypass target consent. */
extraNames.add('swap_create');
extraNames.add('swap_accept');
extraNames.add('swap_review');
const priorScheduleForSwap=schedule;
schedule=function(){
 priorScheduleForSwap();
 $('appContent').insertAdjacentHTML('beforeend',
  panel('換班／代班申請',
    '<p class="muted">申請人選自己的已發布班別，再指定同企業另一位員工的班別。對方同意後仍須主管核准；核准前兩個班別都不會改變。</p>'+
    '<button class="btn" data-extra="newSwap">提出換班申請</button>'));
};
const priorRequestsForSwap=requests;
requests=function(){
 priorRequestsForSwap();
 const all=(app.data?.requests||[]).filter(r=>r.kind==='swap'&&r.status==='pending');
 const actionable=all.filter(r=>app.mode==='demo'||person(r.target_member_id)?.user_id===app.user?.id);
 const rows=actionable.map(r=>tr([
  personLabel(r.member_id),personLabel(r.target_member_id),
  taiStamp(r.starts_at),r.target_accepted_at?'<span class="chip approved">對方已同意</span>':
   '<div class="flex"><button class="btn small primary" data-extra="swapConsent" data-id="'+esc(r.id)+'">同意</button>'+
   '<button class="btn small danger" data-extra="swapDecline" data-id="'+esc(r.id)+'">拒絕</button></div>'
 ]));
 if(actionable.length)$('appContent').insertAdjacentHTML('beforeend',
  panel('等待我確認的換班',table(['提出人','被交換人','原班別','操作／狀態'],rows)));
};
function showSwapDialog(){
 let sourceShifts=(app.data?.shifts||[]).filter(s=>s.status==='published');
 if(app.mode!=='demo'){
  sourceShifts=sourceShifts.filter(s=>person(s.member_id)?.user_id===app.user?.id);
 }
 if(!sourceShifts.length)throw Error('你目前沒有可供交換的已發布班表');
 const other=(app.data?.shifts||[]).filter(s=>s.status==='published'&&s.member_id!==sourceShifts[0].member_id);
 if(!other.length)throw Error('目前沒有其他員工可供交換的已發布班表');
 const choice=(all,filtered=false)=>all.map(s=>'<option value="'+esc(s.id)+'">'+
  personLabel(s.member_id)+' · '+taiDay(s.starts_at)+' '+taiTime(s.starts_at)+'—'+taiTime(s.ends_at)+
  '</option>').join('');
 showExtraForm('提出換班申請','swap_create',[
  {name:'source_shift_id',label:'我原本的班次',wide:true,html:selectField('source_shift_id',choice(sourceShifts))},
  {name:'target_shift_id',label:'想交換的班次（另一位員工）',wide:true,html:selectField('target_shift_id',choice(other))},
  {name:'reason',label:'原因',wide:true,html:'<textarea id="reason" name="reason" maxlength="500"></textarea>'}
 ],'送出換班申請');
}
const priorApprove=approve;
approve=async function(id,approved){
 const req=(app.data?.requests||[]).find(r=>r.id===id);
 if(req?.kind==='swap'){
  if(!confirm(approved?'對方已同意且班表沒有衝突才會核准。確認嗎？':'確定駁回換班嗎？'))return;
  await action('swap_review',{id,approved});
  return;
 }
 return priorApprove(id,approved);
};
const priorRenderWithInvite=render;
render=function(){
 priorRenderWithInvite();
 if(app.token&&location.hash.includes('invite=')&&!$('appContent').querySelector('[data-extra="acceptInvite"]')){
  $('appContent').insertAdjacentHTML('afterbegin',
    '<div class="notice">你收到一份尚未接受的員工邀請。</div>'+
    '<button class="btn primary" data-extra="acceptInvite">接受邀請加入企業</button>');
 }
};
document.addEventListener('click',async e=>{
 if(!e.target.closest('#appContent, #pageActions'))return;
 const b=e.target.closest('[data-extra]');if(!b)return;
 try{
  if(b.dataset.extra==='newSwap')showSwapDialog();
  else if(b.dataset.extra==='swapConsent'||b.dataset.extra==='swapDecline'){
   const accepted=b.dataset.extra==='swapConsent';
   if(confirm(accepted?'同意交換這個班別？':'拒絕換班申請？'))
    await action('swap_accept',{id:b.dataset.id,accepted});
  }
 }catch(err){banner(err.message,true);}
});



/* HR-ORG-02 / HR-SCH-07: transactional staff import and manager-reviewed auto drafts. */
extraNames.add('employee_import');
extraNames.add('auto_draft');
const existingEmployeesWithCsv=employees;
employees=function(){
 existingEmployeesWithCsv();
 if(app.mode==='demo'||role()==='owner'){
  $('appContent').insertAdjacentHTML('beforeend',
   panel('員工 CSV 批次匯入',
   '<p class="muted">只新增員工，不會修改或覆寫相同編號的既有員工。檔案採 UTF-8 CSV，欄位為員工編號、姓名、分店、角色、聘僱類型。</p>'+
   '<div class="flex"><button class="btn" data-extra="importCsv">選取 CSV 匯入</button>'+
   '<button class="btn" data-extra="sampleCsv">下載範例 CSV</button></div>'));
 }
};
function csvRows(text){
 const source=String(text||'').replace(/^\uFEFF/,'');const rows=[];
 let cell='',row=[],quoted=false;
 for(let i=0;i<source.length;i++){
  const c=source[i];
  if(c==='"'){if(quoted&&source[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(c===','&&!quoted){row.push(cell);cell='';}
  else if((c==='\n'||c==='\r')&&!quoted){
   if(c==='\r'&&source[i+1]==='\n')i++;
   row.push(cell);cell='';if(row.some(x=>x.trim()))rows.push(row);row=[];
  }else cell+=c;
 }
 if(quoted)throw Error('CSV 引號沒有正確結束');
 row.push(cell);if(row.some(x=>x.trim()))rows.push(row);
 if(rows.length<2)throw Error('CSV 缺少標題或員工資料');
 const names=rows.shift().map(x=>x.trim());
 const col=(alts)=>alts.map(x=>names.indexOf(x)).find(x=>x>=0);
 const code=col(['員工編號','employee_code','code']),name=col(['姓名','員工姓名','name','display_name']);
 const br=col(['分店','分店名稱','branch','branch_id']),rolecol=col(['角色','role']),typecol=col(['聘僱類型','employment_type']);
 if(code===undefined||name===undefined||br===undefined)throw Error('CSV 必須包含員工編號、姓名、分店欄位');
 const out=rows.map((r,i)=>{
  const b=String(r[br]||'').trim(),branchRecord=(app.data?.branches||[]).find(x=>x.id===b||x.name===b);
  if(!branchRecord)throw Error('第 '+(i+2)+' 列：分店不存在（'+b+'）');
  let role=String(r[rolecol]||'employee').trim().toLowerCase();
  role=({'員工':'employee','主管':'manager','店長':'manager','人資':'hr'})[role]||role;
  let employment_type=String(r[typecol]||'full_time').trim().toLowerCase();
  employment_type=({'正職':'full_time','兼職':'part_time','計時':'hourly'})[employment_type]||employment_type;
  const x={code:String(r[code]||'').trim(),name:String(r[name]||'').trim(),
   branch_id:branchRecord.id,role,employment_type};
  if(!x.code||!x.name||!['employee','manager','hr'].includes(role)
   ||!['full_time','part_time','hourly'].includes(employment_type))
   throw Error('第 '+(i+2)+' 列：員工編號、姓名、角色或聘僱類型不正確');
  return x;
 });
 if(out.length>(app.mode==='demo'?20:200))throw Error('本次最多匯入 '+(app.mode==='demo'?20:200)+' 人');
 return out;
}
function downloadCsv(){
 const b=app.data?.branches?.[0]?.name||'台北總店';
 const data='\uFEFF員工編號,姓名,分店,角色,聘僱類型\r\nCSV001,測試小華,'+b+',員工,正職\r\nCSV002,測試小林,'+b+',員工,兼職';
 const blob=new Blob([data],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='workforce-employee-template.csv';document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function openCsvImport(){
 openModal('員工 CSV 匯入','<p class="muted">匯入資料會立即新增到目前選擇的企業。相同員工編號直接略過，不會覆寫。</p>'+
 '<div class="field"><label for="csvFile">UTF-8 CSV 檔案</label>'+
 '<input id="csvFile" type="file" accept=".csv,text/csv" required></div>'+
 '<div class="modal-actions"><button class="btn primary" data-extra="runImport">確認匯入</button></div>');
}
async function runCsvImport(){
 const file=$('csvFile')?.files?.[0];if(!file)throw Error('請先選擇 CSV 檔案');
 if(file.size>500000)throw Error('檔案超過 500 KB');
 const rows=csvRows(await file.text());
 if(!confirm('確定匯入 '+rows.length+' 名員工？已存在的編號將略過。'))return;
 const result=await action('employee_import',{rows});
 banner('已新增 '+(result?.created||0)+' 人，略過重複 '+(result?.skipped_existing||0)+' 人');
}
app.autoSuggestions=null;
function proposeWorkforceWeek(){
 const monday=dayAdd(app.date,-((new Date(app.date+'T12:00:00Z').getUTCDay()+6)%7));
 const d=app.data||{};
 const assigned=[...(d.shifts||[]).filter(s=>s.status!=='cancelled').map(s=>({...s}))];
 const suggestions=[],gaps=[];
 const weekdayNames=['日','一','二','三','四','五','六'];
 const rules=d.requirements||[];
 if(!rules.length)return {suggestions,gaps:[{day:monday,reason:'尚未設定分店最低人力需求'}]};
 for(let offset=0;offset<7;offset++){
  const date=dayAdd(monday,offset),weekday=new Date(date+'T12:00:00Z').getUTCDay();
  for(const rule of rules.filter(r=>r.weekday===weekday)){
   const start=date+'T'+String(rule.starts_local).slice(0,5)+':00+08:00';
   const endDay=String(rule.ends_local)<=String(rule.starts_local)?dayAdd(date,1):date;
   const end=endDay+'T'+String(rule.ends_local).slice(0,5)+':00+08:00';
   const startMs=new Date(start).getTime(),endMs=new Date(end).getTime();
   let covering=assigned.filter(s=>s.branch_id===rule.branch_id&&new Date(s.starts_at)<=startMs&&new Date(s.ends_at)>=endMs).length;
   let vacancies=Math.max(0,Number(rule.needed)-covering);
   while(vacancies>0&&suggestions.length<30){
    const candidates=(d.members||[]).filter(m=>m.status==='active'&&m.branch_id===rule.branch_id).map(m=>{
     const ms=assigned.filter(s=>s.member_id===m.id);
     const overlaps=ms.some(s=>new Date(s.starts_at)<endMs&&new Date(s.ends_at)>startMs);
     const tooClose=ms.some(s=>{
      const st=new Date(s.starts_at).getTime(),en=new Date(s.ends_at).getTime();
      return (en<=startMs&&startMs-en<11*3600000)||(st>=endMs&&st-endMs<11*3600000);
     });
     const weekMs=ms.filter(s=>taiDay(s.starts_at)>=monday&&taiDay(s.starts_at)<=dayAdd(monday,6))
       .reduce((sum,s)=>sum+(new Date(s.ends_at).getTime()-new Date(s.starts_at).getTime()),0);
     const conflicts=(d.requests||[]).some(r=>r.member_id===m.id&&r.kind==='leave'&&r.status==='approved'
       &&new Date(r.starts_at)<endMs&&new Date(r.ends_at)>startMs);
     const availability=(d.availability||[]).filter(x=>x.member_id===m.id&&new Date(x.starts_at)<endMs&&new Date(x.ends_at)>startMs);
     const blocked=availability.some(x=>!x.available);
     const positive=(d.availability||[]).filter(x=>x.member_id===m.id&&x.available&&taiDay(x.starts_at)>=monday&&taiDay(x.starts_at)<=dayAdd(monday,6));
     const preferred=positive.some(x=>new Date(x.starts_at)<=startMs&&new Date(x.ends_at)>=endMs);
     const mustMatch=positive.length>0&&!preferred;
     return {m,weekMs,preferred,eligible:!overlaps&&!tooClose&&!conflicts&&!blocked&&!mustMatch&&weekMs+(endMs-startMs)<=40*3600000};
    }).filter(x=>x.eligible).sort((a,b)=>Number(b.preferred)-Number(a.preferred)||a.weekMs-b.weekMs||a.m.employee_code.localeCompare(b.m.employee_code));
    if(!candidates.length)break;
    const chosen=candidates[0];
    const proposal={member_id:chosen.m.id,branch_id:rule.branch_id,
      starts_at:new Date(startMs).toISOString(),ends_at:new Date(endMs).toISOString(),
      reason:'週'+weekdayNames[weekday]+'人力需求 '+rule.needed+' 人；先排較少工時且無衝突者'};
    suggestions.push(proposal);assigned.push({...proposal,status:'draft'});vacancies--;
   }
   if(vacancies>0)gaps.push({day:date,branch_id:rule.branch_id,missing:vacancies,reason:'可排人員不足或休息／請假衝突'});
  }
 }
 return {suggestions,gaps,monday};
}
const previousScheduleAuto=schedule;
schedule=function(){
 previousScheduleAuto();
 const p=app.autoSuggestions;
 const controls=manager()?'<div class="flex"><button class="btn" data-extra="autoPreview">產生排班建議</button>'+
 (p?.suggestions?.length?'<button class="btn primary" data-extra="autoCommit">確認建立 '+p.suggestions.length+' 個班表草稿</button>':'')+'</div>':'';
 const preview=p?table(['員工','分店','開始','結束','建議原因'],
  p.suggestions.map(s=>tr([personLabel(s.member_id),esc(branch(s.branch_id)?.name||''),taiStamp(s.starts_at),taiStamp(s.ends_at),esc(s.reason)]))):
  '<p class="muted">設定分店最低人力需求後，可先生成班表建議，主管確認才寫入資料庫草稿。</p>';
 const gaps=p?.gaps?.length?'<div class="notice warning">目前有 '+p.gaps.length+' 個未滿足人力需求的班段，系統不會強制排出超時／衝突班表。</div>':'';
 $('appContent').insertAdjacentHTML('beforeend',
  panel('自動排班建議（主管確認後才存草稿）',
   controls+'<div class="notice">演算法參考已排班、排休、可上班時段及目前工時，暫以每週 40 小時和班間 11 小時作保守建議門檻；這不是法定工時計算結果。</div>'+
   preview+gaps));
};
document.addEventListener('click',async e=>{
 if(!e.target.closest('#appContent, #pageActions'))return;
 const b=e.target.closest('[data-extra]');if(!b)return;
 try{
  if(b.dataset.extra==='importCsv')openCsvImport();
  else if(b.dataset.extra==='sampleCsv')downloadCsv();
  else if(b.dataset.extra==='autoPreview'){app.autoSuggestions=proposeWorkforceWeek();render();}
  else if(b.dataset.extra==='autoCommit'){
   const assignments=app.autoSuggestions?.suggestions||[];
   if(!assignments.length)throw Error('尚無可建立的班表建議');
   if(!confirm('確認將 '+assignments.length+' 個建議寫入資料庫草稿？不會直接發布。'))return;
   const result=await action('auto_draft',{assignments});
   app.autoSuggestions=null;render();banner('已建立 '+(result?.draft_count||0)+' 個草稿，請主管逐一確認發布');
  }
 }catch(err){banner(err.message,true);}
});
$('overlay').addEventListener('click',async e=>{
 const b=e.target.closest('[data-extra]');if(!b)return;
 if(b.dataset.extra==='runImport')try{await runCsvImport();}catch(err){banner(err.message,true);}
});


/* Prevent a shift-swap form from defaulting to the same worker. */
$('overlay').addEventListener('change',e=>{
 if(e.target?.id==='source_shift_id'){
  const selected=(app.data?.shifts||[]).find(s=>s.id===e.target.value);
  const target=$('target_shift_id');if(!selected||!target)return;
  target.innerHTML=(app.data?.shifts||[]).filter(s=>s.status==='published'&&s.member_id!==selected.member_id)
    .map(s=>'<option value="'+esc(s.id)+'">'+personLabel(s.member_id)+' · '+taiDay(s.starts_at)+' '+taiTime(s.starts_at)+'</option>').join('');
 }
});



/* HR-LVE policies: tenant-scoped rule versions, entitlement grants and staged approvals. */
extraNames.add('leave_policy');extraNames.add('leave_grant');extraNames.add('leave_stage');
function currentLeavePolicies(){
 const data=[...(app.data?.leavePolicies||[])].filter(x=>x.effective_from<=today())
  .sort((a,b)=>b.effective_from.localeCompare(a.effective_from));
 const latest=[];const seen=new Set();
 for(const p of data){if(!seen.has(p.leave_kind)){seen.add(p.leave_kind);latest.push(p);}}
 return latest;
}
const priorLeaveRequests=requests;
requests=function(){
 priorLeaveRequests();
 const policies=currentLeavePolicies();
 const canEdit=app.mode==='demo'||['owner','hr'].includes(role());
 const rows=policies.map(p=>tr([
  esc(p.label),esc(p.yearly_basis==='anniversary'?'週年制':'曆年制'),
  p.balance_required?'需要核定額度':'依假別規則',
  esc(p.approval_levels)+' 層',status(p.is_active?'active':'inactive'),
  esc(p.effective_from)
 ]));
 $('appContent').insertAdjacentHTML('beforeend',
  panel('假別政策與生效版本',table(['假別','年度制','額度','簽核','狀態','生效日'],rows),
    canEdit?'<div class="flex"><button class="btn small" data-extra="newLeavePolicy">設定假別政策</button>'+
     '<button class="btn small" data-extra="newLeaveGrant">核定員工假期時數</button></div>':'')+
  '<div class="notice">假別時數由企業配置；待審申請會預先占用額度。這不是自動核發的法定特休，也不代表已完成勞動法令檢核。</div>');
};
function showLeavePolicyForm(){
 if(!(app.mode==='demo'||['owner','hr'].includes(role())))throw Error('只有企業負責人或人資可以設定假別');
 const rules=currentLeavePolicies();
 showExtraForm('假別與生效規則','leave_policy',[
  {name:'leave_kind',label:'假別代碼（英文小寫、底線）',html:input('leave_kind','text','annual','pattern="[a-z_]{2,40}" maxlength="40"')},
  {name:'label',label:'假別名稱',html:input('label','text','特別休假','maxlength="80"')},
  {name:'effective_from',label:'生效日期',html:input('effective_from','date',today())},
  {name:'yearly_basis',label:'年度規則',html:selectField('yearly_basis',
    '<option value="calendar">曆年制</option><option value="anniversary">到職週年制</option>')},
  {name:'balance_required',label:'是否須有核定額度',html:selectField('balance_required',
    '<option value="true">須有額度並扣除待審</option><option value="false">不強制核定額度</option>')},
  {name:'carryover_hours',label:'企業核定結轉時數',html:input('carryover_hours','number','0','min="0" max="4000" step="0.5"')},
  {name:'approval_levels',label:'簽核層數',html:selectField('approval_levels',
    '<option value="1">單層</option>'+(app.mode==='demo'?'':'<option value="2">兩層（不同主管）</option><option value="3">三層（不同主管）</option>'))},
  {name:'requires_document',label:'證明文件',html:selectField('requires_document',
    '<option value="false">不要求</option><option value="true">須提供證明文件（尚需附件開通）</option>')},
  {name:'is_active',label:'規則狀態',html:selectField('is_active',
    '<option value="true">啟用</option><option value="false">停用</option>')}
 ],'儲存規則版本');
}
function showLeaveGrantForm(){
 if(!(app.mode==='demo'||['owner','hr'].includes(role())))throw Error('只有企業負責人或人資可以核定額度');
 const policies=currentLeavePolicies();
 const select=policies.map(p=>'<option value="'+esc(p.leave_kind)+'">'+esc(p.label)+'</option>').join('')
  ||'<option value="annual">特別休假</option>';
 showExtraForm('核定員工假期時數','leave_grant',[
  {name:'member_id',label:'員工',html:memberFilter(getSelected())},
  {name:'leave_kind',label:'假別',html:selectField('leave_kind',select)},
  {name:'year',label:'所屬年度／週年期起始年度',html:input('year','number',today().slice(0,4),'min="2000" max="2150"')},
  {name:'hours',label:'核定時數',html:input('hours','number','8','min="0" max="4000" step="0.5"')}
 ],'儲存員工額度');
}
async function refreshLeaveMemberBalance(id){
 if(app.mode==='demo')return;
 if(!id||!app.token||!app.tenantId)return;
 try{
  const balances=await call('/rest/v1/rpc/wm_leave_balances','POST',
   {p_tenant:app.tenantId,p_member:id,p_on:today()},app.token);
  if(app.data){app.data.leaveBalances[id]=balances;render();}
 }catch(error){banner(error.message,true);}
}
$('appContent').addEventListener('change',e=>{
 if(e.target.id==='balanceMember')void refreshLeaveMemberBalance(e.target.value);
});
const oldLeaveApprove=approve;
approve=async function(id,approved){
 const item=(app.data?.requests||[]).find(r=>r.id===id);
 if(app.mode==='real'&&item?.kind==='leave'){
  if(!confirm(approved?'確認執行這一層請假簽核？':'確定駁回這筆請假申請？'))return;
  const result=await action('leave_stage',{id,approved,note:approved?'主管簽核同意':'主管駁回'});
  if(result?.status==='pending')banner('已完成本層簽核，待下一位主管核准');
  return;
 }
 return oldLeaveApprove(id,approved);
};
const previousStageApprovals=approvals;
approvals=function(){
 previousStageApprovals();
 const steps=app.data?.requestStages||[];
 const list=(app.data?.requests||[]).filter(x=>x.status==='pending'&&x.kind==='leave');
 const rows=list.map(r=>{
  const version=(app.data.leavePolicies||[]).find(p=>p.id===r.leave_policy_id);
  const required=Number(version?.approval_levels||1);
  const completed=steps.filter(x=>x.request_id===r.id).length;
  return tr([personLabel(r.member_id),esc(kind(r.leave_kind)),
   esc(completed)+' / '+esc(required)]);
 });
 if(list.length)$('appContent').insertAdjacentHTML('beforeend',
  panel('多層請假簽核進度',table(['申請員工','假別','已完成／需要'],rows)));
};
document.addEventListener('click',e=>{
 if(!e.target.closest('#appContent, #pageActions'))return;
 const b=e.target.closest('[data-extra]');if(!b)return;
 try{
  if(b.dataset.extra==='newLeavePolicy')showLeavePolicyForm();
  else if(b.dataset.extra==='newLeaveGrant')showLeaveGrantForm();
 }catch(err){banner(err.message,true);}
});


/* PRD HR-LVE: display configured custom leave names without changing statuses. */
const oldLeaveKind=kind;
kind=function(v){
 if(typeof v!=='string')return oldLeaveKind(v);
 const current=(app.data?.leavePolicies||[]).filter(p=>p.leave_kind===v)
   .sort((a,b)=>b.effective_from.localeCompare(a.effective_from))[0];
 return current?.label||oldLeaveKind(v);
};



/* PRD HR-ATT-05/08: server-produced anomalies, resolution SLA and rules. */
TABS.anomalies=['出勤異常','檢查已完成班別的遲到、早退與缺卡；主管追蹤異常與補卡原因。'];
document.querySelector('#nav').insertAdjacentHTML('beforeend',
 '<button type="button" data-tab="anomalies"><span>!</span> 出勤異常</button>');
extraNames.add('attendance_scan');extraNames.add('attendance_resolve');extraNames.add('attendance_rule');
app.anomalyFrom=dayAdd(today(),-7);
app.anomalyThrough=today();
const anomalyTitles={missing_in:'缺上班卡',missing_out:'缺下班卡',late:'遲到',early:'早退'};
function renderAttendanceCases(){
 heading(manager()?'<button class="btn primary" data-extra="scanAttendance">重新掃描異常</button>':'');
 const d=app.data||{},items=d.attendanceCases||[],rule=d.attendanceRules||{};
 const me=app.mode==='real'&&!manager()?
   items.filter(x=>person(x.member_id)?.user_id===app.user?.id):items;
 const opened=me.filter(x=>x.status==='open');
 const rows=me.map(x=>tr([
  personLabel(x.member_id),esc(branch(person(x.member_id)?.branch_id)?.name||'—'),
  esc(anomalyTitles[x.kind]||x.kind),taiStamp(x.expected_at),
  x.observed_at?taiStamp(x.observed_at):'未找到有效打卡',
  x.deviation_minutes?esc(x.deviation_minutes)+' 分鐘':'—',
  x.status==='open'?'<span class="chip pending">待確認</span>':'<span class="chip approved">已結案</span>',
  x.status==='open'&&manager()?'<button type="button" class="btn small" data-extra="anomalyResolve" data-id="'+esc(x.id)+'">結案</button>':
   '<span class="muted">'+esc(x.resolution_note||'—')+'</span>'
 ]));
 const controls=manager()?'<div class="toolbar"><div class="field"><label>掃描起日</label>'+
  '<input type="date" id="anomalyFrom" class="filter" value="'+esc(app.anomalyFrom)+'"></div>'+
  '<div class="field"><label>掃描迄日</label><input type="date" id="anomalyThrough" class="filter" value="'+esc(app.anomalyThrough)+'"></div>'+
  '<button class="btn" data-extra="scanAttendance">掃描已完成班次</button></div>':'';
 $('appContent').innerHTML='<div class="cards">'+stat('待處理異常',opened.length,'僅列出可存取範圍')+
  stat('已結案',me.filter(x=>x.status==='resolved').length,'處理歷史保留')+
  stat('逾期未處理',opened.filter(x=>new Date(x.due_at)<new Date()).length,'以設定 SLA 計算')+
  '</div>'+panel('出勤異常清單',controls+table(
  ['員工','分店','種類','應到時間','觀察時間','偏差','狀態','處理'],rows))+
  panel('企業異常判定設定',
   '<p>容許時間：'+esc(rule.grace_minutes??5)+' 分鐘；處理期限：'+esc(rule.anomaly_sla_hours??48)+
   ' 小時；提醒靜音時段：'+esc(rule.quiet_from||'22:00')+'–'+esc(rule.quiet_until||'08:00')+'</p>'+
   '<div class="notice">異常只比對原始打卡與已發布班表，不會修改打卡、判定法定加班或自動扣薪。已核准且涵蓋整班的請假不列缺卡。</div>',
   app.mode==='real'&&['owner','hr'].includes(role())?'<button class="btn small" data-extra="anomalyRule">設定出勤規則</button>':'')+
  (manager()?'<p class="muted">掃描以伺服器時間判斷已結束的班次，單次最多 31 天。重掃不會重複建立同一異常。</p>':'');
}
const prevRenderForAnomalies=render;
render=function(){
 prevRenderForAnomalies();
 if(app.data&&app.tab==='anomalies')renderAttendanceCases();
};
function showAnomalyResolve(id){
 const item=(app.data?.attendanceCases||[]).find(x=>x.id===id);
 if(!item)throw Error('找不到異常案件');
 showExtraForm('結案：'+(anomalyTitles[item.kind]||item.kind),'attendance_resolve',[
  {name:'id',label:'異常識別碼',html:'<input id="id" name="id" value="'+esc(id)+'" readonly>'},
  {name:'note',label:'結案理由／補卡處理結果',wide:true,
   html:'<textarea id="note" name="note" minlength="3" maxlength="500" required></textarea>'}
 ],'確認結案');
}
function showAnomalyRule(){
 if(app.mode!=='real'||!['owner','hr'].includes(role()))throw Error('僅企業負責人或人資可以設定');
 const a=app.data.attendanceRules||{};
 showExtraForm('出勤異常偵測規則','attendance_rule',[
  {name:'grace_minutes',label:'遲到／早退容許分鐘',html:input('grace_minutes','number',a.grace_minutes??5,'min="0" max="120"')},
  {name:'anomaly_sla_hours',label:'案件處理期限（小時）',html:input('anomaly_sla_hours','number',a.anomaly_sla_hours??48,'min="1" max="720"')},
  {name:'quiet_from',label:'通知靜音開始',html:input('quiet_from','time',a.quiet_from||'22:00')},
  {name:'quiet_until',label:'通知靜音結束',html:input('quiet_until','time',a.quiet_until||'08:00')}
 ],'儲存出勤規則');
}
$('appContent').addEventListener('change',e=>{
 if(e.target.id==='anomalyFrom')app.anomalyFrom=e.target.value;
 if(e.target.id==='anomalyThrough')app.anomalyThrough=e.target.value;
});
document.addEventListener('click',async e=>{
 if(!e.target.closest('#appContent, #pageActions'))return;
 const b=e.target.closest('[data-extra]');if(!b)return;
 try{
  if(b.dataset.extra==='scanAttendance'){
   if(!manager())throw Error('只有主管可掃描出勤異常');
   if(!app.anomalyFrom||!app.anomalyThrough)throw Error('請選擇日期');
   const result=await action('attendance_scan',{from:app.anomalyFrom,through:app.anomalyThrough});
   banner('已完成 '+(result?.checked_shifts??0)+' 個班別檢查，新增 '+(result?.created_anomalies??0)+' 件異常');
  }
  else if(b.dataset.extra==='anomalyResolve')showAnomalyResolve(b.dataset.id);
  else if(b.dataset.extra==='anomalyRule')showAnomalyRule();
 }catch(error){banner(error.message,true);}
});



/* HR-LVE-07: verified-identity private evidence files for formally authenticated companies only. */
const beforeRequestDocs=requests;
requests=function(){
 beforeRequestDocs();
 const d=app.data||{},canUpload=app.mode==='real'&&!!app.token;
 let rows=(d.requests||[]).filter(x=>['leave','correction','overtime'].includes(x.kind)).slice(0,50).map(r=>{
  const docs=(d.requestDocs||[]).filter(x=>x.request_id===r.id);
  const isOwn=person(r.member_id)?.user_id===app.user?.id;
  const pending=r.status==='pending';
  const current=(d.leavePolicies||[]).find(p=>p.id===r.leave_policy_id);
  const proofRequired=r.kind==='leave'&&current?.requires_document;
  return tr([
   personLabel(r.member_id),esc(kind(r.kind))+(r.kind==='leave'?' · '+esc(kind(r.leave_kind)):''),
   status(r.status)+(proofRequired?'<span class="chip pending">須證明</span>':''),
   esc(docs.length)+' 件',
   '<div class="flex">'+
    (canUpload&&pending&&(isOwn||manager())?'<button type="button" class="btn small" data-extra="evidenceUpload" data-id="'+esc(r.id)+'">新增附件</button>':'')+
    docs.map(x=>'<button type="button" class="btn small" data-extra="evidenceDownload" data-id="'+esc(x.id)+'">'+esc(x.filename)+'</button>').join('')+
   '</div>'
  ]);
 });
 $('appContent').insertAdjacentHTML('beforeend',
  panel('申請證明附件（私人檔案）',
   '<div class="notice">僅正式企業模式可上傳，PDF／PNG／JPEG，單一檔案最多 5 MB，每份待審申請最多 5 份。附件限本人及有權限的主管查看；原始檔案不會公開到 Demo 或 GitHub。</div>'+
   table(['員工','申請項目','狀態','附件數','操作'],rows)));
};
function showEvidenceUploader(id){
 if(app.mode!=='real'||!app.token)throw Error('上傳證明請先登入正式企業');
 const item=(app.data?.requests||[]).find(x=>x.id===id);
 if(!item||item.status!=='pending')throw Error('只有待審申請可以上傳文件');
 const owner=person(item.member_id)?.user_id===app.user?.id;
 if(!owner&&!manager())throw Error('沒有權限存取此申請');
 openModal('新增請假／補卡證明附件',
  '<div class="notice">證明文件可能包含健康或個人資訊，僅限申請者及具備審核權限的人員查看。請勿上傳不必要的個資。</div>'+
  '<input type="hidden" id="evidenceRequestId" value="'+esc(id)+'">'+
  '<div class="field"><label for="evidenceFile">選擇 PDF／PNG／JPG（最大 5 MB）</label>'+
  '<input id="evidenceFile" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"></div>'+
  '<div class="modal-actions"><button type="button" class="btn primary" data-extra="evidenceUploadSubmit">上傳到企業私人空間</button></div>');
}
async function uploadEvidence(){
 if(app.mode!=='real'||!app.token)throw Error('需要企業登入');
 if(app.busy)throw Error('正在執行其他操作，請重新嘗試');
 const file=$('evidenceFile')?.files?.[0],requestId=$('evidenceRequestId')?.value;
 if(!file||!requestId)throw Error('請選擇證明檔案');
 const types={'application/pdf':'.pdf','image/png':'.png','image/jpeg':'.jpg'};
 const ext=types[file.type];
 if(!ext||file.size<1||file.size>5242880)throw Error('檔案必須是 PDF、PNG 或 JPG，大小不超過 5 MB');
 const r=(app.data?.requests||[]).find(x=>x.id===requestId);
 if(!r||r.status!=='pending')throw Error('這份申請已不接受新增附件');
 const existing=(app.data?.requestDocs||[]).filter(x=>x.request_id===requestId).length;
 if(existing>=5)throw Error('這份申請已達 5 份附件上限');
 const storagePath=app.tenantId+'/'+requestId+'/'+crypto.randomUUID()+ext;
 app.busy=true;
 try{
  const response=await fetch(API+'/storage/v1/object/wm-private-evidence/'+storagePath,{
   method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+app.token,
    'Content-Type':file.type,'x-upsert':'false'},body:file,cache:'no-store'});
  if(!response.ok){
   const detail=await response.json().catch(()=>null);
   throw Error(detail?.message||detail?.error||'私人附件上傳失敗 ('+response.status+')');
  }
  await call('/rest/v1/wm_request_documents','POST',{
   tenant_id:app.tenantId,request_id:requestId,storage_path:storagePath,
   filename:file.name.slice(0,180),mime_type:file.type,byte_size:file.size,
   uploaded_by:app.user.id},app.token);
  app.busy=false;closeModal();await reload(true);banner('已儲存私人附件並綁定申請單');
 }catch(error){app.busy=false;throw error;}
}
async function downloadEvidence(id){
 if(app.mode!=='real'||!app.token)throw Error('需要企業登入');
 const record=(app.data?.requestDocs||[]).find(x=>x.id===id);
 if(!record)throw Error('找不到本企業授權的文件');
 const response=await fetch(API+'/storage/v1/object/authenticated/wm-private-evidence/'+record.storage_path,{
  method:'GET',headers:{apikey:KEY,Authorization:'Bearer '+app.token},cache:'no-store'});
 if(!response.ok)throw Error('沒有檔案權限或文件已不存在 ('+response.status+')');
 const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=record.filename;a.rel='noopener';document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),5000);
}
document.addEventListener('click',async e=>{
 if(!e.target.closest('#appContent, #pageActions'))return;
 const b=e.target.closest('[data-extra]');if(!b)return;
 try{
  if(b.dataset.extra==='evidenceUpload')showEvidenceUploader(b.dataset.id);
  if(b.dataset.extra==='evidenceDownload')await downloadEvidence(b.dataset.id);
 }catch(error){banner(error.message,true);}
});
$('overlay').addEventListener('click',async e=>{
 const b=e.target.closest('[data-extra]');if(!b)return;
 if(b.dataset.extra==='evidenceUploadSubmit'){
  b.disabled=true;
  try{await uploadEvidence();}catch(error){banner(error.message,true);}
  finally{b.disabled=false;}
 }
});



/* HR-SCH-02: time editing, templates, day/week/month calendar and export. */
extraNames.add('shift_move');
app.scheduleView='week';
const baseShiftForm=showShift;
showShift=function(){
 baseShiftForm();
 const form=$('overlay')?.querySelector('form[data-form="shift"]');
 if(!form)return;
 const templates=app.data?.templates||[];
 if(templates.length)form.insertAdjacentHTML('afterbegin',
  '<div class="field wide"><label for="shiftTemplate">套用班型範本</label>'+
  '<select id="shiftTemplate"><option value="">自訂</option>'+
  templates.map(t=>'<option value="'+esc(t.id)+'">'+esc(t.name)+'</option>').join('')+'</select></div>');
};
$('overlay').addEventListener('change',e=>{
 if(e.target.id!=='shiftTemplate')return;
 const t=(app.data?.templates||[]).find(x=>x.id===e.target.value);
 if(!t)return;
 const start=$('starts_at'),end=$('ends_at');if(!start||!end)return;
 const date=start.value.slice(0,10)||app.date;
 const startTime=String(t.starts_local).slice(0,5),endTime=String(t.ends_local).slice(0,5);
 start.value=date+'T'+startTime;
 end.value=(endTime<=startTime?dayAdd(date,1):date)+'T'+endTime;
});
const oldShiftActions=rowButtons;
rowButtons=function(id,mode){
 const current=oldShiftActions(id,mode);
 return manager()?current+'<button class="btn small" data-extra="moveShift" data-id="'+esc(id)+'">改期</button>':current;
};
function calendarRows(){
 const all=(app.data?.shifts||[]).filter(x=>x.status!=='cancelled');
 const date=app.date,d=new Date(date+'T12:00:00Z'),monday=dayAdd(date,-((d.getUTCDay()+6)%7));
 return all.filter(s=>{
  const day=taiDay(s.starts_at);
  return app.scheduleView==='day'?day===date:
    app.scheduleView==='month'?day.slice(0,7)===date.slice(0,7):
    day>=monday&&day<=dayAdd(monday,6);
 }).sort((a,b)=>a.starts_at.localeCompare(b.starts_at));
}
function exportCalendar(){
 const rows=[['員工編號','姓名','門市','開始時間','結束時間','狀態'],
 ...calendarRows().map(s=>[person(s.member_id)?.employee_code||'',
  person(s.member_id)?.display_name||'',branch(s.branch_id)?.name||'',
  taiStamp(s.starts_at),taiStamp(s.ends_at),s.status])];
 const cell=v=>{let x=String(v??'');if(/^\s*[=+\-@]/.test(x))x="'"+x;return '"'+x.replaceAll('"','""')+'"';};
 const blob=new Blob(['\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')],
 {type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='workforce-schedule-'+app.date+'.csv';document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function dateCard(day,compact=false){
 const shifts=(app.data?.shifts||[]).filter(x=>x.status!=='cancelled'&&taiDay(x.starts_at)===day)
  .sort((a,b)=>a.starts_at.localeCompare(b.starts_at));
 return '<div class="day" data-schedule-day="'+esc(day)+'"><strong>'+esc(day.slice(5))+'</strong>'+
 shifts.slice(0,compact?3:50).map(x=>'<div class="shift-card" '+(manager()?'draggable="true"':'')+
  ' data-shift-id="'+esc(x.id)+'"><b>'+personLabel(x.member_id)+'</b>'+
  '<span>'+taiTime(x.starts_at)+'–'+taiTime(x.ends_at)+'</span></div>').join('')+
 (shifts.length>(compact?3:50)?'<small>另 '+(shifts.length-3)+' 筆</small>':'')+
 (!shifts.length?'<small class="muted">無班次</small>':'')+'</div>';
}
const formerCalendar=schedule;
schedule=function(){
 formerCalendar();
 const main=$('appContent'),view=app.scheduleView;
 const buttons=['day','week','month'].map((x,i)=>
  '<button class="btn '+(x===view?'primary':'')+'" data-extra="scheduleView" data-view="'+x+'">'+['日','週','月'][i]+'</button>').join('');
 main.insertAdjacentHTML('afterbegin',panel('排班檢視及匯出',
  '<div class="toolbar">'+buttons+'<button class="btn" data-extra="exportSchedule">匯出 CSV</button>'+
  '<button class="btn" data-extra="printSchedule">列印</button></div>'));
 if(view==='week')return;
 const old=main.querySelector('.schedule-week');if(old)old.hidden=true;
 let dates=[];
 if(view==='day')dates=[app.date];
 else{
  const first=app.date.slice(0,7)+'-01',dow=(new Date(first+'T12:00:00Z').getUTCDay()+6)%7;
  const monday=dayAdd(first,-dow);
  dates=Array.from({length:42},(_,i)=>dayAdd(monday,i));
 }
 const grid='<div style="overflow-x:auto"><div class="schedule-week" style="min-width:'+
   (view==='day'?'250px':'760px')+';grid-template-columns:repeat('+(view==='day'?1:7)+',minmax(0,1fr))">'+
   dates.map(d=>dateCard(d,view==='month')).join('')+'</div></div>';
 main.insertAdjacentHTML('afterbegin',panel(view==='day'?'當日排班':'月份排班',grid));
};
function changeShiftDate(id){
 if(!manager())throw Error('只有主管可以修改班表');
 const s=(app.data?.shifts||[]).find(x=>x.id===id&&x.status!=='cancelled');
 if(!s)throw Error('找不到有效班次');
 openModal('調整班次日期與開始時間',
  '<p>'+personLabel(s.member_id)+' · '+esc(branch(s.branch_id)?.name||'')+'</p>'+
  '<p class="muted">保留原班次長度；重疊與已月結日期會被資料庫拒絕。</p>'+
  '<div class="field"><label for="shiftNewStart">新開始時間</label>'+
  '<input id="shiftNewStart" type="datetime-local" value="'+esc(taiDay(s.starts_at)+'T'+taiTime(s.starts_at))+'"></div>'+
  '<input type="hidden" id="shiftMoveId" value="'+esc(id)+'">'+
  '<div class="modal-actions"><button class="btn primary" data-extra="commitMoveShift">儲存改期</button></div>');
}
async function commitShiftMove(id,local){
 if(!manager())throw Error('只有主管可以修改班表');
 const s=(app.data?.shifts||[]).find(x=>x.id===id);
 if(!s||!local)throw Error('日期或班次不正確');
 if(!confirm('確定移動班次並由系統檢查時段衝突？'))return;
 await action('shift_move',{id,starts_at:tzIso(local)});
}
let draggingShift='';
$('appContent').addEventListener('dragstart',e=>{
 const shift=e.target.closest('[data-shift-id]');
 if(!manager()||!shift)return;
 draggingShift=shift.dataset.shiftId;
 e.dataTransfer.setData('text/plain',draggingShift);
 e.dataTransfer.effectAllowed='move';
});
$('appContent').addEventListener('dragover',e=>{
 if(draggingShift&&manager()&&e.target.closest('[data-schedule-day]'))e.preventDefault();
});
$('appContent').addEventListener('drop',async e=>{
 const day=e.target.closest('[data-schedule-day]')?.dataset.scheduleDay;
 if(!day||!draggingShift||!manager())return;
 e.preventDefault();
 const id=draggingShift;draggingShift='';
 const s=(app.data?.shifts||[]).find(x=>x.id===id);
 if(!s||taiDay(s.starts_at)===day)return;
 try{await commitShiftMove(id,day+'T'+taiTime(s.starts_at));}
 catch(error){banner(error.message,true);}
});
document.addEventListener('click',e=>{
 if(!e.target.closest('#appContent, #pageActions'))return;
 const b=e.target.closest('[data-extra]');if(!b)return;
 try{
  if(b.dataset.extra==='scheduleView'){app.scheduleView=b.dataset.view;render();}
  else if(b.dataset.extra==='exportSchedule')exportCalendar();
  else if(b.dataset.extra==='printSchedule')window.print();
  else if(b.dataset.extra==='moveShift')changeShiftDate(b.dataset.id);
 }catch(error){banner(error.message,true);}
});
$('overlay').addEventListener('click',async e=>{
 const b=e.target.closest('[data-extra="commitMoveShift"]');if(!b)return;
 b.disabled=true;
 try{await commitShiftMove($('shiftMoveId')?.value,$('shiftNewStart')?.value);}
 catch(error){banner(error.message,true);}
 finally{b.disabled=false;}
});



/* HR-LINE-01..04: authenticated employee LINE binding and monitored deliveries. */
TABS.line=['LINE 身分與通知','驗證員工 LINE 身分，查看通知佇列及發送狀態。'];
document.querySelector('#nav').insertAdjacentHTML('beforeend',
 '<button type="button" data-tab="line"><span>▣</span> LINE 通知</button>');
app.lineState=null;
app.lineConfig=null;
async function lineEndpoint(data=null){
 const headers={apikey:KEY};
 if(data)headers['Content-Type']='application/json';
 if(app.mode==='real'&&app.token)headers.Authorization='Bearer '+app.token;
 const res=await fetch(API+'/functions/v1/wm-line',{
  method:data?'POST':'GET',headers,body:data?JSON.stringify(data):undefined,cache:'no-store'});
 const result=await res.json().catch(()=>({error:'LINE_RESPONSE_INVALID'}));
 if(!res.ok)throw Error(result.error||'LINE 服務發生問題 ('+res.status+')');
 return result;
}
async function refreshLineStatus(){
 if(app.mode!=='real'||!app.token||!app.tenantId){app.lineState=null;return;}
 try{
  const [config,linked]=await Promise.all([
   lineEndpoint(),lineEndpoint({action:'status',tenant_id:app.tenantId})]);
  app.lineConfig=config;app.lineState=linked;
  if(app.tab==='line')render();
 }catch(error){app.lineState={error:error.message};if(app.tab==='line')render();}
}
const priorLineRender=render;
render=function(){
 priorLineRender();
 if(!app.data||app.tab!=='line')return;
 heading();
 const info=app.lineState||{};
 const cfg=app.lineConfig||{};
 const linkInfo=app.mode==='demo'
  ?'<div class="notice">公開 Demo 不能綁定 LINE 身分，也不會向真實 LINE 帳號發送訊息。請登入企業帳號後綁定。</div>'
  :!app.token?'<div class="notice">請先登入企業帳號。</div>'
  :'<div class="bar-row"><span>此員工 LINE 身分</span><strong>'+
     esc(info.error?'無法確認：'+info.error:info.linked?'已驗證綁定':'尚未綁定')+'</strong></div>'+
   '<div class="bar-row"><span>LIFF 設定</span><strong>'+
     esc(cfg.loginConfigured?'已設定登入 Channel':'尚未設定登入 Channel')+'</strong></div>'+
   '<div class="bar-row"><span>平台訊息發送</span><strong>'+
     esc(cfg.messagingConfigured?'LINE token 已設定（送達仍須測試）':'尚未設定訊息 token')+'</strong></div>'+
   '<div class="flex"><button class="btn primary" data-line="bind" '+(!cfg.liffId?'disabled':'')+'>以 LINE 驗證並綁定</button>'+
     (info.linked?'<button class="btn" data-line="unbind">解除我的綁定</button>':'')+
     '<button class="btn" data-line="refresh">重新檢查</button></div>'+
   '<p class="muted">LINE 綁定僅供已登入且在職的企業員工。LIFF 必須將此網站網址加入官方 Channel 設定；未完成設定時無法直接登入。</p>';
 const controls=app.mode==='real'&&['owner','hr'].includes(role())?
   '<button class="btn" data-line="flush">發送待處理 LINE 通知（最多 5 筆）</button>':'';
 $('appContent').innerHTML=
  panel('我的 LINE 身分與 OA 狀態',linkInfo)+
  panel('LINE 通知中心',
  '<p class="muted">排班發布、異動、申請核准與打卡異常會產生站內通知。經驗證綁定的正式員工才可進入 LINE 發送佇列。</p>'+
  '<div class="notice">平台 OA 與店家自有 OA 的 Channel 權限各自獨立；目前接通的是平台 OA 模式，尚不代表店家自有 OA 已綁定。</div>'+
  controls+
  '<p class="muted">訊息發送 API 的回傳成功不代表使用者已讀；實際送達與額度依 LINE 平台記錄為準。</p>');
};
const previousLineTab=setTab;
setTab=function(tab){
 previousLineTab(tab);
 if(tab==='line')void refreshLineStatus();
};
async function loadLineSdk(){
 if(window.liff)return window.liff;
 const script=document.createElement('script');script.src='https://static.line-scdn.net/liff/edge/2/sdk.js';
 script.async=true;
 const promise=new Promise((resolve,reject)=>{
  script.onload=()=>resolve(window.liff);
  script.onerror=()=>reject(Error('無法載入 LINE LIFF SDK'));
 });
 document.head.appendChild(script);
 return await promise;
}
async function connectWorkforceLine(){
 if(app.mode!=='real'||!app.token)throw Error('請先登入企業帳號');
 const config=await lineEndpoint();
 if(!config.liffId)throw Error('平台尚未提供此人資入口的 LIFF ID');
 const liff=await loadLineSdk();
 if(!liff)throw Error('LINE SDK 初始化失敗');
 await liff.init({liffId:config.liffId});
 if(!liff.isLoggedIn()){
  liff.login({redirectUri:location.href});
  return;
 }
 const idToken=liff.getIDToken();
 if(!idToken)throw Error('LINE 尚未授權 openid 身分，請重新授權');
 const result=await lineEndpoint({action:'bind',tenant_id:app.tenantId,id_token:idToken});
 if(result.linked){banner('LINE 身分驗證與員工綁定完成');await refreshLineStatus();}
}
document.addEventListener('click',async e=>{
 if(!e.target.closest('#appContent, #pageActions'))return;
 const b=e.target.closest('[data-line]');if(!b)return;
 if(b.disabled)return;
 b.disabled=true;
 try{
  if(b.dataset.line==='bind')await connectWorkforceLine();
  else if(b.dataset.line==='refresh')await refreshLineStatus();
  else if(b.dataset.line==='unbind'){
   if(confirm('確定解除 LINE 通知綁定？')){
    await lineEndpoint({action:'unbind',tenant_id:app.tenantId});
    banner('已解除 LINE 綁定');await refreshLineStatus();
   }
  }
  else if(b.dataset.line==='flush'){
   if(!['owner','hr'].includes(role()))throw Error('只有企業負責人與人資可發送');
   const result=await lineEndpoint({action:'flush',tenant_id:app.tenantId,limit:5});
   banner('已處理 '+result.processed+' 筆通知；LINE 接口接受 '+result.sent+' 筆，失敗 '+result.failed+' 筆');
   await refreshLineStatus();
  }
 }catch(error){banner(error.message,true);}
 finally{b.disabled=false;}
});



/* HR-SCH-05: company-specific scheduling bounds rather than one-size-fits-all law assumptions. */
extraNames.add('schedule_rules');
const beforeScheduleRules=schedule;
schedule=function(){
 beforeScheduleRules();
 const r=app.data?.scheduleRules||{};
 const canSet=app.mode==='demo'||['owner','hr'].includes(role());
 $('appContent').insertAdjacentHTML('beforeend',
  panel('企業排班休息與工時規則',
   '<div class="bar-row"><span>生效日期</span><strong>'+esc(r.effective_from||'尚未設定')+'</strong></div>'+
   '<div class="bar-row"><span>班間最低休息</span><strong>'+esc(r.min_rest_minutes||0)+' 分鐘</strong></div>'+
   '<div class="bar-row"><span>單班排定時間上限</span><strong>'+esc(r.max_shift_minutes||0)+' 分鐘</strong></div>'+
   '<div class="bar-row"><span>每週排定時間上限</span><strong>'+esc(r.max_week_minutes||0)+' 分鐘</strong></div>'+
   '<div class="notice">規則由企業自行設定，0 代表未啟用該項限制；不能取代適用勞動法規、加班審認或薪資計算。新增、改期、發布班別時，由資料庫拒絕不符合設定的排班。</div>',
   canSet?'<button class="btn small" data-extra="showScheduleRules">設定企業排班規則</button>':''));
};
function showScheduleRulesForm(){
 if(!(app.mode==='demo'||['owner','hr'].includes(role())))throw Error('只有企業負責人或人資可以修改');
 const r=app.data?.scheduleRules||{},demo=app.mode==='demo';
 const rest=demo?'min="0" max="660"':'min="0" max="1440"';
 const maxShift=demo?selectField('max_shift_minutes',
  [0,480,540,600,660,720,780,840].map(x=>'<option value="'+x+'" '+(Number(r.max_shift_minutes||0)===x?'selected':'')+'>'+x+' 分鐘</option>').join('')):
  input('max_shift_minutes','number',r.max_shift_minutes??0,'min="0" max="1440" step="30"');
 const maxWeek=demo?selectField('max_week_minutes',
  [0,2400,2880,3360].map(x=>'<option value="'+x+'" '+(Number(r.max_week_minutes||0)===x?'selected':'')+'>'+x+' 分鐘</option>').join('')):
  input('max_week_minutes','number',r.max_week_minutes??0,'min="0" max="10080" step="60"');
 showExtraForm('企業排班規則','schedule_rules',[
  {name:'effective_from',label:'規則生效日',html:input('effective_from','date',r.effective_from||today())},
  {name:'min_rest_minutes',label:'班間最低休息分鐘（0 不限制）',
   html:input('min_rest_minutes','number',r.min_rest_minutes??0,rest)},
  {name:'max_shift_minutes',label:'單班最大排定分鐘',html:maxShift},
  {name:'max_week_minutes',label:'每週最大排定分鐘',html:maxWeek}
 ],'儲存排班規則');
}
document.addEventListener('click',e=>{
 if(!e.target.closest('#appContent, #pageActions'))return;
 const b=e.target.closest('[data-extra="showScheduleRules"]');if(!b)return;
 try{showScheduleRulesForm();}catch(error){banner(error.message,true);}
});



/* HR-ORG-03: explicitly authorized cross-store support period. */
extraNames.add('assign_branch');
const beforeCrossShopEmployees=employees;
employees=function(){
 beforeCrossShopEmployees();
 const canAssign=manager(),rows=(app.data?.memberBranches||[]).slice(0,100).map(a=>tr([
  personLabel(a.member_id),esc(branch(a.branch_id)?.name||'—'),
  esc(a.active_from),esc(a.active_until||'無設定期限')]));
 $('appContent').insertAdjacentHTML('beforeend',
  panel('員工跨店支援授權',
   '<div class="notice">只有已經被主管指派支援該門市的在職員工，才能建立跨店班次。職務與排班日期仍須符合企業規則。</div>'+
   table(['員工','獲授權支援的門市','生效日','結束日'],rows),
   canAssign?'<button class="btn small" data-extra="showBranchSupport">新增跨店支援</button>':''));
};
function showBranchSupportForm(){
 if(!manager())throw Error('需要主管權限');
 showExtraForm('指派跨店支援','assign_branch',[
  {name:'member_id',label:'支援員工',html:memberFilter(getSelected())},
  {name:'branch_id',label:'支援門市',html:branchFilter()},
  {name:'active_from',label:'開始日期',html:input('active_from','date',today())},
  {name:'active_until',label:'結束日期（可不填）',
   html:'<input id="active_until" name="active_until" type="date">'}
 ],'儲存跨店授權');
}
document.addEventListener('click',e=>{
 if(!e.target.closest('#appContent, #pageActions'))return;
 const b=e.target.closest('[data-extra="showBranchSupport"]');if(!b)return;
 try{showBranchSupportForm();}catch(error){banner(error.message,true);}
});



/* HR-ATT-04: short-lived authenticated QR issue and scan (no unverified demo punch). */
TABS.qr=['動態 QR 打卡','門市顯示 90 秒動態 QR，已登入員工掃碼打卡。'];
document.querySelector('#nav').insertAdjacentHTML('beforeend',
 '<button type="button" data-tab="qr"><span>▦</span> 動態 QR</button>');
extraNames.add('qr_setting');
app.qrToken=new URLSearchParams(location.search).get('wqr')||'';
if(!/^[0-9a-f]{48}$/i.test(app.qrToken))app.qrToken='';
app.issuedQr=null;
if(app.qrToken)app.tab='qr';
function qrUrl(token){return new URL('./?wqr='+encodeURIComponent(token),location.href).href;}
async function drawWorkforceQr(url){
 const root=$('wmQrGraphic');if(!root)return;
 root.textContent='';
 try{
  if(!window.QRCode){
   await new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='./vendor/qrcode.min.js';script.async=true;
    script.onload=resolve;script.onerror=()=>reject(Error('QR 繪製元件無法載入'));
    document.head.appendChild(script);
   });
  }
  new window.QRCode(root,{text:url,width:240,height:240,
   correctLevel:window.QRCode.CorrectLevel.M});
 }catch(err){root.textContent='QR 圖碼無法顯示，請使用下方連結。';banner(err.message,true);}
}
function qrPage(){
 heading();
 if(app.mode!=='real'||!app.token){
  $('appContent').innerHTML=panel('企業員工身分確認',
   '<div class="notice">請先切換正式企業並登入，才可以使用動態 QR 打卡。公開 Demo 不接受真實 QR 身分打卡。</div>');
  return;
 }
 const conf=app.data?.qrSettings||[];
 const branches=app.data?.branches||[];
 let html=panel('員工掃描後打卡',
  '<p class="muted">相機掃描 QR 後會帶入短效憑證；資料庫以已登入員工身分和伺服器時間驗證。</p>'+
  '<div class="field"><label for="wmQrToken">QR 代碼（掃描後自動帶入）</label>'+
  '<input id="wmQrToken" maxlength="48" value="'+esc(app.qrToken)+'" placeholder="輸入 48 碼短效代碼"></div>'+
  '<div class="flex">'+['IN','OUT','BREAK_START','BREAK_END'].map(k=>
   '<button class="btn" data-qr-action="clock" data-kind="'+k+'">'+esc(kind(k))+'</button>').join('')+'</div>'+
  '<div class="notice">QR 是短效場域憑證，不等於 GPS 定位。企業如強制 GPS，必須另行明確允許 QR 替代後，才可不提供定位打卡。</div>');
 if(manager()){
  let active='';
  if(app.issuedQr){
   const expires=Date.parse(app.issuedQr.expires_at);
   active='<div class="inset"><div id="wmQrGraphic"></div>'+
    '<p>QR 有效至：'+esc(taiStamp(app.issuedQr.expires_at))+'</p>'+
    '<p class="muted">'+(expires>Date.now()?'短效憑證可供掃描':'已逾時，請重新產生')+'</p>'+
    '<p><a href="'+esc(qrUrl(app.issuedQr.token))+'" target="_blank" rel="noopener">測試 QR 連結</a></p></div>';
  }
  html=panel('主管產生門市 QR',
   '<div class="field"><label>門市</label><select id="wmQrBranch">'+options(branches,x=>x.name)+'</select></div>'+
   '<button class="btn primary" data-qr-action="issue">產生 90 秒 QR</button>'+active)+html;
 }
 const rows=branches.map(b=>{
  const c=conf.find(x=>x.branch_id===b.id)||{};
  return tr([esc(b.name),c.enabled?'已啟用':'未啟用',
   c.allow_gps_replacement?'可替代 GPS':'仍依 GPS 規則']);
 });
 html+=panel('門市 QR 安全設定',
  table(['分店','QR 打卡','定位要求'],rows),
  ['owner','hr'].includes(role())?'<button class="btn" data-qr-action="settings">修改 QR 規則</button>':'');
 $('appContent').innerHTML=html;
 if(app.issuedQr)void drawWorkforceQr(qrUrl(app.issuedQr.token));
}
const oldQrRender=render;
render=function(){
 oldQrRender();
 if(app.tab==='qr'&&app.data)qrPage();
};
function showQrSettingsForm(){
 if(app.mode!=='real'||!['owner','hr'].includes(role()))throw Error('需要企業負責人或人資權限');
 showExtraForm('門市 QR 打卡設定','qr_setting',[
  {name:'branch_id',label:'門市',html:branchFilter()},
  {name:'enabled',label:'是否啟用',html:selectField('enabled',
   '<option value="true">啟用</option><option value="false">停用</option>')},
  {name:'allow_gps_replacement',label:'是否允許 QR 取代 GPS',html:selectField('allow_gps_replacement',
   '<option value="false">不允許，仍須 GPS</option><option value="true">允許短效 QR 替代定位</option>')}
 ],'儲存 QR 設定');
}
async function issueWorkforceQr(){
 if(!manager()||app.mode!=='real')throw Error('需登入主管帳號');
 const branch=$('wmQrBranch')?.value;if(!branch)throw Error('請選擇門市');
 app.issuedQr=await call('/rest/v1/rpc/wm_issue_qr','POST',
  {p_tenant:app.tenantId,p_branch:branch},app.token);
 qrPage();
 banner('90 秒 QR 已產生，超過有效期限必須刷新');
}
async function clockWorkforceQr(kindValue){
 if(app.mode!=='real'||!app.token)throw Error('請先登入正式企業');
 const token=($('wmQrToken')?.value||app.qrToken||'').trim();
 if(!/^[0-9a-f]{48}$/i.test(token))throw Error('沒有有效的 48 碼 QR 憑證');
 const result=await call('/rest/v1/rpc/wm_clock_qr','POST',
  {p_token:token,p_kind:kindValue,p_key:crypto.randomUUID()},app.token);
 app.qrToken='';
 const u=new URL(location.href);
 if(u.searchParams.has('wqr')){
  u.searchParams.delete('wqr');
  history.replaceState(null,'',u.pathname+u.search+u.hash);
 }
 await reload(true);
 banner('已完成 '+kind(kindValue)+'：'+taiStamp(result.server_at));
}
document.addEventListener('click',async e=>{
 if(!e.target.closest('#appContent, #pageActions'))return;
 const b=e.target.closest('[data-qr-action]');if(!b||b.disabled)return;
 b.disabled=true;
 try{
  if(b.dataset.qrAction==='settings')showQrSettingsForm();
  else if(b.dataset.qrAction==='issue')await issueWorkforceQr();
  else if(b.dataset.qrAction==='clock')await clockWorkforceQr(b.dataset.kind);
 }catch(err){banner(err.message,true);}
 finally{b.disabled=false;}
});



/* HR-RPT-02/03/05: privacy-preserving date/employee/department filtering and personal CSV. */
app.attendanceDetail=null;
function reportCell(v){
 const x=String(v??'');return '"'+(/^\s*[=+\-@]/.test(x)?"'"+x:x).replaceAll('"','""')+'"';
}
function reportDownload(){
 if(!app.attendanceDetail)throw Error('請先查詢明細');
 const data=app.attendanceDetail;
 const rows=[['員工編號','員工姓名','班次開始日','上班時間','下班時間','實際工作分鐘','資料狀態'],
 ...data.rows.map(r=>[r.code,r.name,r.day,r.inAt,r.outAt||'',r.workMinutes,r.incomplete?'未完成':'完整'])];
 const blob=new Blob(['\uFEFF'+rows.map(r=>r.map(reportCell).join(',')).join('\r\n')],
 {type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='workforce-attendance-'+data.from+'-'+data.to+'.csv';
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function attendanceRows(events,from,to){
 const rows=[];
 const byMember=new Map();
 for(const p of events){
  if(!byMember.has(p.member_id))byMember.set(p.member_id,[]);
  byMember.get(p.member_id).push(p);
 }
 for(const [memberId,items] of byMember){
  const member=person(memberId);if(!member)continue;
  items.sort((a,b)=>a.punched_at.localeCompare(b.punched_at));
  let started=null,segment=null,minutes=0;
  const finish=(last,incomplete)=>{
   if(!started)return;
   if(!incomplete&&segment&&last){
    minutes+=Math.max(0,(Date.parse(last)-Date.parse(segment))/60000);
   }
   const day=taiDay(started);
   if(day>=from&&day<=to)rows.push({
    member_id:memberId,code:member.employee_code,name:member.display_name,
    branch_id:member.branch_id,department_id:member.department_id,
    day,inAt:taiStamp(started),outAt:last?taiStamp(last):'',
    workMinutes:Math.round(minutes),incomplete
   });
   started=null;segment=null;minutes=0;
  };
  for(const p of items){
   if(p.kind==='IN'){
    if(started)finish(null,true);
    started=p.punched_at;segment=p.punched_at;minutes=0;
   }else if(p.kind==='BREAK_START'&&started&&segment){
    minutes+=Math.max(0,(Date.parse(p.punched_at)-Date.parse(segment))/60000);
    segment=null;
   }else if(p.kind==='BREAK_END'&&started&&!segment){
    segment=p.punched_at;
   }else if(p.kind==='OUT'&&started){
    finish(p.punched_at,false);
   }
  }
  if(started)finish(null,true);
 }
 return rows.sort((a,b)=>a.day.localeCompare(b.day)||a.code.localeCompare(b.code));
}
async function runAttendanceDetail(){
 const from=$('detailFrom')?.value,to=$('detailTo')?.value;
 if(!from||!to||to<from||dayAdd(from,31)<to)throw Error('查詢日期必須在連續 31 日內');
 const branchId=$('detailBranch')?.value||'',departmentId=$('detailDepartment')?.value||'',
  memberId=$('detailMember')?.value||'';
 let events=[];
 if(app.mode==='demo'){
  events=[...(app.data?.punches||[])];
 }else{
  const begin=new Date(dayAdd(from,-1)+'T00:00:00+08:00').toISOString();
  const end=new Date(dayAdd(to,2)+'T00:00:00+08:00').toISOString();
  for(let offset=0;offset<5000;offset+=1000){
   const params='select=member_id,kind,punched_at,id,source&tenant_id=eq.'+encodeURIComponent(app.tenantId)+
    '&punched_at=gte.'+encodeURIComponent(begin)+'&punched_at=lt.'+encodeURIComponent(end)+
    '&order=punched_at.asc&limit=1000&offset='+offset;
   const chunk=await query('wm_punches',params);
   events.push(...chunk);
   if(chunk.length<1000)break;
  }
  if(events.length>=5000)throw Error('本期間記錄超過 5,000 筆，請縮短日期區間');
 }
 const permitted=new Set((app.data?.members||[]).filter(m=>
  (!branchId||m.branch_id===branchId)&&(!departmentId||m.department_id===departmentId)&&
  (!memberId||m.id===memberId)&&
  (app.mode==='demo'||manager()||m.user_id===app.user?.id)).map(x=>x.id));
 events=events.filter(x=>permitted.has(x.member_id));
 app.attendanceDetail={from,to,branchId,departmentId,memberId,rows:attendanceRows(events,from,to),eventCount:events.length};
 render();
}
const beforeAttendanceReport=reports;
reports=function(){
 beforeAttendanceReport();
 const me=app.mode==='demo'||manager()?app.data.members||[]:
  (app.data.members||[]).filter(m=>m.user_id===app.user?.id);
 const d=app.attendanceDetail,rows=d?.rows||[];
 const dates='<div class="toolbar">'+
  '<div class="field"><label>起日</label><input type="date" id="detailFrom" value="'+esc(d?.from||dayAdd(today(),-7))+'"></div>'+
  '<div class="field"><label>迄日</label><input type="date" id="detailTo" value="'+esc(d?.to||today())+'"></div>'+
  '<div class="field"><label>分店</label><select id="detailBranch"><option value="" '+(!d?.branchId?'selected':'')+'>全部</option>'+
  options(app.data.branches||[],x=>x.name,d?.branchId)+'</select></div>'+
  '<div class="field"><label>部門</label><select id="detailDepartment"><option value="" '+(!d?.departmentId?'selected':'')+'>全部</option>'+
  options(app.data.departments||[],x=>x.name,d?.departmentId)+'</select></div>'+
  '<div class="field"><label>員工</label><select id="detailMember"><option value="" '+(!d?.memberId?'selected':'')+'>全部</option>'+
  options(me,x=>x.display_name,d?.memberId)+'</select></div></div>'+
  '<div class="flex"><button class="btn primary" data-extra="runAttendanceDetail">查詢出勤明細</button>'+
  '<button class="btn" data-extra="exportAttendanceDetail" '+(!d?'disabled':'')+'>下載明細 CSV</button></div>';
 const tableRows=rows.map(r=>tr([
  esc(r.code),esc(r.name),esc(r.day),esc(r.inAt),esc(r.outAt||'—'),
  esc(r.workMinutes)+' 分鐘',r.incomplete?'<span class="chip pending">未完成</span>':'已配對']));
 $('appContent').insertAdjacentHTML('beforeend',
  panel('可篩選的出勤原始明細',dates+
  (d?'<p class="muted">範圍內打卡事件 '+d.eventCount+' 筆，配對 '+rows.length+' 筆。休息時段從工作分鐘扣除；不代表正式法定薪資工時。</p>':'')+
  table(['員工編號','員工','上班日期','上班打卡','下班打卡','工作分鐘','狀態'],tableRows)+
  '<p class="muted">跨日班依實際上班打卡日期歸類；跨店打卡的分店須另與班表核對。正式員工僅可下載 RLS 授權的本人資料。</p>'));
};
document.addEventListener('click',async e=>{
 if(!e.target.closest('#appContent, #pageActions'))return;
 const b=e.target.closest('[data-extra]');if(!b||b.disabled)return;
 try{
  if(b.dataset.extra==='runAttendanceDetail'){b.disabled=true;await runAttendanceDetail();}
  else if(b.dataset.extra==='exportAttendanceDetail')reportDownload();
 }catch(error){banner(error.message,true);}
 finally{b.disabled=false;}
});


/* Keep original PRD tabs intact, but group them before the sidebar becomes scrollable. */
(function organizeWorkforceMenu(){
 const nav=document.getElementById('nav');if(!nav)return;
 const original=[...nav.querySelectorAll('button[data-tab]')];
 const buttons=new Map(original.map(el=>[el.dataset.tab,el]));
 const groups=[
  ['工作空間',['overview','schedule','punch','qr']],
  ['人員與假勤',['requests','approvals','employees','inbox']],
  ['報表與營運',['reports','periods','anomalies','line','settings']]
 ];
 for(const [caption,tabs] of groups){
  const section=document.createElement('div');section.className='nav-section';
  section.textContent=caption;section.setAttribute('aria-hidden','true');
  nav.appendChild(section);
  for(const tab of tabs){const button=buttons.get(tab);if(button)nav.appendChild(button);}
 }
 // A future PRD tab stays visible even before its group is assigned.
 for(const button of original){if(!groups.some(group=>group[1].includes(button.dataset.tab)))nav.appendChild(button);}
 const active=nav.querySelector('button.active');
 if(active)active.setAttribute('aria-current','page');
})();


/* Workforce SaaS multi-company organization console (2026-11-06).
   The page only presents rows made visible by server-side RLS. All edits and
   invitations are authorized in authenticated PostgreSQL RPCs. */
TABS.org=['組織與權限','設定部門、主管隸屬與員工帳號，審核只限授權的管理範圍。'];
(function installWorkforceOrgTab(){
 const nav=$('nav'), anchor=nav?.querySelector('[data-tab="employees"]');
 if(anchor&&!nav.querySelector('[data-tab="org"]')){
  anchor.insertAdjacentHTML('afterend','<button type="button" data-tab="org"><span>♧</span> 組織與權限</button>');
 }
 const label=document.createElement('span');
 label.className='top-identity';label.id='wfIdentity';label.setAttribute('aria-label','目前登入身分');
 const signIn=$('authBtn');signIn?.parentElement?.insertBefore(label,signIn);
})();
const WF_ROLES={owner:'企業總管理者',hr:'人資管理者',manager:'部門／團隊主管',employee:'一般員工'};
const wfAdmin=()=>app.mode==='real'&&['owner','hr'].includes(role());
const wfManagerOptions=(selected='',exclude='')=>'<option value="">不指定上級主管</option>'+
 (app.data?.members||[]).filter(m=>m.id!==exclude&&m.status==='active'&&['owner','hr','manager'].includes(m.role))
 .map(m=>'<option value="'+esc(m.id)+'" '+(selected===m.id?'selected':'')+'>'+
 esc(m.display_name+' · '+(m.job_title||WF_ROLES[m.role]))+'</option>').join('');
const wfDeptOptions=(selected='')=>'<option value="">不指定部門</option>'+
 (app.data?.departments||[]).map(x=>'<option value="'+esc(x.id)+'" '+(selected===x.id?'selected':'')+'>'+esc(x.name)+'</option>').join('');
const wfRoleOptions=(selected='employee')=>
 ['employee','manager','hr'].filter(r=>r!=='hr'||role()==='owner').map(r=>
 '<option value="'+r+'" '+(selected===r?'selected':'')+'>'+esc(WF_ROLES[r])+'</option>').join('');
function wfMyMember(){return(app.data?.members||[]).find(m=>m.user_id===app.user?.id);}
function wfIsReport(memberId){
 const own=wfMyMember();if(!own||!memberId||memberId===own.id)return false;
 const seen=new Set();
 let member=(app.data?.members||[]).find(m=>m.id===memberId);
 while(member&&!seen.has(member.id)){
  seen.add(member.id);
  if(member.reports_to===own.id)return true;
  member=(app.data?.members||[]).find(m=>m.id===member.reports_to);
 }
 return false;
}
function wfCanReview(memberId){
 const x=(app.data?.members||[]).find(m=>m.id===memberId);
 if(!x||x.user_id===app.user?.id)return false;
 if(['owner','hr'].includes(role()))return true;
 return role()==='manager'&&wfIsReport(memberId);
}
function wfCard(member,depth=0){
 const subtitle=member.job_title||WF_ROLES[member.role]||'一般員工';
 const department=(app.data.departments||[]).find(x=>x.id===member.department_id);
 const label=member.role==='owner'?'企業管理':
  member.role==='hr'?'人資':
  member.role==='manager'?'主管':'員工';
 const dot=member.role==='owner'?'owner':member.role==='hr'?'hr':member.role==='manager'?'manager':'employee';
 const editor=wfAdmin()&&member.role!=='owner'?
  '<button class="org-edit" type="button" data-org="edit" data-id="'+esc(member.id)+'">設定層級</button>':'';
 return '<div class="org-person '+dot+'" style="--level:'+depth+'">'+
  '<span class="org-avatar">'+esc(member.display_name.slice(0,1))+'</span>'+
  '<div class="org-person-info"><strong>'+esc(member.display_name)+'</strong>'+
  '<small>'+esc(subtitle)+(department?' · '+esc(department.name):'')+'</small></div>'+
  '<span class="org-role '+dot+'">'+label+'</span>'+editor+'</div>';
}
function wfTree(){
 const members=app.data?.members||[];
 if(!members.length)return '<div class="org-empty">目前還沒有已加入的員工。請邀請第一位同事。</div>';
 const ids=new Set(members.map(m=>m.id)),used=new Set();
 const descend=(parent,depth)=>{
  if(depth>16)return '';
  const children=members.filter(m=>m.reports_to===parent).sort((a,b)=>a.role.localeCompare(b.role)||a.display_name.localeCompare(b.display_name));
  return children.map(child=>{
   if(used.has(child.id))return '';
   used.add(child.id);
   return '<div class="org-node">'+wfCard(child,depth)+
   '<div class="org-children">'+descend(child.id,depth+1)+'</div></div>';
  }).join('');
 };
 const roots=members.filter(m=>!m.reports_to||!ids.has(m.reports_to));
 let tree=roots.map(m=>{
  if(used.has(m.id))return '';
  used.add(m.id);
  return '<div class="org-node">'+wfCard(m,0)+'<div class="org-children">'+descend(m.id,1)+'</div></div>';
 }).join('');
 for(const member of members){
  if(used.has(member.id))continue;
  used.add(member.id);tree+='<div class="org-node">'+wfCard(member,0)+'</div>';
 }
 return tree;
}
function wfOrgView(){
 heading(wfAdmin()?'<button type="button" class="btn" data-org="department">新增部門</button> <button type="button" class="btn primary" data-org="invite">＋ 邀請員工</button>':'');
 const members=app.data?.members||[],active=members.filter(m=>m.status==='active');
 const title=app.data?.tenant?.name||'我的企業';
 const orgSummary='<div class="org-hero"><div><div class="org-kicker">ORGANIZATION WORKSPACE</div>'+
 '<h2>'+esc(title)+'</h2><p>一家公司一套成員名冊。主管只能審核自己管理的團隊，下屬可跨多個層級。</p></div>'+
 '<div class="org-owner-badge">'+esc(WF_ROLES[role()]||'員工')+'</div></div>';
 const stats='<div class="org-metrics">'+
 [['可見成員',active.length],['主管／組長',active.filter(m=>m.role==='manager').length],
  ['部門數',(app.data?.departments||[]).length],['待審申請',(app.data?.requests||[]).filter(r=>r.status==='pending'&&wfCanReview(r.member_id)).length]
 ].map(([name,val])=>'<div class="org-metric"><span>'+esc(name)+'</span><strong>'+val+'</strong></div>').join('')+'</div>';
 const rows=members.map(m=>{
 const supervisor=members.find(x=>x.id===m.reports_to),dept=app.data.departments?.find(x=>x.id===m.department_id);
 const c=wfAdmin()&&m.role!=='owner'?'<button type="button" class="btn small" data-org="edit" data-id="'+esc(m.id)+'">設定</button>':'—';
 return tr([esc(m.display_name),esc(m.job_title||WF_ROLES[m.role]),esc(dept?.name||'未分組'),
  esc(supervisor?.display_name||'—'),status(m.status),c]);
 });
 const legend='<div class="org-guide"><div class="org-guide-title">權限如何運作</div>'+
 '<div><b>企業總管理者</b><span>建立公司、跨部門管理、設定所有人員角色</span></div>'+
 '<div><b>人資管理者</b><span>人員邀請、層級管理、公司範圍內審核</span></div>'+
 '<div><b>主管／組長</b><span>只查看、排班與審核自己所管的下屬；組長可再管理員工</span></div>'+
 '<div><b>一般員工</b><span>本人班表、打卡、請假、加班、補卡與申請進度</span></div>'+
 '<p>角色及上下級關係保存在 Supabase；單純修改網頁無法取得權限。</p></div>';
 $('appContent').innerHTML=orgSummary+stats+'<div class="org-columns">'+
 '<section class="org-surface"><div class="org-section-head"><div><h2>組織架構</h2><p>由上往下設定主管與直屬成員</p></div></div>'+
 '<div class="org-tree">'+wfTree()+'</div></section>'+
 '<section class="org-surface">'+legend+'</section></div>'+
 '<section class="org-surface"><div class="org-section-head"><div><h2>員工名冊與管理鏈</h2><p>各企業資料完全獨立，只有授權者能調整角色與上級。</p></div>'+
 (wfAdmin()?'<button class="btn primary" data-org="invite">邀請新員工</button>':'')+'</div>'+
 table(['員工','職稱／角色','所屬部門','直屬主管','狀態','管理'],rows)+'</section>';
}
function wfInviteModal(){
 if(!wfAdmin())throw Error('只有企業管理者可以邀請員工');
 openModal('邀請員工加入企業',modalForm('wf_org_invite',[
 {name:'p_email',label:'員工登入 Email',wide:true,html:'<input name="p_email" id="p_email" type="email" required placeholder="staff@company.com" autocomplete="off">'},
 {name:'p_name',label:'姓名',html:input('p_name','text','','maxlength="60"')},
 {name:'p_role',label:'帳號角色',html:selectField('p_role',wfRoleOptions())},
 {name:'p_job_title',label:'職稱',html:'<input name="p_job_title" id="p_job_title" maxlength="80" placeholder="例如：門市專員">'},
 {name:'p_reports_to',label:'直屬主管',html:'<select name="p_reports_to" id="p_reports_to">'+wfManagerOptions()+'</select>'},
 {name:'p_branch',label:'分店',html:selectField('p_branch',options(app.data.branches||[],x=>x.name))},
 {name:'p_department',label:'部門',html:'<select name="p_department" id="p_department">'+wfDeptOptions()+'</select>'}
 ],'產生專屬邀請連結')+'<p class="org-form-tip">邀請連結僅能由指定 Email 完成驗證與綁定，7 天後失效，且只能使用一次。平台不會自動替員工設定密碼。</p>');
}
function wfEditModal(id){
 if(!wfAdmin())throw Error('只有企業管理者可以編輯組織');
 const m=(app.data?.members||[]).find(x=>x.id===id);
 if(!m||m.role==='owner')throw Error('不可編輯企業擁有者角色');
 openModal('設定人員層級 · '+m.display_name,modalForm('wf_org_edit',[
 {name:'p_member',label:'員工身分',wide:true,html:'<input name="p_member" value="'+esc(m.id)+'" type="hidden"><div class="org-edit-subject">'+esc(m.display_name)+'</div>'},
 {name:'p_role',label:'角色權限',html:selectField('p_role',wfRoleOptions(m.role))},
 {name:'p_job_title',label:'職稱',html:'<input id="p_job_title" name="p_job_title" maxlength="80" value="'+esc(m.job_title||'')+'">'},
 {name:'p_reports_to',label:'直屬主管',html:'<select id="p_reports_to" name="p_reports_to">'+wfManagerOptions(m.reports_to||'',m.id)+'</select>'},
 {name:'p_department',label:'所屬部門',html:'<select id="p_department" name="p_department">'+wfDeptOptions(m.department_id||'')+'</select>'}
 ],'儲存組織設定')+
 '<p class="org-form-tip">主管權限會隨上下級設定即時生效。不能設定跨企業上級，也不能形成循環管理鏈。</p>');
}
function wfDepartmentModal(){
 if(!wfAdmin())throw Error('只有企業管理者可以新增部門');
 openModal('新增部門',modalForm('wf_org_department',[
 {name:'name',label:'部門名稱',wide:true,html:input('name','text','','maxlength="60"')},
 {name:'branch_id',label:'所屬分店',wide:true,html:branchFilter()}
 ],'建立部門'));
}
function wfInvitationResult(result){
 const link=location.origin+location.pathname+'?invite='+encodeURIComponent(result.token);
 openModal('邀請已建立','<div class="org-invite-result"><div class="org-result-mark">✓</div><h3>已建立專屬員工邀請</h3>'+
 '<p>將下方連結傳給 <b>'+esc(result.email)+'</b>。員工註冊或登入、完成 Email 驗證後，就能加入這家公司。</p>'+
 '<label for="orgInviteLink">專屬邀請網址</label><input id="orgInviteLink" readonly value="'+esc(link)+'">'+
 '<div class="org-form-tip">此連結含單次使用的驗證憑證，請只傳送給指定員工。過期需重新產生邀請。</div>'+
 '<div class="modal-actions"><button class="btn" data-action="closeModal">關閉</button>'+
 '<button class="btn primary" type="button" data-org="copyInvite">複製邀請連結</button></div></div>');
}
document.addEventListener('click',async event=>{
 const b=event.target.closest('[data-org]');if(!b)return;
 event.preventDefault();event.stopPropagation();
 try{
  if(b.dataset.org==='invite')wfInviteModal();
  else if(b.dataset.org==='edit')wfEditModal(b.dataset.id);
  else if(b.dataset.org==='department')wfDepartmentModal();
  else if(b.dataset.org==='copyInvite'){
   const field=$('orgInviteLink');if(!field)return;
   if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(field.value);
   else{field.select();document.execCommand('copy');}
   banner('專屬邀請連結已複製');
  }
  else if(b.dataset.org==='orgTab')setTab('org');
 }catch(error){banner(error.message,true);}
},true);
$('overlay').addEventListener('submit',async event=>{
 const form=event.target;
 if(!form?.dataset?.form?.startsWith('wf_org_'))return;
 event.preventDefault();event.stopImmediatePropagation();
 if(!wfAdmin()){banner('沒有權限設定組織',true);return;}
 const submit=form.querySelector('[type="submit"]');if(submit)submit.disabled=true;
 const f=Object.fromEntries(new FormData(form).entries());
 try{
  if(form.dataset.form==='wf_org_invite'){
   const payload={p_tenant:app.tenantId,p_email:f.p_email,p_name:f.p_name,
    p_role:f.p_role,p_reports_to:f.p_reports_to||null,p_job_title:f.p_job_title||'',
    p_branch:f.p_branch,p_department:f.p_department||null};
   const result=await call('/rest/v1/rpc/wm_org_invite','POST',payload,app.token);
   await reload(true);wfInvitationResult(result);
  }else if(form.dataset.form==='wf_org_edit'){
   await call('/rest/v1/rpc/wm_org_set_member','POST',{
    p_member:f.p_member,p_role:f.p_role,p_reports_to:f.p_reports_to||null,
    p_job_title:f.p_job_title||'',p_department:f.p_department||null},app.token);
   closeModal();await reload(true);banner('組織層級與權限已更新');
  }else if(form.dataset.form==='wf_org_department'){
   await call('/rest/v1/wm_departments','POST',{
    name:f.name,tenant_id:app.tenantId,branch_id:f.branch_id},app.token);
   closeModal();await reload(true);banner('部門已建立');
  }
 }catch(error){banner(error.message||'操作失敗',true);if(submit)submit.disabled=false;}
},true);

const wfPreviousRender=render;
render=function(){
 wfPreviousRender();
 const identity=$('wfIdentity');
 if(identity){
  const me=wfMyMember();
  identity.textContent=app.mode==='demo'?'公開體驗':app.token?
   (me?.display_name||app.user?.email||'已登入')+' · '+(WF_ROLES[role()]||'員工'):'尚未登入';
  identity.title=app.data?.tenant?.name||'';
 }
 if(app.data&&app.tab==='org')wfOrgView();
 if(app.data&&app.tab==='approvals'&&app.mode==='real'){
  for(const btn of $('appContent').querySelectorAll('[data-action="approve"],[data-action="reject"]')){
   const request=(app.data.requests||[]).find(r=>r.id===btn.dataset.id);
   if(request&&!wfCanReview(request.member_id))btn.remove();
  }
 }
 if(app.data&&app.tab==='employees'&&app.mode==='real'){
  for(const btn of $('pageActions').querySelectorAll('[data-action="newEmployee"]'))btn.remove();
  if(wfAdmin())$('pageActions').insertAdjacentHTML('beforeend','<button type="button" class="btn primary" data-org="orgTab">邀請員工／管理層級</button>');
 }
};
// On invited links, remove bearer token from the visible address before accepting.
(function initializeOrgInvite(){
 const url=new URL(location.href),token=url.searchParams.get('invite');
 if(!token)return;
 url.searchParams.delete('invite');
 history.replaceState(null,'',url.pathname+url.search+url.hash);
 sessionStorage.setItem('wm_org_pending_invite',token);
 if(app.token){
  call('/rest/v1/rpc/wm_org_accept_invite','POST',{p_token:token},app.token).then(v=>{
   sessionStorage.removeItem('wm_org_pending_invite');app.mode='real';app.tenantId=v.tenant_id;
   app.data=null;return reload(true);
  }).then(()=>{setTab('org');banner('已成功加入企業');})
   .catch(e=>banner(e.message,true));
 }else{
  app.mode='real';app.data=null;app.tab='overview';
  setTimeout(()=>{render();showAuth();},120);
 }
})();


/* Workforce account recovery (email reset).
   Supabase Auth owns email verification and password update; the public client
   never stores a recovery access token in persistent browser storage. */
const wfOriginalShowAuth=showAuth;
showAuth=function(){
 wfOriginalShowAuth();
 const form=$('overlay')?.querySelector('form[data-form="auth"]');
 if(form&&!$('overlay').querySelector('[data-wf-account="forgot"]')){
  form.insertAdjacentHTML('afterend',
   '<div class="auth-note"><button type="button" class="linklike" data-wf-account="forgot">忘記密碼？使用電子郵件重設</button></div>');
 }
};
let wfRecoveryAccessToken=null;
function wfForgotPasswordModal(){
 const email=$('overlay')?.querySelector('form[data-form="auth"] input[name="email"]')?.value||'';
 openModal('忘記密碼', 
  '<p class="muted">輸入企業帳號的電子郵件。如果帳號存在，系統會寄出重設密碼連結。</p>'+
  '<form data-form="wf_forgot_password"><div class="field"><label for="wfRecoveryEmail">電子郵件</label>'+
  '<input id="wfRecoveryEmail" name="email" type="email" value="'+esc(email)+'" required autocomplete="email"></div>'+
  '<div class="modal-actions"><button type="button" class="btn" data-wf-account="back">返回登入</button>'+
  '<button class="btn primary" type="submit">寄送重設連結</button></div></form>');
}
function wfNewPasswordModal(){
 openModal('設定新密碼',
  '<p class="muted">已確認重設連結，請設定新的登入密碼。</p>'+
  '<form data-form="wf_set_password"><div class="form-grid">'+
  '<div class="field wide"><label for="wfNewPassword">新密碼</label><input id="wfNewPassword" name="password" type="password" required autocomplete="new-password"></div>'+
  '<div class="field wide"><label for="wfConfirmPassword">再次輸入新密碼</label><input id="wfConfirmPassword" name="confirm" type="password" required autocomplete="new-password"></div></div>'+
  '<div class="modal-actions"><button class="btn primary" type="submit">更新密碼</button></div></form>');
}
async function wfReceiveRecoveryLink(){
 const params=new URLSearchParams(location.hash.slice(1));
 if(params.get('type')!=='recovery')return;
 const token=params.get('access_token');
 // Remove the token from the address bar before making any network requests.
 history.replaceState(null,'',location.pathname+location.search);
 if(!token){banner('密碼重設連結沒有有效授權，請重新申請',true);return;}
 try{
  const r=await fetch(API+'/auth/v1/user',{headers:{apikey:KEY,Authorization:'Bearer '+token},cache:'no-store'});
  if(!r.ok)throw Error('重設連結已失效，請重新申請');
  wfRecoveryAccessToken=token;
  wfNewPasswordModal();
 }catch(err){wfRecoveryAccessToken=null;banner(err.message,true);}
}
document.addEventListener('click',e=>{
 const button=e.target.closest('[data-wf-account]');
 if(!button)return;
 e.preventDefault();
 if(button.dataset.wfAccount==='forgot')wfForgotPasswordModal();
 else if(button.dataset.wfAccount==='back')showAuth();
});
$('overlay').addEventListener('submit',async e=>{
 const form=e.target;
 if(!['wf_forgot_password','wf_set_password'].includes(form?.dataset?.form))return;
 e.preventDefault();
 e.stopImmediatePropagation();
 const submit=form.querySelector('button[type="submit"]');
 if(submit)submit.disabled=true;
 try{
  const values=Object.fromEntries(new FormData(form).entries());
  if(form.dataset.form==='wf_forgot_password'){
   const redirect=location.origin+location.pathname;
   // This redirect must be allowlisted in Supabase Auth URL Configuration.
   await call('/auth/v1/recover?redirect_to='+encodeURIComponent(redirect),'POST',{email:String(values.email||'').trim()});
   closeModal();
   banner('如帳號存在，重設密碼郵件將寄至指定信箱');
  }else{
   if(!wfRecoveryAccessToken)throw Error('重設授權已過期，請重新申請');
   if(values.password!==values.confirm)throw Error('兩次輸入的密碼不一致');
   const response=await fetch(API+'/auth/v1/user',{
    method:'PUT',headers:{apikey:KEY,Authorization:'Bearer '+wfRecoveryAccessToken,'Content-Type':'application/json'},
    body:JSON.stringify({password:values.password}),cache:'no-store'
   });
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(result.msg||result.message||result.error_description||'密碼更新失敗');
   wfRecoveryAccessToken=null;
   sessionStorage.removeItem('wm_auth');
   app.token=null;app.user=null;app.data=null;app.tenants=[];app.mode='demo';app.tenantId=DEMO_ID;
   closeModal();await reload(true);
   banner('密碼已更新，請使用新密碼重新登入');
  }
 }catch(err){banner(err.message||'操作失敗',true);if(submit)submit.disabled=false;}
},true);
void wfReceiveRecoveryLink();


/* HR-LVE-03/04 and HR-ORG-03:
   Reviewed cancellation of approved leave; employee offboarding and return.
   These are additional controls around the existing request/member models,
   never a second implementation of requests, approvals or attendance. */
const wfPriorLeaveCancelRequests=requests;
requests=function(){
 wfPriorLeaveCancelRequests();
 if(app.mode!=='real'||!app.token)return;
 const own=(app.data?.members||[]).find(m=>m.user_id===app.user?.id&&m.tenant_id===app.tenantId);
 if(!own)return;
 const cancels=(app.data.leaveCancellations||[]).filter(c=>c.member_id===own.id);
 const pendingIds=new Set(cancels.filter(c=>c.status==='pending').map(c=>c.request_id));
 const eligible=(app.data.requests||[]).filter(r=>
  r.kind==='leave'&&r.member_id===own.id&&r.status==='approved'&&
  Date.parse(r.ends_at)>Date.now()&&!pendingIds.has(r.id));
 const requestRows=eligible.map(r=>tr([
  esc(kind(r.leave_kind)),taiStamp(r.starts_at),taiStamp(r.ends_at),
  '<button type="button" class="btn small" data-wf-lifecycle="requestCancel" data-id="'+esc(r.id)+'">申請取消</button>'
 ]));
 const history=cancels.map(c=>tr([
  esc(kind(c.leave_kind)),taiStamp(c.starts_at),
  c.status==='pending'?'<span class="chip pending">待審核</span>':
   c.status==='approved'?'<span class="chip approved">已同意取消</span>':'<span class="chip rejected">取消遭駁回</span>',
  esc(c.reason),esc(c.decision_note||'—')
 ]));
 $('appContent').insertAdjacentHTML('beforeend',
  panel('已核准請假：申請取消',
    '<div class="notice">只有本人可以申請取消。原請假在主管同意之前仍然有效，不能直接改動已月結的紀錄。</div>'+
    table(['假別','開始','結束','操作'],requestRows))+
  panel('我的請假取消申請歷史',
    table(['假別','開始','結果','取消原因','審核備註'],history)));
};
const wfPriorLeaveCancelApprovals=approvals;
approvals=function(){
 wfPriorLeaveCancelApprovals();
 if(app.mode!=='real'||!manager())return;
 const pending=(app.data?.leaveCancellations||[]).filter(c=>
  c.status==='pending'&&wfCanReview(c.member_id));
 const rows=pending.map(c=>tr([
  personLabel(c.member_id),esc(kind(c.leave_kind)),
  taiStamp(c.starts_at)+'～'+taiStamp(c.ends_at),
  esc(c.reason),
  '<div class="flex">'+
  '<button type="button" class="btn small primary" data-wf-lifecycle="decideCancel" data-ok="true" data-id="'+esc(c.id)+'">同意取消</button>'+
  '<button type="button" class="btn small danger" data-wf-lifecycle="decideCancel" data-ok="false" data-id="'+esc(c.id)+'">駁回取消</button></div>'
 ]));
 $('appContent').insertAdjacentHTML('beforeend',
  panel('待審核：已核准請假取消',table(['員工','假別','原請假期間','取消原因','處理'],rows))+
  '<p class="muted">同意取消後才釋放假期額度；已月結案件不允許直接取消。審核人不得審核自己的請假。</p>');
};
const wfPriorLifecycleEmployees=employees;
employees=function(){
 wfPriorLifecycleEmployees();
 if(app.mode!=='real'||!['owner','hr'].includes(role()))return;
 const rows=(app.data?.members||[]).filter(m=>m.role!=='owner'&&(role()==='owner'||m.role!=='hr'))
 .map(m=>tr([
  esc(m.display_name),esc(m.job_title||''),status(m.status),
  esc(m.hired_on||'—'),esc(m.left_on||'—'),
  '<button type="button" class="btn small '+(m.status==='active'?'danger':'')+'" data-wf-lifecycle="employment" data-id="'+esc(m.id)+'" data-status="'+(m.status==='active'?'inactive':'active')+'">'+
   (m.status==='active'?'停用／離職':'恢復在職')+'</button>'
 ]));
 $('appContent').insertAdjacentHTML('beforeend',
  panel('員工在職狀態／復職',
   '<div class="notice">異動需輸入原因並記入稽核。離職不會刪除任何歷史打卡、請假或月結資料；有未來已發布班次、未審申請或下屬的主管不能直接停用。</div>'+
   table(['員工','職稱','狀態','到職日','離職日','操作'],rows)));
};
function wfOpenLeaveCancelRequest(id){
 const r=(app.data?.requests||[]).find(x=>x.id===id);
 const own=(app.data?.members||[]).find(m=>m.user_id===app.user?.id);
 if(!r||!own||r.member_id!==own.id||r.status!=='approved'||r.kind!=='leave')
  throw Error('只能取消自己已核准的請假');
 openModal('申請取消已核准請假',modalForm('wf_leave_cancel',[
  {name:'p_request',label:'原申請',wide:true,html:'<input name="p_request" type="hidden" value="'+esc(id)+'"><p>'+esc(kind(r.leave_kind))+' · '+taiStamp(r.starts_at)+'～'+taiStamp(r.ends_at)+'</p>'},
  {name:'p_reason',label:'取消原因（3–500 字）',wide:true,html:'<textarea name="p_reason" required minlength="3" maxlength="500" rows="4"></textarea>'}
 ],'送出取消申請')+'<p class="muted">送出後原請假仍為「已核准」，主管同意取消才會變更。</p>');
}
function wfOpenLeaveCancelDecision(id,approve){
 const c=(app.data?.leaveCancellations||[]).find(x=>x.id===id&&x.status==='pending');
 if(!c||!wfCanReview(c.member_id))throw Error('無權審核此取消申請');
 openModal(approve?'同意取消已核准請假':'駁回取消申請',
  modalForm('wf_leave_cancel_decision',[
   {name:'p_cancellation',label:'取消案件',wide:true,html:'<input type="hidden" name="p_cancellation" value="'+esc(id)+'"><p>'+personLabel(c.member_id)+' · '+taiStamp(c.starts_at)+'～'+taiStamp(c.ends_at)+'</p>'},
   {name:'p_note',label:'審核說明',wide:true,html:'<textarea name="p_note" maxlength="500" rows="3" placeholder="可留空"></textarea>'},
   {name:'p_approve',label:'審核決定',wide:true,html:'<input name="p_approve" type="hidden" value="'+String(approve)+'"><p>'+(approve?'同意取消原請假':'維持原已核准請假')+'</p>'}
  ],approve?'確認同意取消':'確認駁回'));
}
function wfOpenEmploymentChange(id,targetStatus){
 const m=(app.data?.members||[]).find(x=>x.id===id);
 if(!m||m.role==='owner'||(role()==='hr'&&m.role==='hr')||
  !['owner','hr'].includes(role())||!['active','inactive'].includes(targetStatus))
  throw Error('沒有權限調整員工在職狀態');
 openModal(targetStatus==='inactive'?'停用／離職員工':'恢復員工在職',
  modalForm('wf_employment_status',[
  {name:'p_member',label:'對象',wide:true,html:'<input name="p_member" type="hidden" value="'+esc(id)+'"><p>'+esc(m.display_name)+'</p>'},
  {name:'p_status',label:'目標狀態',wide:true,html:'<input name="p_status" type="hidden" value="'+esc(targetStatus)+'"><p>'+(targetStatus==='inactive'?'停用（保留歷史紀錄）':'恢復在職')+'</p>'},
  {name:'p_reason',label:'人員異動原因（至少 5 字）',wide:true,html:'<textarea name="p_reason" required minlength="5" maxlength="500" rows="3"></textarea>'}
  ],targetStatus==='inactive'?'確認停用':'確認恢復')+
  '<p class="muted">如有未來已發布班表或待審申請，請先安排交接再停用。</p>');
}
document.addEventListener('click',event=>{
 const btn=event.target.closest('[data-wf-lifecycle]');
 if(!btn||!btn.closest('#appContent'))return;
 event.preventDefault();
 try{
  if(btn.dataset.wfLifecycle==='requestCancel')wfOpenLeaveCancelRequest(btn.dataset.id);
  else if(btn.dataset.wfLifecycle==='decideCancel')
   wfOpenLeaveCancelDecision(btn.dataset.id,btn.dataset.ok==='true');
  else if(btn.dataset.wfLifecycle==='employment')
   wfOpenEmploymentChange(btn.dataset.id,btn.dataset.status);
 }catch(err){banner(err.message,true);}
});
$('overlay').addEventListener('submit',async event=>{
 const form=event.target;
 if(!['wf_leave_cancel','wf_leave_cancel_decision','wf_employment_status'].includes(form?.dataset?.form))return;
 event.preventDefault();event.stopImmediatePropagation();
 if(app.mode!=='real'||!app.token){banner('請先登入企業帳號',true);return;}
 const submit=form.querySelector('[type="submit"]');
 if(submit)submit.disabled=true;
 try{
  const fields=Object.fromEntries(new FormData(form).entries());
  if(form.dataset.form==='wf_leave_cancel'){
   await call('/rest/v1/rpc/wm_request_leave_cancellation','POST',{
    p_request:fields.p_request,p_reason:fields.p_reason},app.token);
  }else if(form.dataset.form==='wf_leave_cancel_decision'){
   await call('/rest/v1/rpc/wm_decide_leave_cancellation','POST',{
    p_cancellation:fields.p_cancellation,p_approve:fields.p_approve==='true',p_note:fields.p_note},app.token);
  }else{
   await call('/rest/v1/rpc/wm_set_employment_status','POST',{
    p_member:fields.p_member,p_status:fields.p_status,p_reason:fields.p_reason},app.token);
  }
  closeModal();await reload(true);
  banner('已由資料庫確認並儲存，歷程已保留');
 }catch(err){banner(err.message||'操作失敗',true);if(submit)submit.disabled=false;}
},true);
