/* Workforce swap dialog: refresh selectable shifts whenever opened.
   The app can have newly-published shifts while the current UI still carries
   older state. Always use the same Supabase tenant and the logged-in identity.
   Never bypass the existing server-side swap/consent/review validations. */
const WORKFORCE_API='https://unapiwajmgqqtdkixaab.supabase.co';
const WORKFORCE_KEY='sb_publishable_L09XC4Tekm6cZaPTTczm3g_Aap-SOSy';
const SWAP_UI_SELECTOR='#overlay form[data-form="swap_create"]';
const swapFormCache=new WeakMap();
const taiwanDateTime=new Intl.DateTimeFormat('zh-TW',{
 timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit',
 hour:'2-digit',minute:'2-digit',hour12:false
});
async function swapFetch(path,method='GET',body=null,token=null){
 const headers={apikey:WORKFORCE_KEY};
 if(body)headers['Content-Type']='application/json';
 if(token)headers.Authorization='Bearer '+token;
 const response=await fetch(WORKFORCE_API+path,{method,headers,
  body:body?JSON.stringify(body):undefined,cache:'no-store'});
 if(!response.ok)throw new Error('無法取得最新的換班班表（HTTP '+response.status+'）');
 return response.json();
}
async function freshPublishedShifts(){
 const isDemo=(document.getElementById('modePill')?.textContent||'').includes('DEMO');
 if(isDemo){
  const snapshot=await swapFetch('/rest/v1/rpc/wm_demo_api','POST',
   {p_action:'snapshot',p_data:{}});
  return {
   shifts:(snapshot.shifts||[]).filter(s=>s.status==='published'),
   members:snapshot.members||[],isDemo,userId:null
  };
 }
 let auth;
 try{auth=JSON.parse(sessionStorage.getItem('wm_auth')||'null');}catch{}
 const tenant=document.getElementById('tenantPicker')?.value;
 if(!auth?.token||!auth?.user?.id||!tenant)throw new Error('請先登入並選擇企業');
 const query='tenant_id=eq.'+encodeURIComponent(tenant);
 const [shifts,members]=await Promise.all([
  swapFetch('/rest/v1/wm_shifts?select=id,member_id,branch_id,starts_at,ends_at,status&'+query+
    '&status=eq.published&order=starts_at.desc&limit=600','GET',null,auth.token),
  swapFetch('/rest/v1/wm_members?select=id,user_id,display_name,role&'+query,'GET',null,auth.token)
 ]);
 return {shifts,members,isDemo,userId:auth.user.id};
}
function swapLabel(shift,members){
 const member=members.find(m=>m.id===shift.member_id);
 const start=taiwanDateTime.format(new Date(shift.starts_at));
 const end=taiwanDateTime.format(new Date(shift.ends_at));
 return (member?.display_name||'員工')+' · '+start+'—'+end;
}
function fillSwapSelect(select,shifts,members,preferred){
 select.replaceChildren(...shifts.map(s=>new Option(swapLabel(s,members),s.id)));
 if(preferred&&shifts.some(x=>x.id===preferred))select.value=preferred;
}
function rebuildSwapTargets(form,cache){
 const from=form.querySelector('[name="source_shift_id"]');
 const to=form.querySelector('[name="target_shift_id"]');
 if(!from||!to)return;
 const selected=cache.shifts.find(x=>x.id===from.value);
 const old=to.value;
 const targets=cache.shifts.filter(x=>selected&&x.member_id!==selected.member_id)
  .sort((a,b)=>{
   const diffA=Math.abs(Date.parse(a.starts_at)-Date.parse(selected.starts_at));
   const diffB=Math.abs(Date.parse(b.starts_at)-Date.parse(selected.starts_at));
   return Number(b.branch_id===selected.branch_id)-Number(a.branch_id===selected.branch_id)
    ||diffA-diffB;
  });
 fillSwapSelect(to,targets,cache.members,old);
 to.disabled=targets.length===0;
 const button=form.querySelector('button[type="submit"]');
 if(button)button.disabled=targets.length===0;
 const notice=form.querySelector('[data-swap-sync-status]');
 if(notice)notice.textContent=targets.length
  ?'已同步最新班表；請確認雙方班次後送出。'
  :'目前沒有另一位員工可交換的已發布班次。';
}
async function syncSwapForm(){
 const form=document.querySelector(SWAP_UI_SELECTOR);
 if(!form)return;
 const from=form.querySelector('[name="source_shift_id"]');
 const to=form.querySelector('[name="target_shift_id"]');
 const submit=form.querySelector('button[type="submit"]');
 if(!from||!to)return;
 const sourceBefore=from.value;
 from.disabled=true;to.disabled=true;if(submit)submit.disabled=true;
 const notice=document.createElement('p');
 notice.dataset.swapSyncStatus='';
 notice.className='muted';
 notice.setAttribute('role','status');
 notice.textContent='正在更新最新可交換班次…';
 (to.closest('.field')||to.parentElement).appendChild(notice);
 try{
  const fresh=await freshPublishedShifts();
  if(!form.isConnected)return;
  const source=fresh.isDemo?fresh.shifts:
   fresh.shifts.filter(s=>fresh.members.some(m=>m.id===s.member_id&&m.user_id===fresh.userId));
  if(!source.length)throw new Error('目前沒有自己可交換的已發布班次');
  swapFormCache.set(form,fresh);
  fillSwapSelect(from,source,fresh.members,sourceBefore);
  from.disabled=false;
  rebuildSwapTargets(form,fresh);
 }catch(error){
  if(!form.isConnected)return;
  from.disabled=false;to.disabled=false;if(submit)submit.disabled=false;
  notice.textContent=error instanceof Error?error.message:'同步班表失敗，請更新頁面後重試';
 }
}
// The original app handles the newSwap click first; this listener refreshes the
// already-open form without depending on app module internals.
document.addEventListener('click',event=>{
 if(event.target.closest('[data-extra="newSwap"]'))queueMicrotask(()=>{void syncSwapForm();});
});
document.addEventListener('change',event=>{
 if(!event.target.matches(SWAP_UI_SELECTOR+' [name="source_shift_id"]'))return;
 const form=event.target.closest(SWAP_UI_SELECTOR),cached=form&&swapFormCache.get(form);
 if(cached)rebuildSwapTargets(form,cached);
});
