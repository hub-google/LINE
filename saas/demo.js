/* Browser-only demonstration. No Supabase role, API, credential, or LINE push is used. */
(function(){
"use strict";
const KEY="line_saas_interactive_showcase_v1";
function seed(today){
 const t1={slug:"greenfield-salon",name:"青禾風格美髮（測試門市）",status:"ACTIVE",modules:{reservation:true,queue:true,calling:true},staff:2,line_status:"NOT_CONNECTED",phone:"",address:"展示門市",accent:"#147e68",description:"展示預約與現場取號服務",logo_url:"",open_time:"10:00",close_time:"20:00",slot_capacity:3,slot_minutes:60};
 const t2={...t1,slug:"demo-clinic",name:"澄心健康服務中心（測試門市）",modules:{reservation:true,queue:false,calling:false},staff:1};
 return {version:1,tenants:[t1,t2],reservations:[{id:"demo-book-1",slug:t1.slug,day:today,time:"14:00",party:1,name:"展示預約客",status:"CONFIRMED",user_id:"demo-seed"}],tickets:[{id:"demo-ticket-1",slug:t1.slug,day:today,number:"A001",name:"展示候位甲",status:"WAITING",source:"WALKIN",user_id:"demo-seed-1",order:1},{id:"demo-ticket-2",slug:t1.slug,day:today,number:"A002",name:"展示候位乙",status:"WAITING",source:"WALKIN",user_id:"demo-seed-2",order:2}],invites:[]};
}
function data(today){
 const raw=localStorage.getItem(KEY);
 if(raw){try{const o=JSON.parse(raw);if(o.version===1&&Array.isArray(o.tenants)&&Array.isArray(o.tickets)&&Array.isArray(o.reservations))return o}catch(e){console.warn("展示資料損壞，重新初始化")}}
 const d=seed(today);save(d);return d;
}
function save(d){localStorage.setItem(KEY,JSON.stringify(d))}
function reset(){localStorage.removeItem(KEY)}
function tenant(d,slug){const t=d.tenants.find(t=>t.slug===slug);if(!t)throw Error("找不到這家展示企業："+slug);return t}
function numbers(d,slug,day){return d.tickets.filter(t=>t.slug===slug&&t.day===day).sort((a,b)=>(a.order||0)-(b.order||0))}
function nextNumber(d,slug,day){const nums=d.tickets.filter(t=>t.slug===slug&&t.day===day).map(t=>Number(t.number.slice(1))||0);return "A"+String(Math.max(0,...nums)+1).padStart(3,"0")}
function newId(){return "demo-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,10)}
function slots(d,t,date){
 const start=Number(t.open_time.slice(0,2))*60+Number(t.open_time.slice(3,5)),end=Number(t.close_time.slice(0,2))*60+Number(t.close_time.slice(3,5));
 const interval=Math.max(15,Number(t.slot_minutes)||60),result=[];
 for(let at=start;at<end&&result.length<64;at+=interval){
  const time=String(Math.floor(at/60)).padStart(2,"0")+":"+String(at%60).padStart(2,"0");
  const used=d.reservations.filter(r=>r.slug===t.slug&&r.day===date&&r.time===time&&r.status!=="CANCELLED").reduce((n,r)=>n+Number(r.party),0);
  result.push({time,available:Math.max(0,(Number(t.slot_capacity)||3)-used)});
 }
 return result;
}
function load({view,slug,day,today}){
 const d=data(today),t=d.tenants.find(t=>t.slug===slug);
 const context={platform_admin:true,memberships:d.tenants.map(t=>({slug:t.slug,name:t.name,role:"OWNER"})),invitations:[]};
 const overview=d.tenants.map(t=>({...t,staff:(Number(t.staff)||1)+d.invites.filter(i=>i.slug===t.slug).length}));
 let staff=null,customer=null;
 if(view==="staff"&&t){
  staff={tenant:t,role:"OWNER",tickets:numbers(d,slug,day),reservations:d.reservations.filter(r=>r.slug===slug&&r.day===day),members:[{email:"demo@example.invalid",role:"OWNER"}],invites:d.invites.filter(i=>i.slug===slug)};
 }
 if(view==="customer"){
  const t=tenant(d,slug);if(t.status!=="ACTIVE")throw Error("這家展示企業暫停服務");
  const todays=numbers(d,slug,today);
  customer={tenant:t,current:todays.find(x=>["CALLED","SERVING"].includes(x.status))?.number||null,waiting:todays.filter(x=>x.status==="WAITING").length,
   slots:slots(d,t,day),my_reservations:d.reservations.filter(r=>r.slug===slug&&r.user_id==="demo-visitor"),my_tickets:d.tickets.filter(x=>x.slug===slug&&x.user_id==="demo-visitor")};
 }
 return {context,overview,staff,customer};
}
function rpc(name,p={},today){
 const d=data(today),t=d.tenants.find(t=>t.slug===p.p_slug);
 const requireTenant=()=>{if(!t)throw Error("找不到展示企業");return t};
 let result={};
 if(name==="so_create_tenant"){
  const slug=String(p.p_slug||"").trim(),name=String(p.p_name||"").trim();
  if(!/^[a-z0-9-]{3,40}$/.test(slug)||!name)throw Error("請填企業名稱與 3–40 字英數網址代碼");
  if(d.tenants.some(x=>x.slug===slug))throw Error("此網址代碼已存在");
  const base={...d.tenants[0],slug,name,status:"ACTIVE",modules:p.p_modules||{reservation:true,queue:true,calling:true},staff:1,phone:"",address:"",description:"",line_status:"NOT_CONNECTED"};
  d.tenants.push(base);result={slug};
 }else if(name==="so_update_tenant"){
  const t=requireTenant(),patch=p.p_patch||{};if(patch.name!==undefined&&!String(patch.name).trim())throw Error("企業名稱不可空白");
  Object.assign(t,patch);result={updated:true};
 }else if(name==="so_invite_staff"){
  requireTenant();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.p_email||""))throw Error("請輸入正確員工 Email");
  d.invites.push({id:newId(),slug:p.p_slug,email:p.p_email,role:p.p_role});result={invited:true};
 }else if(name==="so_book"){
  const t=requireTenant();if(!t.modules.reservation)throw Error("未開通預約功能");
  const nickname=String(p.p_name||"").trim(),party=Number(p.p_party);
  if(!nickname||!Number.isInteger(party)||party<1||party>20)throw Error("請填寫暱稱與 1–20 位預約人數");
  if(p.p_date<today)throw Error("不能預約過去日期");
  const slot=slots(d,t,p.p_date).find(s=>s.time===p.p_time);if(!slot||slot.available<party)throw Error("預約時段剩餘名額不足");
  result={id:newId(),slug:p.p_slug,day:p.p_date,time:p.p_time,party,name:nickname,status:"CONFIRMED",user_id:"demo-visitor"};
  d.reservations.push(result);
 }else if(name==="so_cancel_booking"){
  const r=d.reservations.find(x=>x.id===p.p_id&&x.user_id==="demo-visitor"&&x.status==="CONFIRMED");if(!r)throw Error("找不到可取消的預約");r.status="CANCELLED";result={cancelled:true};
 }else if(name==="so_take_number"){
  const t=requireTenant();if(!t.modules.queue||t.status!=="ACTIVE")throw Error("此企業未開放取號");
  const nickname=String(p.p_name||"").trim();if(!nickname)throw Error("請輸入暱稱");
  const existing=d.tickets.find(x=>x.slug===p.p_slug&&x.day===today&&x.user_id==="demo-visitor"&&["WAITING","CALLED","SERVING"].includes(x.status));
  if(existing)result=existing;
  else{const own=numbers(d,p.p_slug,today);result={id:newId(),slug:p.p_slug,day:today,number:nextNumber(d,p.p_slug,today),name:nickname,source:"WALKIN",status:"WAITING",user_id:"demo-visitor",order:own.length+1};d.tickets.push(result)}
 }else if(name==="so_cancel_number"){
  const q=d.tickets.find(x=>x.id===p.p_id&&x.user_id==="demo-visitor"&&x.status==="WAITING");if(!q)throw Error("只有自己的等候號碼可取消");q.status="CANCELLED";result={cancelled:true};
 }else if(name==="so_staff_action"){
  const t=requireTenant(),a=p.p_action,all=numbers(d,p.p_slug,today);
  if(t.status!=="ACTIVE")throw Error("企業已停用");
  const active=all.find(x=>["CALLED","SERVING"].includes(x.status));
  let q=all.find(x=>x.id===p.p_ticket_id);
  if(a==="call"){
   if(!t.modules.calling)throw Error("未開放叫號");
   if(active)throw Error("請先完成目前服務或標記過號");
   q=all.find(x=>x.status==="WAITING");if(!q)throw Error("目前沒有等候者");q.status="CALLED";
  }else if(a==="checkin"){
   const r=d.reservations.find(x=>x.id===p.p_reservation_id&&x.slug===p.p_slug&&x.day===today&&x.status==="CONFIRMED");
   if(!r)throw Error("只能報到今日未報到的預約");
   if(all.some(x=>x.user_id===r.user_id&&["WAITING","CALLED","SERVING"].includes(x.status)))throw Error("這位顧客已有候位號碼");
   q={id:newId(),slug:p.p_slug,day:today,number:nextNumber(d,p.p_slug,today),name:r.name,source:"RESERVATION",status:"WAITING",user_id:r.user_id,order:all.length+1};
   d.tickets.push(q);r.status="CHECKED_IN";
  }else if(a==="no_show"||a==="cancel_booking"){
   const r=d.reservations.find(x=>x.id===p.p_reservation_id&&x.slug===p.p_slug&&x.status==="CONFIRMED");if(!r)throw Error("預約狀態不可操作");
   r.status=a==="no_show"?"NO_SHOW":"CANCELLED";
  }else if(a==="recall"){if(!q||q.status!=="CALLED")throw Error("只能重新呼叫已叫號者")}
  else if(a==="start"){if(!q||q.status!=="CALLED")throw Error("只能開始已叫號者");q.status="SERVING"}
  else if(a==="complete"){if(!q||!["CALLED","SERVING"].includes(q.status))throw Error("目前沒有服務中的號碼");q.status="COMPLETED"}
  else if(a==="pass"){if(!q||q.status!=="CALLED")throw Error("只能將已叫號者標記過號");q.status="PASSED"}
  else if(a==="return"){if(!q||q.status!=="PASSED")throw Error("只有已過號者可回到候位");q.status="WAITING";q.order=Math.max(0,...all.map(x=>x.order||0))+1}
  else if(a==="cancel"){if(!q||!["WAITING","PASSED"].includes(q.status))throw Error("號碼狀態不可取消");q.status="CANCELLED"}
  else throw Error("未支援的展示操作："+a);
  result={number:q?.number||null};
 }else throw Error("不支援的展示功能："+name);
 save(d);return result;
}
window.LineDemo={KEY,data,load,rpc,reset};
})();