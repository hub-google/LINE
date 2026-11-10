import {authState} from "./state/authState.js";
import {feedbackState} from "./state/feedbackState.js";
import {lineState} from "./state/lineState.js";
import {routeState} from "./state/routeState.js";
import {sharedUiState} from "./state/sharedUiState.js";
import {staffState} from "./state/staffState.js";



import {customerUrl} from "./line-session.js";

export function customerFacingError(error,operation="general"){
 const raw=typeof error==="string"?error:typeof error?.message==="string"?error.message:typeof error?.error==="string"?error.error:"";
 const code=typeof error?.code==="string"?error.code:typeof error?.error_code==="string"?error.error_code:"";
 const detail=(code+" "+raw).toLowerCase();
 if(/invalid.login.credentials|invalid_credentials|invalid.grant|invalid.pin|invalid.password|incorrect.password|wrong.password|email.or.password/i.test(detail))return "電子信箱或密碼不正確，請重新輸入。";
 if(/email.not.confirmed|email_not_confirmed|email.unverified/i.test(detail))return "電子信箱尚未完成驗證，請先到信箱確認後再登入。";
 if(/user.already.registered|user_already_exists|email_exists|already.registered/i.test(detail))return "這個電子信箱已經註冊，請直接登入或使用忘記密碼。";
 if(/weak_password|password.should|password.must|password.is.too.short|password.*at.least|password.*characters/i.test(detail))return "密碼強度不足，請使用至少 8 個字元的密碼。";
 if(/same_password|new.password.should.be.different/i.test(detail))return "新密碼不可與原本密碼相同，請重新設定。";
 if(/over.*rate.limit|rate.limit|too.many.requests|security.purposes|try.again.after|too.many.attempts|admin.locked|locked.until/i.test(detail))return "操作太頻繁，請稍後再試。";
 if(/otp.expired|token.expired|refresh.token|session.not.found|invalid.jwt|jwt.expired|auth.session.missing/i.test(detail))return "登入驗證已過期，請重新登入。";
 if(/failed.to.fetch|network.error|networkerror|network.request.failed|load.failed|connection.*failed|fetch.failed|timeout|timed.out|network.unavailable/i.test(detail))return "網路連線異常，請檢查網路後再試一次。";
 if(/email.address.invalid|invalid.email|valid.email|email.*format/i.test(detail))return "電子信箱格式不正確，請重新確認。";
 if(/signup.disabled|signups.not.allowed|signups.*disabled/i.test(detail))return "目前暫時無法註冊，請稍後再試。";
 if(/[\u3400-\u9fff]/.test(raw)&&!/\b(?:error|failed|exception|sqlstate|jwt|pgrst\d+|authapierror|internal.server.error|undefined|null)\b/i.test(raw)&&!/[a-z][a-z0-9]*_[a-z0-9_]+/i.test(raw))return raw;
 if(operation==="login")return "登入失敗，請檢查電子信箱與密碼後重試。";
 if(operation==="signup")return "目前無法完成註冊，請稍後再試。";
 if(operation==="reset")return "暫時無法處理電子郵件或密碼設定，請稍後再試。";
 if(operation==="line")return "LINE 身分驗證暫時無法完成，請重新登入。";
 return "系統暫時無法完成操作，請稍後再試。";
}

export function lineIndicator(tenant){
 const shared=!!(lineState.lineConfig?.loginReady&&lineState.lineConfig?.messagingReady);
 const own=tenant.line_status==="UNBOUND"?"尚未連接店家官方帳號":String(tenant.line_status||"未設定");
 return (shared?"平台共用 OA 已配置":"平台共用 OA 尚未就緒")+"；"+own;
}

export function taipei(){return new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())}

export function esc(x){return String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}

export function queueSessionName(code){return ({MORNING:"早場",AFTERNOON:"午場",EVENING:"晚場",REST:"休場"})[code]||"早場"}

export function jsStatus(s){return ({CONFIRMED:"已預約",CHECKED_IN:"已報到",COMPLETED:"已完成",CANCELLED:"已取消",NO_SHOW:"未到",WAITING:"等候中",CALLED:"已叫號",ARRIVED:"已到場",ADMITTED:"已進場",SERVING:"服務中",HOLD:"保留候位",PASSED:"已過號",ACTIVE:"啟用中",SUSPENDED:"已停用"})[s]||s}

export function tag(s){return '<span class="tag '+(["ACTIVE","COMPLETED","CONFIRMED","CONNECTED"].includes(s)?"ok":(["SUSPENDED","PASSED","CANCELLED","HOLD"].includes(s)?"warn":""))+'">'+esc(jsStatus(s))+'</span>'}

export function btn(label,action,style="",extra=""){return '<button class="btn '+style+'" data-act="'+action+'" '+extra+'>'+label+'</button>'}

export function stat(label,n){return '<div class="stat"><span>'+esc(label)+'</span><strong>'+esc(n)+'</strong></div>'}

export function field(label,id,val="",type="text",attrs=""){return '<label for="'+id+'">'+esc(label)+'</label><input class="field" id="'+id+'" type="'+type+'" '+attrs+' value="'+esc(val)+'">'}

export function box(title,inner){return '<section class="card"><h2>'+title+'</h2>'+inner+'</section>'}

export function formatTaipeiCreated(x){
 if(!x)return "時間未記錄";
 const d=new Date(x);
 return Number.isFinite(d.getTime())
  ?new Intl.DateTimeFormat("zh-TW",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(d)
  :"時間未記錄";
}

export function selectedItemsHtml(items){
 if(!Array.isArray(items)||!items.length)return "";
 return '<div class="small" style="margin-top:6px">已選餐點／服務：'+
  items.map(x=>esc(x.name||"")).join("、")+'</div>';
}

export function menuModeLabel(mode){return ({REQUIRED:"必填",OPTIONAL:"選填",DISABLED:"不開放填寫"})[mode]||mode}

export function menuModeSelect(id,value){
 return '<select class="field" id="'+id+'">'+
  [["REQUIRED","必填｜選完才能送出"],["OPTIONAL","選填｜可直接略過"],["DISABLED","不開放填寫"]]
    .map(([v,t])=>'<option value="'+v+'" '+(v===value?'selected':'')+'>'+t+'</option>').join("")+'</select>';
}

export function menuPrice(x){
 return x.price===null||x.price===undefined||x.price===""?"":"NT$ "+Number(x.price).toLocaleString("zh-TW",{maximumFractionDigits:2});
}

export function menuSelectSection(mode,items,chosen,flow){
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

export function menuChoiceReady(mode,ids,items){
 return mode!=="REQUIRED"||(ids.length>0&&ids.some(id=>items?.some(item=>item.id===id&&item.active!==false)));
}

export function staffStatusPicker(kind,item,editable){
 const choices=kind==="reservation"?
  [["CONFIRMED","已預約"],["CHECKED_IN","已報到"],["COMPLETED","已完成"],["NO_SHOW","未到"],["CANCELLED","已取消"]]:
  [["WAITING","候位中"],["HOLD","保留中"],["CALLED","已叫號"],["ARRIVED","已到場"],["ADMITTED","已進場"],["SERVING","服務中"],["COMPLETED","已完成"],["PASSED","已過號"],["CANCELLED","已取消"]];
 const label=kind==="reservation"?"預約":"號碼牌";
 return '<fieldset class="staff-picker"><legend>點選狀態即儲存（可重新選擇修正）</legend>'+
  choices.map(([value,title])=>'<label class="staff-choice"><input type="radio" name="'+kind+'-'+esc(item.id)+'" data-status-kind="'+kind+'" data-id="'+esc(item.id)+'" data-previous="'+esc(item.status)+'" value="'+value+'" '+(value===item.status?'checked ':'')+((Array.isArray(editable)?editable.includes(value):editable)?'':'disabled ')+'><span>'+title+'</span></label>').join("")+
 '</fieldset>';
}

export function staffDeletePicker(kind,item,parentHidden=false){
 const checked=!!item.deleted_at;
 return '<label class="staff-delete"><input type="checkbox" data-delete-kind="'+kind+
   '" data-id="'+esc(item.id)+'" '+(checked?'checked ':'')+(parentHidden?'disabled ':'')+
   '><span>刪除（顧客端不顯示、不會發送 LINE 通知）'+
   (parentHidden?'；請先恢復原預約':'')+'</span></label>';
}

export function dismissActionFeedback(){
 clearTimeout(sharedUiState.actionFeedbackTimer);
 sharedUiState.actionFeedbackTimer=null;
 document.getElementById("action-feedback")?.remove();
}

export function showActionFeedback(message,kind="success"){
 clearTimeout(sharedUiState.actionFeedbackTimer);
 sharedUiState.actionFeedbackTimer=null;
 let node=document.getElementById("action-feedback");
 if(!node){node=document.createElement("div");node.id="action-feedback";document.body.appendChild(node);}
 node.className="action-feedback "+(kind==="error"?"failure":kind);
 node.setAttribute("role",kind==="error"?"alert":"status");
 node.setAttribute("aria-live",kind==="error"?"assertive":"polite");
 node.innerHTML='<div><strong>'+esc(kind==="pending"?"處理中":kind==="error"?"操作失敗":kind==="warning"?"操作已儲存，但通知待確認":"操作成功")+'</strong><div>'+esc(message)+'</div></div><button type="button" data-act="dismiss-feedback" aria-label="關閉提示">×</button>';
 // Do not hide an operation while it is still pending.
 if(kind!=="pending")sharedUiState.actionFeedbackTimer=setTimeout(dismissActionFeedback,5000);
}

export function requireAuth(){
 // Never reuse the merchant login CTA for headquarters or customer routes.
 if(routeState.view==="platform")return box("總部管理員登入",'<p class="muted">請由總部專屬入口驗證身分。</p><a class="btn primary" href="./platform-login.html">總部登入</a>');
 if(routeState.view==="staff")return '<div class="card auth"><h1>店家登入</h1><p class="muted">使用店家帳號管理預約及叫號。</p>'+
  '<div class="flex" style="margin-top:17px"><a class="btn primary" href="./merchant-register.html?mode=login">店家登入</a>'+
  '<a class="btn outline" href="./merchant-register.html?mode=signup">註冊店家</a></div></div>';
 return box("搜尋店家",'<p class="muted">請先選擇提供預約或取號服務的店家。</p><a class="btn primary" href="./directory.html?mode=search">搜尋店家</a>');
}

export function authReady(){return !!(authState.session?.user&&!authState.session.user.is_anonymous)}

export function platformReady(){return !!authState.context?.platform_admin}

export function nav(label,tab,current,which){return '<button class="side-item '+(tab===current?"active":"")+'" data-nav="'+which+'" data-tab="'+tab+'">'+label+'</button>'}

export function layout(title,subtitle,menu,body){
 const staffQuickNav=routeState.view==="staff"?'<nav class="staff-mobile-nav" aria-label="門市功能快速導覽">'+
  nav("工作台","dashboard",staffState.staffTab,"staff")+nav("預約","bookings",staffState.staffTab,"staff")+
  nav("叫號","queue",staffState.staffTab,"staff")+
  '<details class="staff-mobile-more"><summary aria-label="開啟更多管理功能">更多</summary><div class="staff-mobile-popup">'+
  nav("預約日曆","calendar",staffState.staffTab,"staff")+nav("服務單位與場次","units",staffState.staffTab,"staff")+nav("營運分析","analytics",staffState.staffTab,"staff")+
  nav("菜單與服務","menu",staffState.staffTab,"staff")+nav("員工管理","members",staffState.staffTab,"staff")+
  nav("分店管理","branches",staffState.staffTab,"staff")+nav("企業設定","settings",staffState.staffTab,"staff")+
  '<a class="side-item guide-link" href="./merchant-center.html#guide">操作說明 ↗</a></div></details></nav>':"";
 return '<div class="toolbar"><div><div class="eyebrow">'+(routeState.view==="customer"?"排隊怪獸 · 顧客服務":routeState.view==="staff"?"排隊怪獸 · 門市管理":"排隊怪獸 · 平台管理")+'</div><h1>'+esc(title)+'</h1><div class="muted">'+esc(subtitle)+'</div></div></div><div class="layout'+(routeState.view==="customer"?" customer-layout":"")+'"><aside>'+menu+'</aside><section class="content">'+body+'</section></div>'+staffQuickNav;
}

export function head(){
 // Each audience owns its own navigation. Do not mix headquarters, merchants and customers.
 const view=routeState.view;
 const links=view==="platform"?
  [["headquarters","總部管理"]]:
  view==="staff"?
   [["merchant","店家工作台"],["guide","操作說明"]]:
   [["browse","搜尋店家"],...(view==="customer"&&routeState.slug?[["customer","預約與取號"]]:[])];
 const destinations={
  headquarters:sharedUiState.route("platform",""),
  merchant:sharedUiState.route("staff",routeState.slug),
  guide:"./merchant-center.html",
  browse:"./directory.html?mode=search",
  customer:customerUrl(routeState.slug)||sharedUiState.route("customer",routeState.slug)
 };
 routeState.$("headlinks").innerHTML=links.map(([key,label])=>
  '<a href="'+esc(destinations[key])+'" class="'+((view==="platform"&&key==="headquarters")||(view==="staff"&&key==="merchant")||(view==="customer"&&key==="customer")?"active":"")+'">'+label+'</a>').join("");
 const brand=document.querySelector("header .brand");
 if(brand)brand.setAttribute("href",view==="platform"?destinations.headquarters:view==="staff"?destinations.merchant:"./home.html");
}

export function message(){return (feedbackState.err?'<div class="error" role="alert">'+esc(feedbackState.err)+'</div>':"")+(feedbackState.flash?'<div class="notice" role="status">'+esc(feedbackState.flash)+'</div>':"")}

export function renderHome(){
 return '<div class="hero"><h1>預約、取號、叫號一次完成</h1><p class="muted">從公開店家名單選擇服務，不需要另外建立店家帳號。</p></div>'+
 '<div class="grid3">'+
 '<a class="routecard" href="./directory.html?mode=search"><h2>搜尋店家</h2><p>尋找提供預約與取號的合作店家。</p><strong>開始搜尋 →</strong></a>'+
 '<a class="routecard" href="./directory.html?mode=queue"><h2>查看叫號</h2><p>掌握公開候位進度。</p><strong>查看候位 →</strong></a>'+
 '<a class="routecard" href="./directory.html?mode=mine"><h2>我的預約</h2><p>從 LINE 確認自己的預約與號碼牌。</p><strong>查看紀錄 →</strong></a></div>';
}

export function featureChecks(data={},prefix="feature"){
 return '<div class="grid">'+sharedUiState.features.map(f=>'<label class="checklist"><input type="checkbox" class="'+prefix+'" data-feature="'+f[0]+'" '+(data[f[0]]?"checked":"")+'> '+f[1]+'</label>').join("")+'</div>';
}

export function initializeSharedUi(){
sharedUiState.features=[["reservation","線上預約"],["queue","線上取號"],["calling","現場叫號"]];
sharedUiState.bookingPath=location.pathname.replace(/\/(?:saas|booking)\/(?:index\.html)?$/,"/booking/");
sharedUiState.route=(v,s=routeState.slug,tab="")=>sharedUiState.bookingPath+"?view="+encodeURIComponent(v)+(s?"&merchant="+encodeURIComponent(s):"")+(v==="customer"&&tab?"&tab="+encodeURIComponent(tab):"");
sharedUiState.lastStaffChange=null;
sharedUiState.actionFeedbackTimer=null;
}
