const features=[["reservation","線上預約"],["queue","線上取號"],["calling","現場叫號"]];
// New links always use the dedicated booking product path. Historic /saas/ URLs
// still render, including the LINE LIFF configured callback endpoint.
const bookingPath=location.pathname.replace(/\/(?:saas|booking)\/(?:index\.html)?$/,"/booking/");
const route=(v,s=slug,tab="")=>bookingPath+"?view="+encodeURIComponent(v)+(s?"&merchant="+encodeURIComponent(s):"")+(v==="customer"&&tab?"&tab="+encodeURIComponent(tab):"");
function lineIndicator(tenant){
 const shared=!!(lineConfig?.loginReady&&lineConfig?.messagingReady);
 const own=tenant.line_status==="UNBOUND"?"尚未連接店家官方帳號":String(tenant.line_status||"未設定");
 return (shared?"平台共用 OA 已配置":"平台共用 OA 尚未就緒")+"；"+own;
}
function taipei(){return new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())}
function esc(x){return String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function queueSessionName(code){return ({MORNING:"早場",AFTERNOON:"午場",EVENING:"晚場",REST:"休場"})[code]||"早場"}
function jsStatus(s){return ({CONFIRMED:"已預約",CHECKED_IN:"已報到",COMPLETED:"已完成",CANCELLED:"已取消",NO_SHOW:"未到",WAITING:"等候中",CALLED:"已叫號",ARRIVED:"已到場",ADMITTED:"已進場",SERVING:"服務中",HOLD:"保留候位",PASSED:"已過號",ACTIVE:"啟用中",SUSPENDED:"已停用"})[s]||s}
function tag(s){return '<span class="tag '+(["ACTIVE","COMPLETED","CONFIRMED","CONNECTED"].includes(s)?"ok":(["SUSPENDED","PASSED","CANCELLED","HOLD"].includes(s)?"warn":""))+'">'+esc(jsStatus(s))+'</span>'}
function btn(label,action,style="",extra=""){return '<button class="btn '+style+'" data-act="'+action+'" '+extra+'>'+label+'</button>'}
function stat(label,n){return '<div class="stat"><span>'+esc(label)+'</span><strong>'+esc(n)+'</strong></div>'}
function field(label,id,val="",type="text",attrs=""){return '<label for="'+id+'">'+esc(label)+'</label><input class="field" id="'+id+'" type="'+type+'" '+attrs+' value="'+esc(val)+'">'}
function box(title,inner){return '<section class="card"><h2>'+title+'</h2>'+inner+'</section>'}
function formatTaipeiCreated(x){
 if(!x)return "時間未記錄";
 const d=new Date(x);
 return Number.isFinite(d.getTime())
  ?new Intl.DateTimeFormat("zh-TW",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(d)
  :"時間未記錄";
}
function selectedItemsHtml(items){
 if(!Array.isArray(items)||!items.length)return "";
 return '<div class="small" style="margin-top:6px">已選餐點／服務：'+
  items.map(x=>esc(x.name||"")).join("、")+'</div>';
}
function menuModeLabel(mode){return ({REQUIRED:"必填",OPTIONAL:"選填",DISABLED:"不開放填寫"})[mode]||mode}
function menuModeSelect(id,value){
 return '<select class="field" id="'+id+'">'+
  [["REQUIRED","必填｜選完才能送出"],["OPTIONAL","選填｜可直接略過"],["DISABLED","不開放填寫"]]
    .map(([v,t])=>'<option value="'+v+'" '+(v===value?'selected':'')+'>'+t+'</option>').join("")+'</select>';
}
function menuPrice(x){
 return x.price===null||x.price===undefined||x.price===""?"":"NT$ "+Number(x.price).toLocaleString("zh-TW",{maximumFractionDigits:2});
}
function menuSelectSection(mode,items,chosen,flow){
 if(mode==="DISABLED")return "";
 const active=Array.isArray(items)?items.filter(x=>x.active!==false):[];
 return '<section class="staff-record" style="margin:12px 0">'+
  '<h3 style="margin:0 0 7px">選擇餐點／服務 '+(mode==="REQUIRED"?"（必填）":"（選填）")+'</h3>'+
  (active.length?'<div class="menu-choices">'+active.map(item=>
   '<label class="menu-choice"><input type="checkbox" data-menu-choice="'+flow+'" value="'+esc(item.id)+'" '+
    (chosen.includes(item.id)?"checked ":"")+'><span><strong>'+esc(item.name)+'</strong>'+
    '<span class="small">'+(item.kind==="MENU"?"餐點":"服務")+(menuPrice(item)?" ・ "+esc(menuPrice(item)):"")+'</span>'+
    (item.description?'<span class="small">'+esc(item.description)+'</span>':"")+'</span></label>').join("")+'</div>':
   '<p class="staff-help">店家尚未上架任何餐點或服務，請先聯絡店家。</p>')+
  (mode==="REQUIRED"?'<p class="staff-help">請至少選擇一項，才能完成送出。</p>':'<p class="staff-help">不需要預選服務，也可以直接送出。</p>')+
 '</section>';
}
function menuChoiceReady(mode,ids,items){
 return mode!=="REQUIRED"||(ids.length>0&&ids.some(id=>items?.some(item=>item.id===id&&item.active!==false)));
}

let lastStaffChange=null;
function staffStatusPicker(kind,item,editable){
 const choices=kind==="reservation"?
  [["CONFIRMED","已預約"],["CHECKED_IN","已報到"],["COMPLETED","已完成"],["NO_SHOW","未到"],["CANCELLED","已取消"]]:
  [["WAITING","候位中"],["HOLD","保留中"],["CALLED","已叫號"],["ARRIVED","已到場"],["ADMITTED","已進場"],["SERVING","服務中"],["COMPLETED","已完成"],["PASSED","已過號"],["CANCELLED","已取消"]];
 const label=kind==="reservation"?"預約":"號碼牌";
 return '<fieldset class="staff-picker"><legend>點選狀態即儲存（可重新選擇修正）</legend>'+
  choices.map(([value,title])=>'<label class="staff-choice"><input type="radio" name="'+kind+'-'+esc(item.id)+'" data-status-kind="'+kind+'" data-id="'+esc(item.id)+'" data-previous="'+esc(item.status)+'" value="'+value+'" '+(value===item.status?'checked ':'')+((Array.isArray(editable)?editable.includes(value):editable)?'':'disabled ')+'><span>'+title+'</span></label>').join("")+
 '</fieldset>';
}
function staffDeletePicker(kind,item,parentHidden=false){
 const checked=!!item.deleted_at;
 return '<label class="staff-delete"><input type="checkbox" data-delete-kind="'+kind+
   '" data-id="'+esc(item.id)+'" '+(checked?'checked ':'')+(parentHidden?'disabled ':'')+
   '><span>刪除（顧客端不顯示、不會發送 LINE 通知）'+
   (parentHidden?'；請先恢復原預約':'')+'</span></label>';
}
let actionFeedbackTimer=null;
function dismissActionFeedback(){
 clearTimeout(actionFeedbackTimer);
 actionFeedbackTimer=null;
 document.getElementById("action-feedback")?.remove();
}
function showActionFeedback(message,kind="success"){
 clearTimeout(actionFeedbackTimer);
 actionFeedbackTimer=null;
 let node=document.getElementById("action-feedback");
 if(!node){node=document.createElement("div");node.id="action-feedback";document.body.appendChild(node);}
 node.className="action-feedback "+(kind==="error"?"failure":kind);
 node.setAttribute("role",kind==="error"?"alert":"status");
 node.setAttribute("aria-live",kind==="error"?"assertive":"polite");
 node.innerHTML='<div><strong>'+esc(kind==="pending"?"處理中":kind==="error"?"操作失敗":kind==="warning"?"操作已儲存，但通知待確認":"操作成功")+'</strong><div>'+esc(message)+'</div></div><button type="button" data-act="dismiss-feedback" aria-label="關閉提示">×</button>';
 // Do not hide an operation while it is still pending.
 if(kind!=="pending")actionFeedbackTimer=setTimeout(dismissActionFeedback,5000);
}

function requireAuth(){
 const isStaff=view==="staff";
 return '<div class="card auth"><h1>'+(isStaff?"店家登入":"平台管理員登入")+'</h1>'+
 '<p class="muted">使用電子信箱與密碼登入。沒有帳號可直接註冊，店家資料完成前不會公開。</p>'+
 '<div class="flex" style="margin-top:17px"><a class="btn primary" href="./merchant-register.html?mode=login">登入</a>'+
 '<a class="btn outline" href="./merchant-register.html?mode=signup">註冊</a></div></div>';
}
function authReady(){return !!(session?.user&&!session.user.is_anonymous)}

function platformReady(){return !!context?.platform_admin}
function nav(label,tab,current,which){return '<button class="side-item '+(tab===current?"active":"")+'" data-nav="'+which+'" data-tab="'+tab+'">'+label+'</button>'}
function layout(title,subtitle,menu,body){
 const staffQuickNav=view==="staff"?'<nav class="staff-mobile-nav" aria-label="門市功能快速導覽">'+
  nav("工作台","dashboard",staffTab,"staff")+nav("預約","bookings",staffTab,"staff")+
  nav("叫號","queue",staffTab,"staff")+
  '<details class="staff-mobile-more"><summary aria-label="開啟更多管理功能">更多</summary><div class="staff-mobile-popup">'+
  nav("預約日曆","calendar",staffTab,"staff")+nav("服務單位與場次","units",staffTab,"staff")+nav("營運分析","analytics",staffTab,"staff")+
  nav("菜單與服務","menu",staffTab,"staff")+nav("員工管理","members",staffTab,"staff")+
  nav("分店管理","branches",staffTab,"staff")+nav("企業設定","settings",staffTab,"staff")+
  '<a class="side-item guide-link" href="./merchant-center.html#guide">操作說明 ↗</a></div></details></nav>':"";
 return '<div class="toolbar"><div><div class="eyebrow">'+(view==="customer"?"排隊怪獸 · 顧客服務":view==="staff"?"排隊怪獸 · 門市管理":"排隊怪獸 · 平台管理")+'</div><h1>'+esc(title)+'</h1><div class="muted">'+esc(subtitle)+'</div></div></div><div class="layout'+(view==="customer"?" customer-layout":"")+'"><aside>'+menu+'</aside><section class="content">'+body+'</section></div>'+staffQuickNav;
}
function head(){const links=view==="customer"?[["customer","預約與取號"]]:[["marketing","網站首頁"],["platform","平台管理"],["staff","店家管理"],["customer","顧客入口"]];
$("headlinks").innerHTML=links.map(x=>'<a href="'+esc(x[0]==="marketing"?new URL("./home.html",location.origin+bookingPath).pathname:x[0]==="customer"?(customerUrl(slug)||route("customer",slug)):route(x[0],x[0]==="platform"?"":slug))+'" class="'+(x[0]===view?"active":"")+'">'+x[1]+'</a>').join("");
}
function message(){return (err?'<div class="error" role="alert">'+esc(err)+'</div>':"")+(flash?'<div class="notice" role="status">'+esc(flash)+'</div>':"")}
function renderHome(){
 return '<div class="hero"><h1>預約、取號、叫號一次完成</h1><p class="muted">排隊怪獸讓店家建立自己的預約與候位服務。</p></div>'+
 '<div class="grid3">'+
 '<a class="routecard" href="./merchant-register.html?mode=signup"><h2>註冊店家帳號</h2><p>建立自己的空白門市後台。</p><strong>開始註冊 →</strong></a>'+
 '<a class="routecard" href="./merchant-register.html?mode=login"><h2>店家登入</h2><p>管理營業設定、預約與叫號。</p><strong>店家登入 →</strong></a>'+
 '<a class="routecard" href="./directory.html"><h2>搜尋店家</h2><p>尋找已公開上架的預約與取號服務。</p><strong>搜尋店家 →</strong></a></div>';
}
function featureChecks(data={},prefix="feature"){
 return '<div class="grid">'+features.map(f=>'<label class="checklist"><input type="checkbox" class="'+prefix+'" data-feature="'+f[0]+'" '+(data[f[0]]?"checked":"")+'> '+f[1]+'</label>').join("")+'</div>';
}

