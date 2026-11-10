import {esc} from "./shared-ui.js";

// This UI keeps the original comma-separated YYYY-MM-DD value for the existing RPC.
const ID="policy-closed-dates";
let initialized=false;
const parse=input=>[...new Set((input?.value||"").split(/[,，;；\s]+/).filter(x=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(x))return false;
 const [y,m,d]=x.split("-").map(Number),date=new Date(Date.UTC(y,m-1,d));
 return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d;
}))].sort();
const pad=n=>String(n).padStart(2,"0");
const iso=(y,m,d)=>y+"-"+pad(m)+"-"+pad(d);
function close(w){
 const panel=w?.querySelector(".qm-closed-calendar"),input=w?.querySelector("#"+ID);
 if(panel)panel.hidden=true;
 const button=w?.querySelector("[data-closed-open]");
 if(button)button.setAttribute("aria-expanded","false");
}
function renderCalendar(w){
 const input=w.querySelector("#"+ID),panel=w.querySelector(".qm-closed-calendar");
 if(!input||!panel)return;
 const selected=new Set(parse(input)),y=Number(panel.dataset.year),m=Number(panel.dataset.month);
 panel.querySelector(".qm-closed-month").textContent=y+" 年 "+m+" 月";
 const offset=new Date(Date.UTC(y,m-1,1)).getUTCDay();
 const max=new Date(Date.UTC(y,m,0)).getUTCDate();
 const today=new Date(),todayKey=iso(today.getFullYear(),today.getMonth()+1,today.getDate());
 let html="";
 for(let i=0;i<offset;i++)html+='<span aria-hidden="true"></span>';
 for(let day=1;day<=max;day++){
  const key=iso(y,m,day),chosen=selected.has(key);
  html+='<button type="button" class="qm-closed-day'+(chosen?' selected':'')+(key===todayKey?' today':'')+
   '" data-closed-day="'+key+'" aria-label="'+key+'" aria-pressed="'+chosen+'">'+day+'</button>';
 }
 panel.querySelector(".qm-closed-grid").innerHTML=html;
 panel.querySelector(".qm-closed-count").textContent="已選 "+selected.size+" 天";
}
function open(w){
 document.querySelectorAll(".qm-closed-picker").forEach(other=>{if(other!==w)close(other);});
 const input=w.querySelector("#"+ID),panel=w.querySelector(".qm-closed-calendar");
 const first=parse(input)[0],date=first?new Date(first+"T12:00:00"):new Date();
 panel.dataset.year=String(date.getFullYear());panel.dataset.month=String(date.getMonth()+1);
 panel.hidden=false;w.querySelector("[data-closed-open]").setAttribute("aria-expanded","true");renderCalendar(w);
}
function move(w,step){
 const panel=w.querySelector(".qm-closed-calendar");
 const d=new Date(Date.UTC(Number(panel.dataset.year),Number(panel.dataset.month)-1+step,1));
 panel.dataset.year=String(d.getUTCFullYear());panel.dataset.month=String(d.getUTCMonth()+1);
 renderCalendar(w);
}

export function closedDatesPickerMarkup(dates){
 const value=Array.isArray(dates)?dates.join(","):String(dates||"");
 return '<div class="qm-closed-picker"><label for="'+ID+'">特殊休假日期</label><div class="qm-closed-input-row">'+
 '<input id="'+ID+'" class="field qm-closed-date-input" type="text" value="'+esc(value)+
 '" placeholder="例如 2026-11-15,2026-11-22" aria-label="特殊休假日期，可手動輸入逗號分隔日期">'+
 '<button type="button" class="qm-closed-open" data-closed-open aria-label="開啟特殊休假日曆" aria-haspopup="dialog" aria-expanded="false" aria-controls="qm-closed-calendar" title="選擇日期">'+
 '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+
 '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg></button>'+
 '<div class="qm-closed-calendar" id="qm-closed-calendar" role="dialog" aria-label="特殊休假日期日曆" hidden>'+
 '<div class="qm-closed-header"><button type="button" data-closed-shift="-1" aria-label="上個月">‹</button>'+
 '<strong class="qm-closed-month"></strong><button type="button" data-closed-shift="1" aria-label="下個月">›</button></div>'+
 '<div class="qm-closed-weekdays">'+["日","一","二","三","四","五","六"].map(d=>"<span>"+d+"</span>").join("")+'</div>'+
 '<div class="qm-closed-grid"></div><div class="qm-closed-footer"><span class="qm-closed-count"></span>'+
 '<button type="button" class="qm-closed-done" data-closed-done>完成選擇</button></div></div></div>'+
 '<p class="small">可直接輸入逗號分隔日期，或按右側日曆圖示跨月份多選；儲存前可再修改。</p></div>';
}
export function installClosedDatesPicker(){
 if(initialized)return;initialized=true;
 const style=document.createElement("style");
 style.textContent=[
 '.qm-closed-picker{min-width:0;margin-top:9px}',
 '.qm-closed-input-row{position:relative;min-width:0}',
 '.qm-closed-date-input{cursor:text;background:#fff;padding-right:51px}',
 '.qm-closed-open{position:absolute;right:6px;top:50%;transform:translateY(-50%);border:0;background:transparent;color:#6d4789;border-radius:7px;display:flex;align-items:center;justify-content:center;width:38px;height:38px;cursor:pointer}',
 '.qm-closed-open:hover{background:#f2e8fa}',
 '.qm-closed-open:focus-visible{outline:3px solid #93c5fd;outline-offset:2px}',
 '.qm-closed-calendar{position:absolute;z-index:200;left:0;top:calc(100% + 5px);width:min(340px,100%);box-sizing:border-box;background:white;border:1px solid #c4a6dd;border-radius:14px;padding:13px;box-shadow:0 12px 35px rgba(36,20,53,.2)}',
 '.qm-closed-calendar[hidden]{display:none}',
 '.qm-closed-header{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}',
 '.qm-closed-header strong{font-size:15px}',
 '.qm-closed-header button{width:36px;height:36px;background:#f4eafa;color:#654183;border:0;border-radius:9px;font-size:24px;cursor:pointer}',
 '.qm-closed-weekdays,.qm-closed-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;text-align:center}',
 '.qm-closed-weekdays{font-size:12px;color:#64748b;margin-bottom:5px}',
 '.qm-closed-weekdays span{padding:6px 0}',
 '.qm-closed-day{width:100%;min-width:0;min-height:37px;border:1px solid transparent;border-radius:8px;background:transparent;color:#263244;cursor:pointer;font-size:13px;padding:0}',
 '.qm-closed-day:hover{background:#f2e8fa}',
 '.qm-closed-day.today{border-color:#b18acd}',
 '.qm-closed-day.selected{background:#6d4789;color:white;font-weight:800}',
 '.qm-closed-day:focus-visible,.qm-closed-header button:focus-visible,.qm-closed-done:focus-visible{outline:3px solid #93c5fd;outline-offset:2px}',
 '.qm-closed-footer{display:flex;align-items:center;justify-content:space-between;gap:7px;padding-top:11px;margin-top:11px;border-top:1px solid #e5e7eb;font-size:12px;color:#64748b}',
 '.qm-closed-done{background:#6d4789;color:white;border:0;border-radius:9px;padding:9px 13px;min-height:38px;font-weight:800;cursor:pointer}',
 '@media(max-width:540px){.qm-closed-calendar{padding:10px}.qm-closed-day{min-height:39px}}'
 ].join("");
 document.head.appendChild(style);
 document.addEventListener("click",event=>{
  const w=event.target.closest(".qm-closed-picker");
  if(!w){document.querySelectorAll(".qm-closed-picker").forEach(close);return;}
  const shift=event.target.closest("[data-closed-shift]");
  if(shift){move(w,Number(shift.dataset.closedShift));return;}
  const day=event.target.closest("[data-closed-day]");
  if(day){
   const input=w.querySelector("#"+ID),dates=new Set(parse(input)),value=day.dataset.closedDay;
   if(dates.has(value))dates.delete(value);else dates.add(value);
   input.value=[...dates].sort().join(",");
   input.dispatchEvent(new Event("change",{bubbles:true}));
   renderCalendar(w);return;
  }
  if(event.target.closest("[data-closed-done]")){close(w);return;}
  if(event.target.closest("[data-closed-open]")){
   if(w.querySelector(".qm-closed-calendar").hidden)open(w);else close(w);
   return;
  }
  if(event.target.closest(".qm-closed-date-input"))close(w);
 });
 document.addEventListener("keydown",event=>{
  if(event.key==="Escape")document.querySelectorAll(".qm-closed-picker").forEach(close);
  // Keep normal input keyboard behavior; Enter and Space must remain typeable.
 });
}
