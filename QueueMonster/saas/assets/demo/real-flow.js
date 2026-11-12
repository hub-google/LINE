/* 排隊怪獸｜使用正式顧客／店家介面樣式的獨立操作模擬。
   僅保留本分頁記憶體資料，不載入 Supabase、LINE SDK 或正式 API。 */
(() => {
"use strict";
const $ = id => document.getElementById(id);
const esc = v => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const today = () => new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const later = n => {const d=new Date(Date.now()+n*86400000);return new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(d);};
const money = n => "NT$ "+Number(n).toLocaleString("zh-TW");
const pad = n => String(n).padStart(3,"0");
const names = {breakfast:"晨光早餐店",salon:"青禾風格美髮",repair:"快修手機維修中心",clinic:"安心家醫診所"};
const metadata = {breakfast:["早餐店","線上點餐"],salon:["美髮店","線上預約"],repair:["維修店","現場取號"],clinic:["診所","預約＋多診間叫號"]};
const modes = {breakfast:["order","mine"],salon:["reserve","mine"],repair:["queue","mine"],clinic:["reserve","queue","mine"]};
// Start each case in its real task flow; no intermediate store-home/menu click.
const primaryTab = {repair:"queue",breakfast:"order",salon:"reserve",clinic:"reserve"};
const tabs = {home:"首頁",order:"線上點餐",reserve:"線上預約",queue:"現場取號",mine:"我的服務"};
const staffTabs = {breakfast:"orders",salon:"bookings",repair:"queue",clinic:"bookings"};
const statusName = {NEW:"待接單",ACCEPTED:"已接單",PREPARING:"製作中",READY:"已完成待取",REJECTED:"店家已取消訂單",PICKED_UP:"已取餐",CONFIRMED:"已預約",CHECKED_IN:"已報到",COMPLETED:"已完成",CANCELLED:"已取消",NO_SHOW:"未到",WAITING:"候位中",CALLED:"已叫號",ARRIVED:"已到場",ADMITTED:"已進場",SERVING:"服務中",PASSED:"已過號",HOLD:"保留中"};
// Same Taiwanese area code and subscriber-length rules as the production booking form.
const landlineRules={"02":/^[235678]\d{7}$/,"03":/^[2-689]\d{6}$/,"037":/^[2-9]\d{5}$/,"04":/^(?:[23]\d{7}|[78]\d{6})$/,"049":/^[2-9]\d{6}$/,"05":/^[2-7]\d{6}$/,"06":/^[235679]\d{6}$/,"07":/^[2-9]\d{6}$/,"08":/^[478]\d{6}$/,"082":/^[2-57-9]\d{5}$/,"0826":/^6\d{4}$/,"0836":/^[2-9]\d{4}$/,"089":/^[2-9]\d{5}$/};
const landlineExamples={"02":"23456789","03":"2123456","037":"234567","04":"22345678","049":"2345678","05":"2345678","06":"2345678","07":"2345678","08":"4123456","082":"234567","0826":"61234","0836":"21234","089":"234567"};
function pickupPhone(){return draft.phoneType==="landline"?draft.phoneArea+draft.phoneLocal:draft.phone;}
function validPickupPhone(){return draft.phoneType==="mobile"?/^09\d{8}$/.test(draft.phone):landlineRules[draft.phoneArea]?.test(draft.phoneLocal)===true;}
function canPrepareDemo(o){
 if(o.immediate||!o.createdAt)return true;
 const at=Date.parse(o.time.replace(" ","T")+":00+08:00");
 return Number.isFinite(at)&&Date.now()>=at-20*60*1000;
}
function pickupWindowValid(){
 if(method==="immediate")return true; // Demo simulates an open shop, not the shop's actual live hours.
 if(!/^\d{4}-\d{2}-\d{2}$/.test(draft.day)||!/^\d{2}:\d{2}$/.test(draft.time))return false;
 const at=Date.parse(draft.day+"T"+draft.time+":00+08:00");
 return Number.isFinite(at)&&at>=Date.now()+20*60*1000&&draft.day<=later(7);
}
const food = [{id:"egg",name:"招牌蛋餅",price:40,description:"現點現做"},{id:"toast",name:"火腿蛋吐司",price:50,description:"早餐人氣商品"},{id:"tea",name:"奶茶",price:25,description:"中杯"},{id:"burger",name:"豬肉蛋漢堡",price:60,description:"經典早餐"}];
const make = () => ({
 breakfast:{orders:[{id:"B001",name:"王小美",phone:"0912000001",lines:[{name:"招牌蛋餅",qty:1,price:40}],time:"08:00",status:"NEW",total:40},{id:"B002",name:"林先生",phone:"0912000002",lines:[{name:"火腿蛋吐司",qty:2,price:50}],time:"08:30",status:"READY",total:100}],seq:3},
 salon:{bookings:[{id:"S001",name:"陳小姐",phone:"0912000003",unit:"Ava",service:"洗剪",time:"14:00",date:today(),status:"CONFIRMED"},{id:"S002",name:"林先生",phone:"0912000004",unit:"Mina",service:"染髮",time:"15:30",date:today(),status:"CHECKED_IN"}],seq:3},
 repair:{tickets:[{id:"R012",name:"張先生",service:"手機維修",status:"CALLED",party:1},{id:"R013",name:"李小姐",service:"電池更換",status:"WAITING",party:1},{id:"R014",name:"王先生",service:"檢測諮詢",status:"WAITING",party:1}],seq:15,current:"R012"},
 clinic:{bookings:[{id:"P001",name:"王小姐",phone:"0912000005",unit:"1診",service:"一般門診",date:today(),time:"09:30",status:"CONFIRMED",ticket:""},{id:"P002",name:"林先生",phone:"0912000006",unit:"2診",service:"一般門診",date:today(),time:"10:00",status:"CHECKED_IN",ticket:"C2-002"}],tickets:[{id:"C1-001",name:"陳先生",unit:"1診",status:"CALLED",party:1},{id:"C2-002",name:"林先生",unit:"2診",status:"WAITING",party:1}],seq:3,bookingSeq:3,current:{"1診":"C1-001","2診":""}}
});
let data=make(),scene="repair",role="customer",tab="queue",room="1診",review=false,receipt="",lastOwn="",newNotice="",notifyOpen=false,notes=[],cart={},method="scheduled",showBoard=false,bookingFilter="";
const ownedIds={breakfast:new Set(),salon:new Set(),repair:new Set(),clinic:new Set()};
let draft={name:"",phone:"",phoneType:"mobile",phoneArea:"02",phoneLocal:"",day:later(1),time:"08:00",slot:"14:00",qty:1,unit:"Ava",service:"洗剪",party:1,note:""};
function current(){return data[scene];}
function status(v){return '<span class="tag '+(["COMPLETED","CONFIRMED","ACCEPTED","READY","CHECKED_IN"].includes(v)?"ok":["REJECTED","PASSED","CANCELLED"].includes(v)?"warn":"")+'">'+esc(statusName[v]||v)+'</span>';}
function btn(label,action,style="outline",attrs=""){return '<button type="button" class="btn '+style+'" data-act="'+esc(action)+'" '+attrs+'>'+esc(label)+'</button>';}
function box(title,inner){return '<section class="card"><h2>'+title+'</h2>'+inner+'</section>';}
function field(label,id,value,type="text",attrs=""){return '<label for="'+id+'">'+esc(label)+'</label><input class="field" id="'+id+'" type="'+type+'" '+attrs+' value="'+esc(value)+'">';}
function sel(label,id,values,selected){return '<label for="'+id+'">'+esc(label)+'</label><select class="field" id="'+id+'">'+values.map(x=>{const v=Array.isArray(x)?x[0]:x;const name=Array.isArray(x)?x[1]:x;return '<option value="'+esc(v)+'" '+(v===selected?"selected":"")+'>'+esc(name)+'</option>';}).join("")+'</select>';}
function stat(label,value){return '<div class="stat"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>';}
function inset(content){return '<div class="inset" style="margin:12px 0">'+content+'</div>';}
function listline(content){return '<div class="listline">'+content+'</div>';}
function contact(){return '<p class="small">試用請勿輸入真實個資；可使用「示範顧客／0912345678」。</p><div class="grid" style="margin-top:12px"><div>'+field("預約姓名","contact-name",draft.name,"text",'maxlength="60" placeholder="請輸入姓名"')+'</div><div>'+field("聯絡手機","contact-phone",draft.phone,"tel",'maxlength="10" inputmode="numeric" placeholder="例如：0912345678（09 開頭，10 碼）"')+'</div></div>';}
function displayNum(tickets){return tickets.filter(t=>t.status==="WAITING").length;}
function getOwn(){return current().tickets?.find(t=>t.id===lastOwn)||current().bookings?.find(t=>t.id===lastOwn)||current().orders?.find(t=>t.id===lastOwn)||null;}
function displayShop(){return names[scene];}
function currentCalled(unit=null){return current().tickets?.find(t=>t.status==="CALLED"&&(!unit||t.unit===unit))?.id||"尚未叫號";}
function getCurrent(){return currentCalled(scene==="clinic"?room:null);}
function message(kind,title,lines){notes.unshift({kind,title,lines,shop:displayShop(),at:new Intl.DateTimeFormat("zh-TW",{timeZone:"Asia/Taipei",hour:"2-digit",minute:"2-digit"}).format(new Date())});notes=notes.slice(0,15);notifyOpen=true;}
function notifyFor(action,obj){
 const shop=displayShop();
 if(action==="order"){message("網站狀態示意","訂餐已送出",["店家："+shop,"訂單編號："+obj.id,"預約取餐："+obj.time,"品項："+obj.lines.map(x=>x.name+" × "+x.qty).join("、"),"金額："+money(obj.total),"請在「我的服務」查看後續進度。"]);return;}
 if(action==="booking"){message("LINE 通知示意","預約成功",["店家："+shop,"預約編號："+obj.id,"預約："+obj.date+" "+obj.time,"姓名："+obj.name,"服務："+obj.service+(obj.unit?"／"+obj.unit:""),"可返回「我的服務」查詢預約狀態。"]);return;}
 if(action==="ticket"){message("LINE 通知示意","取號成功",["店家："+shop,"我的號碼："+obj.id,"目前叫號："+(typeof getCurrent()==="string"?getCurrent():"請選診間"),"前方等候以即時進度為準。","請從「我的服務」查看叫號進度。"]);return;}
 if(action==="called"){message("LINE 叫號通知示意","輪到您的號碼",["店家："+shop,"叫號："+obj.id,(obj.unit?"服務窗口："+obj.unit:""),"請依現場人員指示報到。"]);return;}
 if(action==="order-status"){message("網站狀態示意","取餐訂單狀態更新",["店家："+shop,"訂單："+obj.id,"目前狀態："+(statusName[obj.status]||obj.status),"請查看「我的服務」中的最新進度。"]);return;}
 if(action==="checkin"){message("網站狀態示意","已完成報到",["店家："+shop,"預約："+obj.id,"候診號碼："+obj.ticket,"請留意叫號進度。"]);return;}
}

const appIcons={
 home:'<path d="M3 10.7 12 3l9 7.7V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
 reserve:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-13 5h3"/>',
 queue:'<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8m-8 5h8m-8 4h5"/>',
 order:'<path d="M5 4h14l-1.4 15H6.4zM3 4h18M9 4V2m6 2V2M9 10h6m-6 4h6"/>',
 mine:'<circle cx="12" cy="8" r="4"/><path d="M4.5 21c.6-4 3.1-6 7.5-6s6.9 2 7.5 6"/>',
 dashboard:'<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>',
 bookings:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m5 5 2 2 4-4"/>',
 orders:'<path d="M7 3h10l2 18-7-2-7 2zM9 9h6m-6 4h6"/>'
};
function mobileIcon(k){return '<svg class="mobile-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" aria-hidden="true">'+(appIcons[k]||appIcons.home)+'</svg>';}
function navItem(label,key,currentTab){
 return '<button type="button" class="side-item mobile-tab '+(key===currentTab?'active':'')+'" data-tab="'+key+'" aria-current="'+(key===currentTab?'page':'false')+'">'+mobileIcon(key)+'<span>'+esc(label)+'</span></button>';
}
function nav(){
 if(role==="customer")return modes[scene].map(key=>navItem(key==="mine"?"我的":tabs[key],key,tab)).join("");
 const items=scene==="breakfast"?[["dashboard","總覽"],["orders","取餐訂單"]]:
 scene==="salon"?[["dashboard","總覽"],["bookings","預約管理"]]:
 scene==="repair"?[["dashboard","總覽"],["queue","叫號管理"]]:
 [["dashboard","總覽"],["bookings","預約管理"],["queue","叫號管理"]];
 return items.map(([key,label])=>navItem(label,key,tab)).join("");
}
function customerOrder(){
 const orders=current().orders;
 const total=food.reduce((sum,i)=>sum+i.price*(cart[i.id]||0),0);
 const count=Object.values(cart).reduce((sum,n)=>sum+n,0);
 const shopMenus=food.map(i=>listline('<div style="flex:1;min-width:0"><strong>'+esc(i.name)+'</strong><p class="small">'+esc(i.description)+'</p><strong>'+money(i.price)+'</strong></div><div class="staff-actionbar">'+btn("－","qty","outline",'data-id="'+i.id+'" data-delta="-1" aria-label="減少 '+esc(i.name)+'"')+'<strong>'+Number(cart[i.id]||0)+'</strong>'+btn("＋","qty","outline",'data-id="'+i.id+'" data-delta="1" aria-label="增加 '+esc(i.name)+'"')+'</div>')).join("");
 const own=lastOwn&&orders.find(o=>o.id===lastOwn&&ownedIds[scene].has(o.id));
 const remaining=own?.createdAt?Math.max(0,Math.ceil((own.createdAt+15000-Date.now())/1000)):0;
 const canCancel=own?.status==="NEW"&&remaining>0;
 const contactInputs=sel("聯絡電話類型","customer-phone-type",[["mobile","手機"],["landline","市話"]],draft.phoneType)+
  (draft.phoneType==="mobile"?
   field("手機號碼","customer-phone",draft.phone,"tel",'inputmode="numeric" maxlength="10" placeholder="例如：0912345678（臺灣號碼，09 開頭、10 碼、半形數字）"'):
   '<div class="grid"><div>'+sel("市話區碼","customer-phone-area",Object.keys(landlineRules),draft.phoneArea)+'</div><div>'+
   field("市話號碼","customer-phone-local",draft.phoneLocal,"tel",'inputmode="numeric" maxlength="8" placeholder="例如：'+esc(landlineExamples[draft.phoneArea]||"23456789")+'（半形數字）"')+'</div></div>');
 const content='<p class="muted">以下是示範店家的菜單與時段，並非真實可訂名額。正式版依店家營業排程與時段容量檢查。</p>'+
 '<div class="staff-actionbar">'+btn("立即取餐","method",method==="immediate"?"primary":"outline",'data-value="immediate"')+btn("預約指定時間","method",method==="scheduled"?"primary":"outline",'data-value="scheduled"')+'</div>'+
 (method==="scheduled"?'<div class="grid"><div>'+field("取餐日期","pickup-day",draft.day,"date",'min="'+today()+'"')+'</div><div>'+sel("取餐時間","pickup-slot",["05:30","05:45","06:00","07:30","07:45","08:00","08:15","08:30","09:00"],draft.time)+'</div></div><p class="small">示範早餐店可預約時間；正式可選時段依店家設定。</p>':
 '<p class="notice">此處模擬營業中的立即取餐，製作時間由店家設定，並非實際營業狀態。</p>')+
 '<h3 style="margin-top:16px">選擇餐點</h3>'+shopMenus+
 '<div style="margin-top:12px">'+contactInputs+'</div>'+
 '<p class="small">不需填寫姓名，僅以電話及訂單編號辨識取餐訂單；試用請勿輸入真實個資。</p>'+
 '<div style="margin-top:12px">'+field("給店家的備註（最多 200 字）","customer-note",draft.note,"text",'maxlength="200" placeholder="例如：不要加辣"')+'</div>'+
 listline('<strong>共 '+count+' 份</strong><strong>'+money(total)+'</strong>')+
 '<p class="small">此處僅建立模擬訂單，不會線上收款，也不會寫入正式店家資料。</p>'+
 (review?inset('<strong>請核對送出前的訂餐內容</strong><p>聯絡電話：'+esc(pickupPhone())+'</p><p>預計取餐：'+esc(method==="scheduled"?draft.day+" "+draft.time:"立即取餐")+'</p><p>品項：'+food.filter(i=>cart[i.id]>0).map(i=>esc(i.name)+" × "+cart[i.id]).join("、")+'</p><p>總金額：'+money(total)+'</p><div class="staff-actionbar">'+btn("返回修改","review-back")+btn("確定送出訂單","order-submit","primary")+'</div>'):btn("下一步：確認訂單內容","review-order","primary full",count?'':'disabled'))+
 (own?inset('<strong>最新訂單 '+esc(own.id)+'</strong><p>目前狀態：'+status(own.status)+'</p>'+
 (canCancel?'<div data-demo-cancel-at="'+(own.createdAt+15000)+'"><p class="notice">還有 <strong class="demo-grace-seconds">'+remaining+'</strong> 秒可取消；之後店家才會收到訂單。</p>'+btn("取消訂單","cancel-order","outline",'data-id="'+esc(own.id)+'"')+'</div>':'')+
 btn("查看通知／進度示意","view-notice")):"");
 return box("線上點餐",content);
}
function customerReserve(){
 let d=current(),clinic=scene==="clinic";
 const units=clinic?["1診","2診"]:["Ava","Mina","Ken"];
 const chosen=units.includes(draft.unit)?draft.unit:units[0];
 const unitsHtml='<div class="unit-form-header"><h3>選擇服務窗口</h3><span>'+units.length+' 個選項</span></div><div class="unit-card-grid">'+units.map(u=>'<button type="button" class="unit-option '+(chosen===u?"selected":"")+'" data-act="unit" data-value="'+u+'"><span class="unit-option-copy"><strong>'+u+'</strong><small>'+(clinic?"上午門診 09:00–12:00":"預約服務 10:00–18:00")+'</small></span></button>').join("")+'</div>';
 const slots=clinic?["09:30","10:00","10:30","11:00"]:["10:00","11:00","14:00","15:30","16:00"];
 let slot=slots.includes(draft.slot)?draft.slot:slots[0];
 const remaining=s=>Math.max(0,(clinic?5:1)-d.bookings.filter(b=>b.unit===chosen&&b.date===draft.day&&b.time===s&&!["CANCELLED","COMPLETED","NO_SHOW"].includes(b.status)).reduce((n,b)=>n+Number(b.party||1),0));
 const slotHtml='<label>可預約時段（示範容量，非真實名額）</label><div class="slots">'+slots.map(s=>'<button type="button" class="slot '+(slot===s?"active":"")+'" data-act="slot" data-value="'+s+'" '+(remaining(s)?"":"disabled")+'>'+s+'<small>剩 '+remaining(s)+' 人</small></button>').join("")+'</div>';
 const service=sel("服務項目","reserve-service",clinic?["一般門診","慢性病追蹤"]:["洗剪","染髮","燙髮","護髮"],draft.service);
 const form=field("預約日期","booking-day",draft.day,"date")+(clinic?unitsHtml:unitsHtml)+slotHtml+service+'<div style="margin-top:12px">'+field("本次人數","party-size",draft.party,"number",'min="1" max="20"')+'</div>'+contact()+'<p class="small">預約是保留時段，'+(clinic?"預約報到後依各診間叫號順序等待。":"依服務安排到店。")+'</p>';
 const confirm=review?inset('<strong>確認預約資訊</strong><p>店家：'+esc(displayShop())+'</p><p>'+chosen+' · '+esc(draft.day)+' '+slot+'</p><p>姓名：'+esc(draft.name||"示範顧客")+'　'+Number(draft.party||1)+' 位</p>'):"";
 const recent=d.bookings.filter(x=>ownedIds[scene].has(x.id)).slice(0,6).map(x=>listline('<div><strong>'+esc(x.id)+' · '+esc(x.name)+'</strong><p class="small">'+esc(x.date)+' '+esc(x.time)+'　'+esc(x.unit)+'</p></div>'+status(x.status))).join("");
 return box(clinic?"選擇預約場次":"選擇預約日期與時間",'<p class="small">先選擇服務人員／診間，再選擇可預約時段。</p>'+form+confirm+'<div class="staff-actionbar">'+(review?btn("返回修改","review-back")+btn("確認送出預約","reserve-submit","primary full"):btn("下一步：確認預約","review-reserve","primary full"))+'</div>')+box("我的近期預約",recent||'<p class="muted">尚無預約紀錄</p>');
}
function customerQueue(){
 const d=current(),clinic=scene==="clinic",tickets=clinic?d.tickets.filter(t=>t.unit===room):d.tickets,linkedBooking=clinic?d.bookings.find(b=>b.id===lastOwn&&ownedIds[scene].has(b.id)):null,own=d.tickets.find(t=>ownedIds[scene].has(t.id)&&!["CANCELLED","COMPLETED"].includes(t.status)&&(t.id===lastOwn||(linkedBooking&&t.id===linkedBooking.ticket)))||d.tickets.find(t=>ownedIds[scene].has(t.id)&&!["CANCELLED","COMPLETED"].includes(t.status));
 const currentNo=getCurrent();
 const navRoom=clinic?'<div class="unit-form-header"><h3>選擇服務窗口</h3><span>2 個選項</span></div><div class="unit-card-grid">'+["1診","2診"].map(u=>'<button class="unit-option '+(room===u?"selected":"")+'" data-act="room" data-value="'+u+'"><span class="unit-option-copy"><strong>'+u+'</strong><small>上午診 09:00–12:00</small></span></button>').join("")+'</div>':"";
 const active=tickets.filter(t=>t.status==="WAITING");
 const ahead=own?active.findIndex(t=>t.id===own.id):-1;
 const progress='<div class="queue-board"><div class="queue-board-lead">現在叫到</div><div class="queue-board-current">'+esc(currentNo)+'</div><div class="queue-board-sub">請依現場叫號進度為準</div><div class="queue-board-grid"><div class="queue-board-stat"><span>我的號碼</span><strong>'+esc(own?.id||"—")+'</strong><small>'+(own?esc(statusName[own.status]||own.status):"尚未取號")+'</small></div><div class="queue-board-stat"><span>前面還有</span><strong>'+esc(ahead>=0?ahead+" 組":"—")+'</strong><small>依候位順序計算</small></div></div><p class="queue-board-note">'+(own?.status==="CALLED"?"已叫到您的號碼，請依現場人員指示報到。":"可在此查看候位狀態；展示資料會依店家端操作變更。")+'</p></div>';
 const ticket=own?'<div class="ticket">'+esc(own.id)+'</div><p>'+status(own.status)+'</p><p class="small">這張號碼牌代表一組</p><div class="staff-actionbar">'+btn("查看叫號進度","view-progress")+btn("查看通知示意","view-notice")+'</div>':
 clinic?'<p class="muted">診所預約後請先到現場報到。店家確認報到時，系統才會把病患加入指定診間候診隊列。</p><div class="staff-actionbar">'+btn("查看門診預約","go-reserve","primary full")+'</div>':
 '<p class="muted">現在可以在網站上取得號碼。</p><p>取號者：<strong>試用顧客</strong>（DEMO 已模擬 LINE 身分）</p>'+field("本次候位人數（1～20 人）","queue-party",draft.party,"number",'min="1" max="20" step="1"')+sel("服務需求","queue-service",["手機維修","電池更換","資料轉移","維修諮詢"],draft.service)+'<div style="margin-top:14px">'+btn("立即線上取號","take-number","primary full")+'</div>';
 return (clinic?box("選擇取號場次",navRoom+'<p class="small">若已預約，請先至店家端「預約管理」報到；報到後會加入對應診間叫號。</p>'):"")+'<div class="grid3" style="margin-bottom:16px">'+stat("目前叫號",currentNo)+stat("等候組數",active.length)+stat("我的號碼",own?.id||"—")+'</div>'+box("我的現場號碼",ticket)+(own?box("我的取號",progress):"");
}
function customerMine(){
 const d=current(),mine=ownedIds[scene];let elements=[];
 // A customer must never see other visitors' names, phone numbers or bookings.
 if(d.orders)elements=d.orders.filter(o=>mine.has(o.id)).map(o=>inset('<div class="listline"><strong>'+esc(o.id)+'</strong>'+status(o.status)+'</div><p class="small">取餐：'+esc(o.time)+'</p><p>'+esc(o.lines.map(i=>i.name+" × "+i.qty).join("、"))+'</p><strong>'+money(o.total)+'</strong>'));
 if(d.bookings)elements=d.bookings.filter(o=>mine.has(o.id)).map(o=>inset('<div class="listline"><strong>'+esc(o.id)+'　'+esc(o.name)+'</strong>'+status(o.status)+'</div><p class="small">'+esc(o.date)+' '+esc(o.time)+'　'+esc(o.unit)+(o.ticket?"　候診號碼 "+esc(o.ticket):"")+'</p>'));
 if(d.tickets)elements=elements.concat(d.tickets.filter(o=>mine.has(o.id)).map(o=>inset('<div class="listline"><strong>'+esc(o.id)+'　'+esc(o.name)+'</strong>'+status(o.status)+'</div><p class="small">'+esc(o.unit||o.service||"")+'</p>')));
 return '<section class="customer-service-nav"><div class="customer-service-title"><h2>我的服務</h2><p class="small">只顯示本次試用顧客建立的預約、取號及訂餐紀錄</p></div></section>'+
 box("我的紀錄",elements.join("")||'<p class="muted">尚無本次試用顧客的紀錄，請先完成預約、取號或點餐。</p>')+
 (d.tickets?box("目前叫號進度",scene==="clinic"?"1診："+esc(currentCalled("1診"))+" / 2診："+esc(currentCalled("2診")):"目前："+esc(currentCalled())):"");
}
function staffOrder(){
 const d=current(),visible=d.orders.filter(o=>!o.createdAt||Date.now()-o.createdAt>=15000);
 const active=visible.filter(o=>!["REJECTED","PICKED_UP","CANCELLED"].includes(o.status));
 const old=visible.filter(o=>["REJECTED","PICKED_UP","CANCELLED"].includes(o.status));
 const waiting=d.orders.length-visible.length;
 const choices=o=>[[o.status==="READY"?"確認已取餐":"接單",o.status==="READY"?"PICKED_UP":"ACCEPTED"],["已完成待取","READY"],["取消訂單","REJECTED"]];
 const card=o=>inset('<div class="listline"><strong>'+esc(o.id)+'</strong><strong>'+esc(statusName[o.status]||o.status)+'</strong></div>'+
  '<p class="small"><strong>約定取餐 '+esc(o.time)+'</strong>（'+(o.immediate?"立即":"指定時間")+'）</p>'+
  '<p class="small">聯絡電話：'+esc(o.phone)+'</p><p>'+esc(o.lines.map(x=>x.name+" × "+x.qty).join("、"))+'</p><p class="small">'+money(o.total)+'</p>'+
  '<div class="staff-actionbar" role="group" aria-label="選擇訂單狀態">'+choices(o).map(([name,v])=>btn(name,"order-status",v===o.status?"primary":"outline",'data-id="'+esc(o.id)+'" data-value="'+v+'"'+(v===o.status?" disabled":""))).join("")+'</div>'+
  '<details><summary class="small">其他操作（誤操作更正）</summary><div class="staff-actionbar">'+
  (o.status==="ACCEPTED"?btn("開始製作","order-status","outline",'data-id="'+esc(o.id)+'" data-value="PREPARING"'+(canPrepareDemo(o)?"":' disabled title="尚未到建議製作時間"')):"")+
  (o.status!=="CANCELLED"?btn("更正為顧客取消","order-status","outline",'data-id="'+esc(o.id)+'" data-value="CANCELLED"'):"")+
  (o.status!=="NEW"?btn("恢復待接單","order-status","outline",'data-id="'+esc(o.id)+'" data-value="NEW"'):"")+'</div></details>');
 return box("取餐訂單管理",'<p class="small">新訂單送出後 15 秒內由顧客自行取消，倒數結束才顯示給店家。主操作為接單、已完成待取及取消訂單；狀態可更正。</p>'+
 (waiting?'<p class="small">目前 '+waiting+' 筆新訂單仍在顧客取消期，倒數結束後自動顯示。</p>':"")+
 '<p><strong>待處理 '+active.length+' 筆</strong></p>'+active.map(card).join("")+
 '<details open class="pickup-history-panel"><summary>歷史訂單（'+old.length+' 筆，可更正狀態）</summary>'+old.map(card).join("")+'</details>');
}
function statusPicker(kind,item){
 const choices=kind==="reservation"?[["CONFIRMED","已預約"],["CHECKED_IN","已報到"],["COMPLETED","已完成"],["NO_SHOW","未到"],["CANCELLED","已取消"]]:
  [["WAITING","候位中"],["HOLD","保留中"],["CALLED","已叫號"],["PASSED","已過號"],["COMPLETED","已完成"]];
 const option=([v,label])=>'<label class="staff-choice"><input type="radio" name="'+kind+"-"+esc(item.id)+'" data-status-kind="'+kind+'" data-id="'+esc(item.id)+'" value="'+v+'" '+(item.status===v?"checked":"")+'><span>'+label+'</span></label>';
 const extra=kind==="ticket"?'<details class="ticket-secondary-status"><summary>其他操作</summary><div class="staff-picker-secondary">'+option(["CANCELLED","取消號碼牌"])+'</div></details>':"";
 return '<fieldset class="staff-picker"><legend>點選狀態即儲存（可重新選擇修正）</legend>'+choices.map(option).join("")+'</fieldset>'+extra;
}
function bookingCard(o){
 return '<article class="staff-record"><div class="staff-record-head"><div><div class="staff-record-title">預約 '+esc(o.id)+'　'+esc(o.date)+'　'+esc(o.time)+'　'+esc(o.name)+'</div><div class="small">'+esc(o.unit)+' · '+esc(o.service)+'</div><div class="small">預約人數 '+esc(o.party||1)+' 位 · 聯絡電話：'+esc(o.phone)+'</div>'+(o.ticket?'<div class="small">已連動候診號碼：'+esc(o.ticket)+'</div>':"")+'</div>'+status(o.status)+'</div>'+statusPicker("reservation",o)+'</article>';
}
function staffBookings(){
 const d=current(),open=d.bookings.filter(o=>!["COMPLETED","CANCELLED","NO_SHOW"].includes(o.status)),done=d.bookings.filter(o=>!open.includes(o));
 const query=bookingFilter.trim().toLocaleLowerCase("zh-TW");
 const matches=o=>!query||[o.id,o.name,o.service,o.unit,o.phone].some(v=>String(v||"").toLocaleLowerCase("zh-TW").includes(query));
 const shownOpen=open.filter(matches),shownDone=done.filter(matches);
 return (scene==="clinic"?box("預約報到與叫號連動說明",'<p class="small">預約完成報到後，加入指定診間的候診隊列；重複報到不會再產生第二張號碼牌。</p>'):"")+
 box("搜尋與篩選預約",'<p class="small">只篩選本情境的示範資料；上方統計仍以所有示範預約計算。</p>'+field("搜尋預約編號、姓名或服務","staff-search",bookingFilter,"search",'placeholder="輸入關鍵字"')+'<div class="staff-actionbar">'+btn("清除篩選","clear-filter","outline")+'</div>')+
 '<div class="grid4" style="margin-bottom:16px">'+stat("待處理預約",open.length)+stat("待報到",open.filter(o=>o.status==="CONFIRMED").length)+stat("已報到未結案",open.filter(o=>o.status==="CHECKED_IN").length)+stat("已處理預約",done.length)+'</div>'+
 box("待處理預約（"+shownOpen.length+" 筆）",shownOpen.map(bookingCard).join("")||'<p class="muted">沒有符合篩選條件的待處理預約。</p>')+
 box("已處理預約（"+shownDone.length+" 筆，可修正）",shownDone.map(bookingCard).join("")||'<p class="muted">沒有符合篩選條件的已處理預約。</p>');
}
function ticketCard(o){
 return '<article class="staff-record"><div class="staff-record-head"><div><div class="staff-record-title">'+esc(o.id)+'　'+esc(o.name)+'</div><div class="small">'+esc(o.unit||o.service||"")+" · "+esc(o.party||1)+' 人／組 · '+(scene==="clinic"?"預約報到":"現場取號")+'</div></div>'+status(o.status)+'</div>'+statusPicker("ticket",o)+'</article>';
}
function staffQueue(){
 const d=current(),clinic=scene==="clinic",items=d.tickets.filter(t=>!clinic||t.unit===room),active=items.find(t=>t.status==="CALLED"),waiting=items.filter(t=>t.status==="WAITING"),passed=items.filter(t=>t.status==="PASSED"),held=items.filter(t=>t.status==="HOLD"),completed=items.filter(t=>t.status==="COMPLETED"),done=items.filter(t=>["COMPLETED","CANCELLED"].includes(t.status));
 const selector=clinic?box("按場次獨立叫號",'<p class="small">各場次獨立叫號，所有已處理紀錄仍可查閱。</p>'+sel("操作隊列","staff-room",[["1診","1診 · 上午診 09:00–12:00"],["2診","2診 · 上午診 09:00–12:00"]],room)):"";
 return selector+'<div class="grid4" style="margin-bottom:16px">'+stat("正在叫號",active?.id||"—")+stat("候位中",waiting.length)+stat("已過號",passed.length)+stat("保留中",held.length)+stat("已完成",completed.length)+'</div>'+
 box("叫號操作",'<p class="muted">號碼狀態可直接勾選並更正；叫下一位時，前一個仍為「已叫號」的號碼才會自動轉為「已過號」。已完成的號碼不受影響。</p><div class="staff-actionbar">'+btn("叫下一位","next","primary",waiting.length?"":"disabled")+btn("再叫一次","recall","outline",active?"":"disabled")+btn(showBoard?"收起看板示意":"查看看板示意","board","outline")+'</div><p class="staff-help">已發出的 LINE 訊息無法撤回；這裡只展示模擬通知。</p>')+
 (showBoard?box("叫號看板示意",'<div class="queue-board"><div class="queue-board-lead">'+(clinic?esc(room)+" · ":"")+'現在叫到</div><div class="queue-board-current">'+esc(active?.id||"尚未叫號")+'</div><p class="small">這是本頁記憶體中的示意進度，不連接真實門市。</p></div>'):"")+
 box("未結案號碼牌（"+(items.length-done.length)+" 筆）",items.filter(t=>!done.includes(t)).map(ticketCard).join("")||'<p class="muted">尚無未結案號碼牌。</p>')+
 box("已處理號碼牌（"+done.length+" 筆）",done.map(ticketCard).join("")||'<p class="muted">尚無已處理號碼牌。</p>');
}
function dashboard(){
 const d=current();return '<div class="grid4">'+stat("今日預約",d.bookings?.length||0)+stat("現場候位",d.tickets?.filter(t=>t.status==="WAITING").length||0)+stat("取餐訂單",d.orders?.length||0)+stat("目前叫號",scene==="clinic"?"多診間":currentCalled())+'</div>'+box("今日待辦",'<p class="muted">請由左側「預約管理」、「叫號管理」或「取餐訂單」切換此頁的模擬操作畫面。</p>');
}
function renderNotice(){
 const el=$("notifications");if(!el)return;
 // Desktop explains the interactive scenario beside the full-width app; phone UI stays unchanged.
 const guideMap={
  repair:["現場排隊，3 步就完成","以顧客端領取號碼","切換店家端，依序叫到你的號碼","查看叫號進度與通知示意"],
  breakfast:["點餐到接單，一次走完","選餐點、數量和預計取餐時間","確認送出訂單，體驗 15 秒取消期","切換店家端接單或改成已完成待取"],
  salon:["從預約到報到","選擇設計師、日期與時段","送出預約後切換店家端","調整報到或完成狀態"],
  clinic:["診所的預約與叫號","選擇診間及預約時段","切換店家端確認報到","進入叫號管理，呼叫下一位"]
 };
 const g=guideMap[scene];
 const guideHtml='<section class="demo-desktop-guide"><span class="demo-guide-eyebrow">互動試用教學</span><h3>'+esc(g[0])+'</h3><ol class="demo-guide-steps">'+g.slice(1).map((step,i)=>'<li><span>'+(i+1)+'</span>'+esc(step)+'</li>').join("")+'</ol></section>';
 const desktopPreview=typeof window!=="undefined"&&typeof window.matchMedia==="function"&&window.matchMedia("(min-width: 901px)").matches;
 const showMessages=notifyOpen||desktopPreview;
 el.classList.toggle("is-open",notifyOpen);
 el.setAttribute?.("aria-expanded",String(notifyOpen));
 el.innerHTML=guideHtml+'<section class="demo-desktop-notice-card"><div class="demo-notice-head"><div><strong>顧客收到什麼？</strong><p>LINE 訊息與網站狀態模擬</p></div>'+btn(notifyOpen?"收起":"查看通知","toggle-notify","outline")+'</div>'+
 (showMessages?'<div class="demo-line-phone"><div class="demo-phone-header"><span class="demo-phone-dot"></span>LINE 對話示意 · '+esc(displayShop())+'</div><div class="demo-phone-body">'+(notes.length?notes.slice(0,4).map(n=>'<div class="demo-message"><div class="demo-message-source">'+esc(n.kind)+' · '+esc(n.at)+'</div><strong>'+esc(n.title)+'</strong><div>'+n.lines.map(line=>'<p>'+esc(line)+'</p>').join("")+'</div></div>').join(""):'<div class="demo-message"><strong>尚無新訊息</strong><p>顧客完成訂餐、預約或取號後，這裡會顯示可能看到的確認內容。</p></div>')+'</div></div>':'')+
 '<p class="demo-notice-disclaimer">這是示範內容，不是真實 LINE 推播。正式環境是否發送、發送哪些訊息，依 LINE 授權、店家 OA 設定及後端功能而定；網站內的紀錄與進度仍可查詢。</p></section>';
}
let lastViewSignature="";
function render(){
 const viewport=$("root")?.querySelector?.(".content");
 const prevScroll=viewport?.scrollTop||0;
 const viewSignature=scene+"|"+role+"|"+tab;
 document.body.dataset.portal=role==="customer"?"customer":"staff";
 const d=current(),title=displayShop();
 $("demo-scene").textContent=metadata[scene][0]+"｜"+metadata[scene][1];
 document.querySelectorAll("[data-scene]").forEach(el=>{el.classList.toggle("active",el.dataset.scene===scene);el.setAttribute("aria-pressed",String(el.dataset.scene===scene));});
 document.querySelectorAll("[data-role]").forEach(el=>{el.classList.toggle("active",el.dataset.role===role);el.setAttribute("aria-pressed",String(el.dataset.role===role));});
 let body="";
 if(role==="customer")body=tab==="order"?customerOrder():tab==="reserve"?customerReserve():tab==="queue"?customerQueue():customerMine();
 else body=tab==="orders"?staffOrder():tab==="bookings"?staffBookings():tab==="queue"?staffQueue():tab==="dashboard"?dashboard():box("試用導覽",'<p class="muted">請切換「預約管理」、「叫號管理」或「取餐訂單」體驗日常作業。其他店家設定不會連到正式資料。</p>');

 const headerName=role==="customer"?title:title+" · 管理中心";
 const modeName=role==="customer"?({home:"門市首頁",order:"線上點餐",reserve:"線上預約",queue:"現場取號",mine:"我的服務"}[tab]||"門市服務"):
 ({dashboard:"今日營運",bookings:"預約管理",queue:"叫號管理",orders:"取餐訂單"}[tab]||"店家管理");
 const avatar='<span class="mobile-shop-avatar">'+esc(title.slice(0,2))+'</span>';
 const heading='<div class="mobile-merchant-head">'+avatar+'<div class="mobile-merchant-copy"><span class="mobile-merchant-overline">'+(role==="customer"?"排隊怪獸 · 線上服務":"排隊怪獸 · 店家管理")+'</span><strong>'+esc(headerName)+'</strong></div>'+
 '<button type="button" class="mobile-bell" data-act="view-notice" aria-label="查看通知示意">'+mobileIcon("queue")+(notes.length?'<span class="mobile-bell-count">'+notes.length+'</span>':'')+'</button></div>';
 $("root").innerHTML='<div class="toolbar customer-shop-toolbar">'+heading+'</div>'+
 '<div class="mobile-screen-heading"><div class="mobile-section-eyebrow">'+(role==="customer"?"CUSTOMER EXPERIENCE":"MERCHANT OPERATIONS")+'</div><h2>'+esc(modeName)+'</h2><p>'+(role==="customer"?"即時模擬體驗 · 不需登入":"資料同步演示 · 所有狀態可修正")+'</p></div>'+
 '<div class="layout '+(role==="customer"?"customer-layout":"merchant-layout")+'"><section class="content">'+
 (newNotice?'<div class="notice" role="status">'+esc(newNotice)+'</div>':'')+body+
 '<div class="customer-platform-credit">由 <a href="./home.html">排隊怪獸 Queuing Monster</a> 提供</div></section></div>'+
 '<nav class="mobile-bottom-nav" aria-label="'+(role==="customer"?"顧客功能":"店家功能")+'">'+nav()+'</nav>';

 if(lastViewSignature===viewSignature&&$("root")?.querySelector){const scroller=$("root").querySelector(".content");if(scroller)scroller.scrollTop=prevScroll;}
 lastViewSignature=viewSignature;
 renderNotice();
}
function resetDraft(){draft={name:"",phone:"",phoneType:"mobile",phoneArea:"02",phoneLocal:"",day:later(1),time:"08:00",slot:scene==="clinic"?"09:30":"14:00",unit:scene==="clinic"?"1診":"Ava",service:scene==="clinic"?"一般門診":scene==="repair"?"手機維修":"洗剪",party:1,note:""};cart={};review=false;receipt="";}
function setScene(s){scene=s;role="customer";tab=primaryTab[s];room="1診";lastOwn="";
 const previous=[...(data[s].tickets||[]),...(data[s].bookings||[]),...(data[s].orders||[])].filter(x=>ownedIds[s].has(x.id));
 if(previous.length)lastOwn=previous[previous.length-1].id;
 newNotice="";notes=[];notifyOpen=false;showBoard=false;bookingFilter="";resetDraft();render();}
function inform(s){newNotice=s;render();}
function noticeItem(obj,kind){notifyFor(kind,obj);render();}
function find(type,id){return current()[type]?.find(o=>o.id===id);}
function contactReady(){return !!draft.name.trim()&&/^09\d{8}$/.test(draft.phone);}
function requireContact(){if(contactReady())return true;inform("請先輸入預約姓名及有效的 09 開頭十碼手機號碼（試用可用 0912345678）。");return false;}
document.addEventListener("click",e=>{
 const sceneBtn=e.target.closest("[data-scene]");if(sceneBtn){setScene(sceneBtn.dataset.scene);return;}
 const roleBtn=e.target.closest("[data-role]");if(roleBtn){role=roleBtn.dataset.role;tab=role==="customer"?primaryTab[scene]:staffTabs[scene];newNotice="";review=false;notifyOpen=false;render();return;}
 const navBtn=e.target.closest("[data-tab]");if(navBtn){tab=navBtn.dataset.tab;newNotice="";review=false;render();return;}
 const button=e.target.closest("[data-act]");if(!button)return;
 const a=button.dataset.act,id=button.dataset.id,value=button.dataset.value,d=current();
 if(a==="go-reserve"){tab="reserve";inform("請先完成預約；報到後會出現在候診名單");return;}
  if(a==="clear-filter"){bookingFilter="";render();return;}
 if(a==="reset"){data[scene]=make()[scene];lastOwn="";notes=[];ownedIds[scene].clear();showBoard=false;bookingFilter="";newNotice="已重設本產業的示範資料";resetDraft();render();return;}
 if(a==="toggle-notify"){notifyOpen=!notifyOpen;renderNotice();if(notifyOpen) $("notifications")?.scrollIntoView?.({behavior:"smooth",block:"nearest"});return;}
 if(a==="view-notice"){notifyOpen=true;renderNotice();$("notifications")?.scrollIntoView?.({behavior:"smooth",block:"nearest"});return;}
 if(a==="qty"){cart[id]=Math.max(0,Math.min(30,(cart[id]||0)+Number(button.dataset.delta)));review=false;render();return;}
 if(a==="method"){method=value;review=false;render();return;}
 if(a==="review-order"){if(!Object.values(cart).some(n=>n>0)){inform("請至少選擇一項餐點");return;}if(!validPickupPhone()){inform("請填寫有效的臺灣手機或市話（手機 09 開頭 10 碼；市話依區碼檢核）。");return;}if(!pickupWindowValid()){inform("取餐日期或時段不在示範可預約範圍，請重新選擇。");return;}review=true;inform("請核對訂餐內容後再送出");return;}
 if(a==="review-back"){review=false;inform("已返回修改");return;}
 if(a==="order-submit"){
  if(!validPickupPhone()||!pickupWindowValid()){review=false;inform("聯絡電話、取餐日期或時間不正確，請返回確認。");return;}
  const lines=food.filter(i=>cart[i.id]>0).map(i=>({name:i.name,qty:cart[i.id],price:i.price}));if(!lines.length)return;
  const o={id:"B"+pad(d.seq++),phone:pickupPhone(),lines,time:method==="immediate"?"立即":draft.day+" "+draft.time,immediate:method==="immediate",createdAt:Date.now(),status:"NEW",total:lines.reduce((sum,i)=>sum+i.qty*i.price,0)};
  d.orders.unshift(o);lastOwn=o.id;ownedIds[scene].add(o.id);cart={};review=false;notifyFor("order",o);tab="order";
  inform("已送出示範訂單 "+o.id+"。15 秒內可取消，之後店家才會收到。");return;
 }
  if(a==="unit"){draft.unit=value;if(scene==="clinic")room=value;review=false;render();return;}
 if(a==="slot"){draft.slot=value;review=false;render();return;}
 if(a==="review-reserve"){if(!requireContact())return;review=true;inform("請確認預約資訊");return;}
 if(a==="reserve-submit"){
  if(!requireContact())return;
  const slots=scene==="clinic"?["09:30","10:00","10:30","11:00"]:["10:00","11:00","14:00","15:30","16:00"];let slot=slots.includes(draft.slot)?draft.slot:slots[0];
  const bookings=d.bookings;
   const requested=Number(draft.party);
   if(!Number.isInteger(requested)||requested<1||requested>20){review=false;inform("請輸入 1～20 人的預約人數。");return;}
   const at=Date.parse(draft.day+"T"+slot+":00+08:00");
   if(!Number.isFinite(at)||at<Date.now()){review=false;inform("這個預約時段已過期，請重新選擇日期或時間。");return;}
   const taken=bookings.filter(x=>x.unit===draft.unit&&x.date===draft.day&&x.time===slot&&!["CANCELLED","COMPLETED","NO_SHOW"].includes(x.status)).reduce((n,x)=>n+Number(x.party||1),0);
   if(taken+requested>(scene==="clinic"?5:1)){review=false;inform("此時段可預約名額不足，請選擇其他時段或服務窗口。");return;}
  const o={id:(scene==="clinic"?"P":"S")+pad(scene==="clinic"?d.bookingSeq++:d.seq++),name:draft.name||"示範顧客",phone:draft.phone||"（試用未填）",unit:draft.unit,service:draft.service,date:draft.day,time:slot,party:Number(draft.party),status:"CONFIRMED",ticket:""};
  bookings.unshift(o);lastOwn=o.id;ownedIds[scene].add(o.id);review=false;notifyFor("booking",o);tab="reserve";inform("示範預約 "+o.id+" 已建立；可到店家端「預約管理」報到。");return;
 }
 if(a==="take-number"){
  if(scene==="clinic"){inform("診所取號需先由店家進行預約報到。");return;}
  if(d.tickets.some(t=>ownedIds[scene].has(t.id)&&!["COMPLETED","CANCELLED"].includes(t.status))){inform("已有有效號碼牌，不可重複取號。");return;}
  if(!Number.isInteger(Number(draft.party))||Number(draft.party)<1||Number(draft.party)>20){inform("候位人數請輸入 1～20 人");return;}
  const o={id:"R"+pad(d.seq++),name:draft.name||"示範顧客",service:draft.service||"手機維修",status:"WAITING",party:Number(draft.party)||1};d.tickets.push(o);lastOwn=o.id;ownedIds[scene].add(o.id);notifyFor("ticket",o);inform("已取得示範號碼 "+o.id+"，切換店家端體驗叫號。");return;
 }
 if(a==="room"){room=value;draft.unit=value;render();return;}
 if(a==="cancel-order"){const o=find("orders",id);
   if(!o||!ownedIds[scene].has(id)||o.status!=="NEW"||!o.createdAt||Date.now()-o.createdAt>=15000){inform("此訂單已超過 15 秒取消期限，無法由顧客自行取消。");return;}
   o.status="CANCELLED";notifyFor("order-status",o);inform("示範訂單 "+o.id+" 已取消。");return;
  }
  if(a==="order-status"){const o=find("orders",id);
   if(!o||o.createdAt&&Date.now()-o.createdAt<15000){inform("此訂單仍在顧客取消期，店家暫時無法操作。");return;}
   if(o.status===value)return;if(value==="PREPARING"&&!canPrepareDemo(o)){inform("尚未到建議製作時間，無法開始製作。");return;}o.status=value;notifyFor("order-status",o);
   inform(o.id+" 已更新為 "+statusName[value]+"；顧客可從我的服務查看狀態。");return;
  }
 if(a==="next"){
   const ts=scene==="clinic"?d.tickets.filter(t=>t.unit===room):d.tickets;
   const t=ts.find(x=>x.status==="WAITING");
   if(!t){inform("目前沒有候位中的號碼，現有叫號狀態不變。");return;}
   ts.filter(x=>x.status==="CALLED").forEach(x=>{x.status="PASSED";});
   t.status="CALLED";notifyFor("called",t);
   inform("已叫號 "+t.id+"；前一位若仍在叫號，已自動標為「已過號」。");return;
  }
  if(a==="recall"){
   const ts=scene==="clinic"?d.tickets.filter(t=>t.unit===room):d.tickets;
   const active=ts.find(t=>t.status==="CALLED");
   if(!active){inform("目前沒有可重叫的號碼。");return;}
   notifyFor("called",active);inform("已重叫 "+active.id+"。");return;
  }
  if(a==="board"){showBoard=!showBoard;render();return;}
});
document.addEventListener("change",e=>{
 const el=e.target;
 if(el.matches("[data-status-kind]")){
  const kind=el.dataset.statusKind,d=current(),o=find(kind==="reservation"?"bookings":"tickets",el.dataset.id);if(!o)return;
  const previous=o.status,next=el.value;
  if(next===previous){render();return;}
  if(kind==="ticket"){
   // Same server rules as private.so_ticket_set_status_core.
   if(next==="HOLD"&&!["WAITING","CANCELLED"].includes(previous)){inform("只能保留候位中或已取消的號碼。");return;}
   if(previous==="HOLD"&&!["WAITING","CANCELLED"].includes(next)){inform("保留中的號碼只能恢復候位或取消。");return;}
   if(next==="CALLED"&&d.tickets.some(t=>t.id!==o.id&&t.status==="CALLED"&&(scene!=="clinic"||t.unit===o.unit))){
    inform("這個隊列已經有尚未確認的叫號；請先處理目前號碼，或使用「叫下一位」自動過號。");return;
   }
  }
  o.status=next;
  if(kind==="reservation"&&scene==="clinic"&&next==="CHECKED_IN"&&!o.ticket){
   const id="C"+(o.unit==="1診"?"1":"2")+"-"+pad(d.seq++);
   o.ticket=id;d.tickets.push({id,name:o.name,unit:o.unit,party:1,status:"WAITING"});
   if(ownedIds[scene].has(o.id)){ownedIds[scene].add(id);lastOwn=id;}
   notifyFor("checkin",o);
  }
  if(kind==="ticket"){
   if(next==="CALLED")notifyFor("called",o);
   if(next==="WAITING"&&["HOLD","PASSED"].includes(previous)){
    // Returned tickets normally rejoin at the end of the sample queue.
    d.tickets.splice(d.tickets.findIndex(t=>t.id===o.id),1);
    d.tickets.push(o);
   }
  }
  inform(o.id+" 狀態已變更為 "+statusName[next]+"；已處理紀錄仍可重新修改。");return;
 }
  if(el.id==="staff-room"){room=el.value;render();return;}
 if(el.id==="customer-phone-type"){draft.phoneType=el.value;review=false;render();return;}
  if(el.id==="customer-phone-area"){draft.phoneArea=el.value;draft.phoneLocal="";review=false;render();return;}
  const models={"pickup-day":"day","pickup-slot":"time","booking-day":"day","party-size":"party","queue-party":"party","queue-service":"service","reserve-service":"service","customer-phone":"phone","customer-phone-local":"phoneLocal","customer-note":"note","contact-name":"name","contact-phone":"phone"};
 if(models[el.id])draft[models[el.id]]=el.value;
});
document.addEventListener("input",e=>{if(e.target.id==="staff-search"){
   const at=e.target.selectionStart;bookingFilter=e.target.value;render();
   const el=$("staff-search");el?.focus();if(Number.isInteger(at))el?.setSelectionRange(at,at);
   return;
  }const models={"customer-phone":"phone","customer-phone-local":"phoneLocal","customer-note":"note","contact-name":"name","contact-phone":"phone","party-size":"party","queue-party":"party","booking-day":"day"};if(models[e.target.id])draft[models[e.target.id]]=e.target.value;});
// Only update local countdown text; this demo never polls any API.
setInterval(()=>{
 document.querySelectorAll("[data-demo-cancel-at]").forEach(el=>{
  const remaining=Math.max(0,Math.ceil((Number(el.dataset.demoCancelAt)-Date.now())/1000));
  const clock=el.querySelector(".demo-grace-seconds");if(clock)clock.textContent=String(remaining);
  if(!remaining)el.querySelectorAll("button").forEach(b=>{b.disabled=true;});
 });
 if(scene==="breakfast"&&role==="staff"&&tab==="orders"){
  const newlyReady=current().orders.filter(o=>o.createdAt&&!o.staffShown&&Date.now()-o.createdAt>=15000);
  if(newlyReady.length){newlyReady.forEach(o=>{o.staffShown=true;});render();}
 }
},1000);
resetDraft();render();
})();
