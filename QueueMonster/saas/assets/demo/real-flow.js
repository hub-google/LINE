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
const modes = {breakfast:["home","order","mine"],salon:["home","reserve","mine"],repair:["home","queue","mine"],clinic:["home","reserve","queue","mine"]};
const tabs = {home:"首頁",order:"線上點餐",reserve:"線上預約",queue:"現場取號",mine:"我的服務"};
const staffTabs = {breakfast:"orders",salon:"bookings",repair:"queue",clinic:"bookings"};
const statusName = {NEW:"待接單",ACCEPTED:"已接單",READY:"待取",REJECTED:"已拒單",PICKED_UP:"已完成",CONFIRMED:"已預約",CHECKED_IN:"已報到",COMPLETED:"已完成",CANCELLED:"已取消",NO_SHOW:"未到",WAITING:"候位中",CALLED:"已叫號",ARRIVED:"已到場",ADMITTED:"已進場",SERVING:"服務中",PASSED:"已過號",HOLD:"保留中"};
const food = [{id:"egg",name:"招牌蛋餅",price:40,description:"現點現做"},{id:"toast",name:"火腿蛋吐司",price:50,description:"早餐人氣商品"},{id:"tea",name:"奶茶",price:25,description:"中杯"},{id:"burger",name:"豬肉蛋漢堡",price:60,description:"經典早餐"}];
const make = () => ({
 breakfast:{orders:[{id:"B001",name:"王小美",phone:"0912000001",lines:[{name:"招牌蛋餅",qty:1,price:40}],time:"08:00",status:"NEW",total:40},{id:"B002",name:"林先生",phone:"0912000002",lines:[{name:"火腿蛋吐司",qty:2,price:50}],time:"08:30",status:"READY",total:100}],seq:3},
 salon:{bookings:[{id:"S001",name:"陳小姐",phone:"0912000003",unit:"Ava",service:"洗剪",time:"14:00",date:today(),status:"CONFIRMED"},{id:"S002",name:"林先生",phone:"0912000004",unit:"Mina",service:"染髮",time:"15:30",date:today(),status:"CHECKED_IN"}],seq:3},
 repair:{tickets:[{id:"R012",name:"張先生",service:"手機維修",status:"CALLED",party:1},{id:"R013",name:"李小姐",service:"電池更換",status:"WAITING",party:1},{id:"R014",name:"王先生",service:"檢測諮詢",status:"WAITING",party:1}],seq:15,current:"R012"},
 clinic:{bookings:[{id:"P001",name:"王小姐",phone:"0912000005",unit:"1診",service:"一般門診",date:today(),time:"09:30",status:"CONFIRMED",ticket:""},{id:"P002",name:"林先生",phone:"0912000006",unit:"2診",service:"一般門診",date:today(),time:"10:00",status:"CHECKED_IN",ticket:"C2-002"}],tickets:[{id:"C1-001",name:"陳先生",unit:"1診",status:"CALLED",party:1},{id:"C2-002",name:"林先生",unit:"2診",status:"WAITING",party:1}],seq:3,bookingSeq:3,current:{"1診":"C1-001","2診":""}}
});
let data=make(),scene="breakfast",role="customer",tab="home",room="1診",review=false,receipt="",lastOwn="",newNotice="",notifyOpen=true,notes=[],cart={},method="scheduled";
let draft={name:"",phone:"",day:today(),time:"08:00",slot:"14:00",qty:1,unit:"Ava",service:"洗剪",party:1,note:""};
function current(){return data[scene];}
function status(v){return '<span class="tag '+(["COMPLETED","CONFIRMED","ACCEPTED","READY","CHECKED_IN"].includes(v)?"ok":["REJECTED","PASSED","CANCELLED"].includes(v)?"warn":"")+'">'+esc(statusName[v]||v)+'</span>';}
function btn(label,action,style="outline",attrs=""){return '<button type="button" class="btn '+style+'" data-act="'+esc(action)+'" '+attrs+'>'+esc(label)+'</button>';}
function box(title,inner){return '<section class="card"><h2>'+title+'</h2>'+inner+'</section>';}
function field(label,id,value,type="text",attrs=""){return '<label for="'+id+'">'+esc(label)+'</label><input class="field" id="'+id+'" type="'+type+'" '+attrs+' value="'+esc(value)+'">';}
function sel(label,id,values,selected){return '<label for="'+id+'">'+esc(label)+'</label><select class="field" id="'+id+'">'+values.map(x=>{const v=Array.isArray(x)?x[0]:x;const name=Array.isArray(x)?x[1]:x;return '<option value="'+esc(v)+'" '+(v===selected?"selected":"")+'>'+esc(name)+'</option>';}).join("")+'</select>';}
function stat(label,value){return '<div class="stat"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>';}
function inset(content){return '<div class="inset" style="margin:12px 0">'+content+'</div>';}
function listline(content){return '<div class="listline">'+content+'</div>';}
function contact(){return '<p class="small">試用請勿輸入真實個資；可使用「示範顧客／0912345678」。</p><div class="grid" style="margin-top:12px"><div>'+field("預約姓名","contact-name",draft.name,"text",'maxlength="60" placeholder="請輸入姓名"')+'</div><div>'+field("聯絡手機","contact-phone",draft.phone,"tel",'maxlength="15" placeholder="例如：0912345678"')+'</div></div>';}
function displayNum(tickets){return tickets.filter(t=>t.status==="WAITING").length;}
function getOwn(){return current().tickets?.find(t=>t.id===lastOwn)||current().bookings?.find(t=>t.id===lastOwn)||current().orders?.find(t=>t.id===lastOwn)||null;}
function displayShop(){return names[scene];}
function getCurrent(){const d=current();return d.current||"尚未叫號";}
function message(kind,title,lines){notes.unshift({kind,title,lines,shop:displayShop(),at:new Intl.DateTimeFormat("zh-TW",{timeZone:"Asia/Taipei",hour:"2-digit",minute:"2-digit"}).format(new Date())});notes=notes.slice(0,15);notifyOpen=true;}
function notifyFor(action,obj){
 const shop=displayShop();
 if(action==="order"){message("LINE 通知示意","訂餐已送出",["店家："+shop,"訂單編號："+obj.id,"預約取餐："+obj.time,"品項："+obj.lines.map(x=>x.name+" × "+x.qty).join("、"),"金額："+money(obj.total),"請在「我的服務」查看後續進度。"]);return;}
 if(action==="booking"){message("LINE 通知示意","預約成功",["店家："+shop,"預約編號："+obj.id,"預約："+obj.date+" "+obj.time,"姓名："+obj.name,"服務："+obj.service+(obj.unit?"／"+obj.unit:""),"可返回「我的服務」查詢或取消。"]);return;}
 if(action==="ticket"){message("LINE 通知示意","取號成功",["店家："+shop,"我的號碼："+obj.id,"目前叫號："+(typeof getCurrent()==="string"?getCurrent():"請選診間"),"前方等候以即時進度為準。","請從「我的取號」查看叫號進度。"]);return;}
 if(action==="called"){message("LINE 叫號通知示意","輪到您的號碼",["店家："+shop,"叫號："+obj.id,(obj.unit?"服務窗口："+obj.unit:""),"請依現場人員指示報到。"]);return;}
 if(action==="order-status"){message("狀態通知示意","取餐訂單狀態更新",["店家："+shop,"訂單："+obj.id,"目前狀態："+(statusName[obj.status]||obj.status),"請查看「我的服務」中的最新進度。"]);return;}
 if(action==="checkin"){message("網站狀態示意","已完成報到",["店家："+shop,"預約："+obj.id,"候診號碼："+obj.ticket,"請留意叫號進度。"]);return;}
}
function navItem(label,key,currentTab){return '<button type="button" class="side-item '+(key===currentTab?"active":"")+'" data-tab="'+key+'">'+label+'</button>';}
function nav(){
 if(role==="customer")return modes[scene].map(key=>navItem(tabs[key],key,tab)).join("");
 return navItem("設定","settings",tab)+'<div class="staff-side-label">日常作業</div>'+navItem("工作台","dashboard",tab)+navItem("預約管理","bookings",tab)+navItem("叫號管理","queue",tab)+navItem("取餐訂單","orders",tab)+navItem("預約日曆","calendar",tab)+'<div class="staff-side-label">營運管理</div>'+navItem("營運分析","analytics",tab)+navItem("顧客管理","customers",tab)+navItem("員工管理","members",tab);
}
function landing(){
 const cards=modes[scene].filter(x=>x!=="home").map(t=>'<button class="routecard" data-tab="'+t+'"><h2>'+tabs[t]+'</h2><p class="muted">'+({order:"查看菜單、選擇取餐時段並訂餐",reserve:"選擇日期與服務時段",queue:"立即取得現場候位號碼",mine:"查看我的預約、號碼及訂餐進度"}[t])+'</p><strong>立即體驗 →</strong></button>').join("");
 const stats=scene==="breakfast"?'<div class="grid3">'+stat("未處理訂單",current().orders.filter(o=>o.status==="NEW").length)+stat("待取餐",current().orders.filter(o=>o.status==="READY").length)+stat("我的訂單",current().orders.length)+'</div>':
 scene==="salon"?'<div class="grid3">'+stat("預約總數",current().bookings.length)+stat("已報到",current().bookings.filter(o=>o.status==="CHECKED_IN").length)+stat("我的預約",lastOwn||"—")+'</div>':
 '<div class="grid3">'+stat("目前叫號",scene==="clinic"?current().current[room]||"尚未叫號":current().current)+stat("現場候位",displayNum(current().tickets)+" 組")+stat("我的號碼",lastOwn||"—")+'</div>';
 return '<p class="demo-line-bypass">試用模式已略過 LINE 身分授權。正式顧客需依店家 LINE 設定完成授權。</p>'+stats+'<div class="grid demo-home-cards">'+cards+'</div>';
}
function customerOrder(){
 const orders=current().orders;
 const total=food.reduce((sum,i)=>sum+i.price*(cart[i.id]||0),0);
 const count=Object.values(cart).reduce((sum,n)=>sum+n,0);
 const shopMenus=food.map(i=>listline('<div style="flex:1;min-width:0"><strong>'+esc(i.name)+'</strong><p class="small">'+esc(i.description)+'</p><strong>'+money(i.price)+'</strong></div><div class="staff-actionbar">'+btn("－","qty","outline",'data-id="'+i.id+'" data-delta="-1" aria-label="減少 '+esc(i.name)+'"')+'<strong>'+Number(cart[i.id]||0)+'</strong>'+btn("＋","qty","outline",'data-id="'+i.id+'" data-delta="1" aria-label="增加 '+esc(i.name)+'"')+'</div>')).join("");
 const own=lastOwn&&orders.find(o=>o.id===lastOwn);
 const content='<p class="muted">直接使用本店上架菜單，送出後可在此追蹤接單與取餐進度。</p>'+
 '<div class="staff-actionbar">'+btn("立即取餐","method",method==="immediate"?"primary":"outline",'data-value="immediate"')+btn("預約指定時間","method",method==="scheduled"?"primary":"outline",'data-value="scheduled"')+'</div>'+
 (method==="scheduled"?'<div class="grid"><div>'+field("取餐日期","pickup-day",draft.day,"date")+'</div><div>'+sel("取餐時間","pickup-slot",["07:30","07:45","08:00","08:15","08:30","09:00"],draft.time)+'</div></div>':'<p class="notice">預估製作時間約 15 分鐘，實際以店家接單進度為準。</p>')+
 '<h3 style="margin-top:16px">選擇餐點</h3>'+shopMenus+
 '<div class="grid" style="margin-top:12px"><div>'+field("取餐姓名","customer-name",draft.name,"text",'maxlength="60" placeholder="請輸入姓名"')+'</div><div>'+field("聯絡電話","customer-phone",draft.phone,"tel",'placeholder="請輸入手機號碼"')+'</div></div>'+
 '<div style="margin-top:12px">'+field("給店家的備註（最多 200 字）","customer-note",draft.note,"text",'maxlength="200" placeholder="例如：不要加辣"')+'</div>'+
 listline('<strong>共 '+count+' 份</strong><strong>'+money(total)+'</strong>')+
 '<p class="small">此處僅建立訂單，不會線上收款；正式訂單依店家設定。</p>'+
 (review?inset('<strong>請核對送出前的訂餐內容</strong><p>取餐人：'+esc(draft.name||"示範顧客")+'</p><p>預計取餐：'+esc(method==="scheduled"?draft.day+" "+draft.time:"立即取餐")+'</p><p>品項：'+food.filter(i=>cart[i.id]>0).map(i=>esc(i.name)+" × "+cart[i.id]).join("、")+'</p><p>總金額：'+money(total)+'</p><div class="staff-actionbar">'+btn("返回修改","review-back")+btn("確定送出訂單","order-submit","primary")+'</div>'):btn("下一步：確認訂單內容","review-order","primary full",count?'':'disabled'))+
 (own?inset('<strong>最新訂單 '+esc(own.id)+'</strong><p>目前狀態：'+status(own.status)+'</p>'+btn("查看訊息示意","view-notice")):"");
 return box("線上點餐",content);
}
function customerReserve(){
 let d=current(),clinic=scene==="clinic";
 const units=clinic?["1診","2診"]:["Ava","Mina","Ken"];
 const chosen=units.includes(draft.unit)?draft.unit:units[0];
 const unitsHtml='<div class="unit-form-header"><h3>選擇服務窗口</h3><span>'+units.length+' 個選項</span></div><div class="unit-card-grid">'+units.map(u=>'<button type="button" class="unit-option '+(chosen===u?"selected":"")+'" data-act="unit" data-value="'+u+'"><span class="unit-option-copy"><strong>'+u+'</strong><small>'+(clinic?"上午門診 09:00–12:00":"預約服務 10:00–18:00")+'</small></span></button>').join("")+'</div>';
 const slots=clinic?["09:30","10:00","10:30","11:00"]:["10:00","11:00","14:00","15:30","16:00"];
 let slot=slots.includes(draft.slot)?draft.slot:slots[0];
 const slotHtml='<label>可預約時段</label><div class="slots">'+slots.map(s=>'<button type="button" class="slot '+(slot===s?"active":"")+'" data-act="slot" data-value="'+s+'">'+s+'<small>剩 5 位</small></button>').join("")+'</div>';
 const service=sel("服務項目","reserve-service",clinic?["一般門診","慢性病追蹤"]:["洗剪","染髮","燙髮","護髮"],draft.service);
 const form=field("預約日期","booking-day",draft.day,"date")+(clinic?unitsHtml:unitsHtml)+slotHtml+service+'<div style="margin-top:12px">'+field("本次人數","party-size",draft.party,"number",'min="1" max="20"')+'</div>'+contact()+'<p class="small">預約是保留時段，'+(clinic?"預約報到後依各診間叫號順序等待。":"依服務安排到店。")+'</p>';
 const confirm=review?inset('<strong>確認預約資訊</strong><p>店家：'+esc(displayShop())+'</p><p>'+chosen+' · '+esc(draft.day)+' '+slot+'</p><p>姓名：'+esc(draft.name||"示範顧客")+'　'+Number(draft.party||1)+' 位</p>'):"";
 const recent=d.bookings.slice(0,6).map(x=>listline('<div><strong>'+esc(x.id)+' · '+esc(x.name)+'</strong><p class="small">'+esc(x.date)+' '+esc(x.time)+'　'+esc(x.unit)+'</p></div>'+status(x.status))).join("");
 return box(clinic?"選擇預約場次":"選擇預約日期與時間",'<p class="small">先選擇服務人員／診間，再選擇可預約時段。</p>'+form+confirm+'<div class="staff-actionbar">'+(review?btn("返回修改","review-back")+btn("確認送出預約","reserve-submit","primary full"):btn("下一步：確認預約","review-reserve","primary full"))+'</div>')+box("我的近期預約",recent||'<p class="muted">尚無預約紀錄</p>');
}
function customerQueue(){
 const d=current(),clinic=scene==="clinic",tickets=clinic?d.tickets.filter(t=>t.unit===room):d.tickets,own=lastOwn&&d.tickets.find(t=>t.id===lastOwn);
 const currentNo=clinic?d.current[room]||"尚未叫號":d.current;
 const navRoom=clinic?'<div class="unit-form-header"><h3>選擇服務窗口</h3><span>2 個選項</span></div><div class="unit-card-grid">'+["1診","2診"].map(u=>'<button class="unit-option '+(room===u?"selected":"")+'" data-act="room" data-value="'+u+'"><span class="unit-option-copy"><strong>'+u+'</strong><small>上午診 09:00–12:00</small></span></button>').join("")+'</div>':"";
 const active=tickets.filter(t=>t.status==="WAITING");
 const ahead=own?active.findIndex(t=>t.id===own.id):-1;
 const progress='<div class="queue-board"><div class="queue-board-lead">現在叫到</div><div class="queue-board-current">'+esc(currentNo)+'</div><div class="queue-board-sub">請依現場叫號進度為準</div><div class="queue-board-grid"><div class="queue-board-stat"><span>我的號碼</span><strong>'+esc(own?.id||"—")+'</strong><small>'+(own?esc(statusName[own.status]||own.status):"尚未取號")+'</small></div><div class="queue-board-stat"><span>前面還有</span><strong>'+esc(ahead>=0?ahead+" 組":"—")+'</strong><small>依候位順序計算</small></div></div><p class="queue-board-note">'+(own?.status==="CALLED"?"已叫到您的號碼，請依現場人員指示報到。":"可在此查看候位狀態；展示資料會依店家端操作變更。")+'</p></div>';
 const ticket=own?'<div class="ticket">'+esc(own.id)+'</div><p>'+status(own.status)+'</p><p class="small">這張號碼牌代表一組</p><div class="staff-actionbar">'+btn("查看叫號進度","view-progress")+btn("查看通知示意","view-notice")+'</div>':
 '<p class="muted">現在可以在網站上取得號碼。</p><p>取號者：<strong>試用顧客</strong>（DEMO 已模擬 LINE 身分）</p>'+field("本次候位人數（1～20 人）","queue-party",draft.party,"number",'min="1" max="20" step="1"')+(clinic?'<p class="small">請先選上方診間，現場病患報到後由店家處理。</p>':sel("服務需求","queue-service",["手機維修","電池更換","資料轉移","維修諮詢"],draft.service))+'<div style="margin-top:14px">'+btn("立即線上取號","take-number","primary full")+'</div>';
 return (clinic?box("選擇取號場次",navRoom+'<p class="small">若已預約，請先至店家端「預約管理」報到；報到後會加入對應診間叫號。</p>'):"")+'<div class="grid3" style="margin-bottom:16px">'+stat("目前叫號",currentNo)+stat("等候組數",active.length)+stat("我的號碼",own?.id||"—")+'</div>'+box("我的現場號碼",ticket)+(own?box("我的取號",progress):"");
}
function customerMine(){
 const d=current();let elements=[];
 if(d.orders)elements=d.orders.map(o=>inset('<div class="listline"><strong>'+esc(o.id)+'</strong>'+status(o.status)+'</div><p class="small">取餐：'+esc(o.time)+'</p><p>'+esc(o.lines.map(i=>i.name+" × "+i.qty).join("、"))+'</p><strong>'+money(o.total)+'</strong>'));
 if(d.bookings)elements=d.bookings.map(o=>inset('<div class="listline"><strong>'+esc(o.id)+'　'+esc(o.name)+'</strong>'+status(o.status)+'</div><p class="small">'+esc(o.date)+' '+esc(o.time)+'　'+esc(o.unit)+(o.ticket?"　候診號碼 "+esc(o.ticket):"")+'</p>'));
 if(d.tickets)elements=elements.concat(d.tickets.map(o=>inset('<div class="listline"><strong>'+esc(o.id)+'　'+esc(o.name)+'</strong>'+status(o.status)+'</div><p class="small">'+esc(o.unit||o.service||"")+'</p>')));
 return '<section class="customer-service-nav"><div class="customer-service-title"><h2>我的服務</h2><p class="small">查看叫號進度及過往紀錄</p></div><nav class="customer-service-switcher"><button class="active">我的紀錄</button></nav></section>'+box("我的紀錄",elements.join("")||'<p class="muted">尚無紀錄。</p>')+(d.tickets?box("目前叫號進度",scene==="clinic"?"1診："+esc(d.current["1診"]||"尚未叫號")+" / 2診："+esc(d.current["2診"]||"尚未叫號"):"目前："+esc(d.current)):"");
}
function staffOrder(){
 const d=current(),active=d.orders.filter(o=>!["REJECTED","PICKED_UP"].includes(o.status)),old=d.orders.filter(o=>["REJECTED","PICKED_UP"].includes(o.status));
 const choices=[["接單","ACCEPTED"],["待取","READY"],["拒單","REJECTED"],["已完成","PICKED_UP"]];
 const card=o=>inset('<div class="listline"><strong>'+esc(o.id)+'</strong><strong>'+esc(statusName[o.status])+'</strong></div><p class="small"><strong>約定取餐 '+esc(o.time)+'</strong>（指定時間）</p><p class="small">顧客：'+esc(o.name)+' · '+esc(o.phone)+'</p><p>'+esc(o.lines.map(x=>x.name+" × "+x.qty).join("、"))+'</p><p class="small">'+money(o.total)+'</p><div class="staff-actionbar" role="group" aria-label="選擇訂單狀態">'+choices.map(([name,v])=>btn(name,"order-status",v===o.status?"primary":"outline",'data-id="'+esc(o.id)+'" data-value="'+v+'"')).join("")+'</div><details><summary class="small">其他操作（取消／恢復待接單）</summary><div class="staff-actionbar">'+btn("恢復待接單","order-status","outline",'data-id="'+esc(o.id)+'" data-value="NEW"')+'</div></details>');
 return box("取餐訂單管理",'<p class="small">依約定取餐時間排序。可切換接單、待取、拒單或已完成，已結束的訂單也能重新更正。</p><p><strong>待處理 '+active.length+' 筆</strong></p>'+active.map(card).join("")+'<details open class="pickup-history-panel"><summary>歷史訂單（'+old.length+' 筆，可更正狀態）</summary>'+old.map(card).join("")+'</details>');
}
function statusPicker(kind,item){
 const choices=kind==="reservation"?[["CONFIRMED","已預約"],["CHECKED_IN","已報到"],["COMPLETED","已完成"],["NO_SHOW","未到"],["CANCELLED","已取消"]]:
 [["WAITING","候位中"],["HOLD","保留中"],["CALLED","已叫號"],["ARRIVED","已到場"],["ADMITTED","已進場"],["SERVING","服務中"],["COMPLETED","已完成"],["PASSED","已過號"],["CANCELLED","已取消"]];
 return '<fieldset class="staff-picker"><legend>點選狀態即儲存（可重新選擇修正）</legend>'+choices.map(([v,label])=>'<label class="staff-choice"><input type="radio" name="'+kind+"-"+esc(item.id)+'" data-status-kind="'+kind+'" data-id="'+esc(item.id)+'" value="'+v+'" '+(item.status===v?"checked":"")+'><span>'+label+'</span></label>').join("")+'</fieldset>';
}
function bookingCard(o){
 return '<article class="staff-record"><div class="staff-record-head"><div><div class="staff-record-title">預約 '+esc(o.id)+'　'+esc(o.date)+'　'+esc(o.time)+'　'+esc(o.name)+'</div><div class="small">'+esc(o.unit)+' · '+esc(o.service)+'</div><div class="small">預約人數 1 位 · 聯絡電話：'+esc(o.phone)+'</div>'+(o.ticket?'<div class="small">已連動候診號碼：'+esc(o.ticket)+'</div>':"")+'</div>'+status(o.status)+'</div>'+statusPicker("reservation",o)+'</article>';
}
function staffBookings(){
 const d=current(),open=d.bookings.filter(o=>!["COMPLETED","CANCELLED","NO_SHOW"].includes(o.status)),done=d.bookings.filter(o=>!open.includes(o));
 return (scene==="clinic"?box("預約報到與叫號連動說明",'<p class="small">預約報到後建立同一場次的叫號號碼，重複報到不會重複發號。</p>'):"")+
 box("搜尋與篩選預約",'<p class="small">搜尋目前已載入的示範預約紀錄。</p>'+field("搜尋預約編號、姓名或服務","staff-search","","search",'placeholder="輸入關鍵字"')+'<div class="staff-actionbar">'+btn("清除篩選","clear-filter","outline")+'</div>')+
 '<div class="grid4" style="margin-bottom:16px">'+stat("待處理預約",open.length)+stat("待報到",open.filter(o=>o.status==="CONFIRMED").length)+stat("已報到未結案",open.filter(o=>o.status==="CHECKED_IN").length)+stat("已處理預約",done.length)+'</div>'+
 box("待處理預約（"+open.length+" 筆）",open.map(bookingCard).join("")||'<p class="muted">目前沒有未結案預約。</p>')+
 box("已處理預約（"+done.length+" 筆，可修正）",done.map(bookingCard).join("")||'<p class="muted">尚無已處理預約。</p>');
}
function ticketCard(o){
 return '<article class="staff-record"><div class="staff-record-head"><div><div class="staff-record-title">'+esc(o.id)+'　'+esc(o.name)+'</div><div class="small">'+esc(o.unit||o.service||"")+" · "+esc(o.party||1)+' 人／組 · '+(scene==="clinic"?"預約報到":"現場取號")+'</div></div>'+status(o.status)+'</div>'+statusPicker("ticket",o)+'</article>';
}
function staffQueue(){
 const d=current(),clinic=scene==="clinic",items=d.tickets.filter(t=>!clinic||t.unit===room),active=items.find(t=>t.status==="CALLED"),waiting=items.filter(t=>t.status==="WAITING"),passed=items.filter(t=>t.status==="PASSED"),done=items.filter(t=>["COMPLETED","CANCELLED"].includes(t.status));
 const selector=clinic?box("按場次獨立叫號",'<p class="small">各場次獨立叫號，所有已處理紀錄仍可查閱。</p>'+sel("操作隊列","staff-room",[["1診","1診 · 上午診 09:00–12:00"],["2診","2診 · 上午診 09:00–12:00"]],room)):"";
 return selector+'<div class="grid4" style="margin-bottom:16px">'+stat("正在叫號",active?.id||"—")+stat("候位中",waiting.length)+stat("已過號",passed.length)+stat("已結束",done.length)+'</div>'+
 box("叫號操作",'<p class="muted">號碼狀態可直接勾選與更正。標記已到場、已進場、服務中、已過號等狀態後，可以繼續叫下一位。</p><div class="staff-actionbar">'+btn("叫下一位","next","primary",waiting.length?"":"disabled")+btn("再叫一次","recall","outline",active?"":"disabled")+btn("電視即時叫號看板","board","outline")+'</div><p class="staff-help">已發出的 LINE 訊息無法撤回；這裡只展示模擬通知。</p>')+
 box("未結案號碼牌（"+(items.length-done.length)+" 筆）",items.filter(t=>!done.includes(t)).map(ticketCard).join("")||'<p class="muted">尚無未結案號碼牌。</p>')+
 box("已結束號碼牌（"+done.length+" 筆）",done.map(ticketCard).join("")||'<p class="muted">尚無結案紀錄。</p>');
}
function dashboard(){
 const d=current();return '<div class="grid4">'+stat("今日預約",d.bookings?.length||0)+stat("現場候位",d.tickets?.filter(t=>t.status==="WAITING").length||0)+stat("取餐訂單",d.orders?.length||0)+stat("目前叫號",scene==="clinic"?"多診間":d.current||"—")+'</div>'+box("今日待辦",'<p class="muted">請由左側「預約管理」、「叫號管理」或「取餐訂單」切換真實系統的作業版型。</p>');
}
function renderNotice(){
 const el=$("notifications");if(!el)return;
 el.innerHTML='<div class="demo-notice-head"><div><strong>顧客收到什麼？</strong><p>LINE 訊息與網站狀態模擬</p></div>'+btn(notifyOpen?"收起":"查看通知","toggle-notify","outline")+'</div>'+
 (notifyOpen?'<div class="demo-line-phone"><div class="demo-phone-header"><span class="demo-phone-dot"></span>LINE 對話示意 · '+esc(displayShop())+'</div><div class="demo-phone-body">'+(notes.length?notes.slice(0,4).map(n=>'<div class="demo-message"><div class="demo-message-source">'+esc(n.kind)+' · '+esc(n.at)+'</div><strong>'+esc(n.title)+'</strong><div>'+n.lines.map(line=>'<p>'+esc(line)+'</p>').join("")+'</div></div>').join(""):'<div class="demo-message"><strong>尚無新訊息</strong><p>顧客完成訂餐、預約或取號後，這裡會顯示可能看到的確認內容。</p></div>')+'</div></div>':'')+
 '<p class="demo-notice-disclaimer">這是示範內容，不是真實 LINE 推播。正式環境是否發送、發送哪些訊息，依 LINE 授權、店家 OA 設定及後端功能而定；網站內的紀錄與進度仍可查詢。</p>';
}
function render(){
 document.body.dataset.portal=role==="customer"?"customer":"staff";
 const d=current(),title=displayShop();
 $("demo-scene").textContent=metadata[scene][0]+"｜"+metadata[scene][1];
 document.querySelectorAll("[data-scene]").forEach(el=>{el.classList.toggle("active",el.dataset.scene===scene);el.setAttribute("aria-pressed",String(el.dataset.scene===scene));});
 document.querySelectorAll("[data-role]").forEach(el=>{el.classList.toggle("active",el.dataset.role===role);el.setAttribute("aria-pressed",String(el.dataset.role===role));});
 let body="";
 if(role==="customer")body=tab==="home"?landing():tab==="order"?customerOrder():tab==="reserve"?customerReserve():tab==="queue"?customerQueue():customerMine();
 else body=tab==="orders"?staffOrder():tab==="bookings"?staffBookings():tab==="queue"?staffQueue():tab==="dashboard"?dashboard():box("試用導覽",'<p class="muted">請切換「預約管理」、「叫號管理」或「取餐訂單」體驗日常作業。其他店家設定不會連到正式資料。</p>');
 const heading=role==="customer"?'<div class="customer-shop-identity"><div class="customer-shop-avatar"><span class="customer-shop-avatar-fallback">'+esc(title.slice(0,2))+'</span></div><div class="customer-shop-title"><div class="customer-shop-overline">店家預約與取號</div><h1>'+esc(title)+'</h1><div class="muted">預約、取號與點餐・示範資料</div></div></div>':'<div><div class="eyebrow">排隊怪獸 · 門市管理</div><h1>'+esc(title)+'</h1><div class="muted">企業員工營運後台・示範資料</div></div>';
 $("root").innerHTML='<div class="toolbar '+(role==="customer"?"customer-shop-toolbar":"")+'">'+heading+'</div><div class="layout '+(role==="customer"?"customer-layout":"")+'"><aside>'+nav()+'</aside><section class="content">'+(newNotice?'<div class="notice" role="status">'+esc(newNotice)+'</div>':"")+body+'<div class="customer-platform-credit">預約及取號服務由 <a href="./home.html">排隊怪獸</a> 提供</div></section></div>';
 renderNotice();
}
function resetDraft(){draft={name:"",phone:"",day:today(),time:"08:00",slot:scene==="clinic"?"09:30":"14:00",unit:scene==="clinic"?"1診":"Ava",service:scene==="clinic"?"一般門診":scene==="repair"?"手機維修":"洗剪",party:1,note:""};cart={};review=false;receipt="";}
function setScene(s){scene=s;role="customer";tab="home";room="1診";lastOwn="";newNotice="";notes=[];resetDraft();render();}
function inform(s){newNotice=s;render();}
function noticeItem(obj,kind){notifyFor(kind,obj);render();}
function find(type,id){return current()[type]?.find(o=>o.id===id);}
function contactReady(){return !!draft.name.trim()&&/^09\d{8}$/.test(String(draft.phone).replace(/[\s-]/g,""));}
function requireContact(){if(contactReady())return true;inform("請先輸入預約姓名及有效的 09 開頭十碼手機號碼（試用可用 0912345678）。");return false;}
document.addEventListener("click",e=>{
 const sceneBtn=e.target.closest("[data-scene]");if(sceneBtn){setScene(sceneBtn.dataset.scene);return;}
 const roleBtn=e.target.closest("[data-role]");if(roleBtn){role=roleBtn.dataset.role;tab=role==="customer"?"home":staffTabs[scene];newNotice="";review=false;render();return;}
 const navBtn=e.target.closest("[data-tab]");if(navBtn){tab=navBtn.dataset.tab;newNotice="";review=false;render();return;}
 const button=e.target.closest("[data-act]");if(!button)return;
 const a=button.dataset.act,id=button.dataset.id,value=button.dataset.value,d=current();
 if(a==="reset"){data[scene]=make()[scene];lastOwn="";notes=[];newNotice="已重設本產業的示範資料";resetDraft();render();return;}
 if(a==="toggle-notify"){notifyOpen=!notifyOpen;renderNotice();return;}
 if(a==="view-notice"){notifyOpen=true;renderNotice();$("notifications").scrollIntoView({behavior:"smooth",block:"nearest"});return;}
 if(a==="qty"){cart[id]=Math.max(0,Math.min(30,(cart[id]||0)+Number(button.dataset.delta)));review=false;render();return;}
 if(a==="method"){method=value;review=false;render();return;}
 if(a==="review-order"){if(!Object.values(cart).some(n=>n>0)){inform("請至少選擇一項餐點");return;}if(!requireContact())return;review=true;inform("請核對訂餐內容後再送出");return;}
 if(a==="review-back"){review=false;inform("已返回修改");return;}
 if(a==="order-submit"){
  if(!requireContact())return;
  const lines=food.filter(i=>cart[i.id]>0).map(i=>({name:i.name,qty:cart[i.id],price:i.price}));if(!lines.length)return;
  const o={id:"B"+pad(d.seq++),name:draft.name||"示範顧客",phone:draft.phone||"（試用未填）",lines,time:method==="immediate"?"立即":draft.time,status:"NEW",total:lines.reduce((s,i)=>s+i.qty*i.price,0)};
  d.orders.unshift(o);lastOwn=o.id;cart={};review=false;notifyFor("order",o);tab="order";inform("已送出示範訂單 "+o.id+"，右側顯示客人可能收到的訊息。");return;
 }
 if(a==="unit"){draft.unit=value;if(scene==="clinic")room=value;review=false;render();return;}
 if(a==="slot"){draft.slot=value;review=false;render();return;}
 if(a==="review-reserve"){if(!requireContact())return;review=true;inform("請確認預約資訊");return;}
 if(a==="reserve-submit"){
  if(!requireContact())return;
  const slots=scene==="clinic"?["09:30","10:00","10:30","11:00"]:["10:00","11:00","14:00","15:30","16:00"];let slot=slots.includes(draft.slot)?draft.slot:slots[0];
  const bookings=d.bookings;if(bookings.some(x=>x.unit===draft.unit&&x.date===draft.day&&x.time===slot&&!["CANCELLED","COMPLETED"].includes(x.status))){review=false;inform("此時段已被預約，請選擇其他時段或服務窗口");return;}
  const o={id:(scene==="clinic"?"P":"S")+pad(scene==="clinic"?d.bookingSeq++:d.seq++),name:draft.name||"示範顧客",phone:draft.phone||"（試用未填）",unit:draft.unit,service:draft.service,date:draft.day,time:slot,status:"CONFIRMED",ticket:""};
  bookings.unshift(o);lastOwn=o.id;review=false;notifyFor("booking",o);tab="reserve";inform("示範預約 "+o.id+" 已建立；可到店家端「預約管理」報到。");return;
 }
 if(a==="take-number"){
  if(!Number.isInteger(Number(draft.party))||Number(draft.party)<1||Number(draft.party)>20){inform("候位人數請輸入 1～20 人");return;}
  const o={id:"R"+pad(d.seq++),name:draft.name||"示範顧客",service:draft.service||"手機維修",status:"WAITING",party:Number(draft.party)||1};d.tickets.push(o);lastOwn=o.id;notifyFor("ticket",o);inform("已取得示範號碼 "+o.id+"，切換店家端體驗叫號。");return;
 }
 if(a==="room"){room=value;draft.unit=value;render();return;}
 if(a==="order-status"){const o=find("orders",id);if(o){o.status=value;notifyFor("order-status",o);inform(o.id+" 已更新為 "+statusName[value]+"；客人可從我的服務看到新狀態。");}return;}
 if(a==="next"){
  const ts=scene==="clinic"?d.tickets.filter(t=>t.unit===room):d.tickets;
  const t=ts.find(x=>x.status==="WAITING");if(!t){inform("目前沒有候位中的號碼");return;}t.status="CALLED";if(scene==="clinic")d.current[room]=t.id;else d.current=t.id;notifyFor("called",t);inform("已叫號 "+t.id+"，右側新增叫號訊息模擬");return;
 }
 if(a==="recall"){const no=scene==="clinic"?d.current[room]:d.current;if(no){const t=d.tickets.find(t=>t.id===no);if(t)notifyFor("called",t);}inform("已重叫 "+(no||"目前無號碼"));return;}
 if(a==="board"){inform("看板示意：目前叫號 "+(scene==="clinic"?d.current[room]||"尚未叫號":d.current));return;}
});
document.addEventListener("change",e=>{
 const el=e.target;
 if(el.matches("[data-status-kind]")){
  const kind=el.dataset.statusKind,d=current(),o=find(kind==="reservation"?"bookings":"tickets",el.dataset.id);if(!o)return;
  o.status=el.value;
  if(kind==="reservation"&&scene==="clinic"&&el.value==="CHECKED_IN"&&!o.ticket){const id="C"+(o.unit==="1診"?"1":"2")+"-"+pad(d.seq++);o.ticket=id;d.tickets.push({id,name:o.name,unit:o.unit,party:1,status:"WAITING"});notifyFor("checkin",o);}
  if(kind==="ticket"&&el.value==="CALLED"){if(scene==="clinic")d.current[o.unit]=o.id;else d.current=o.id;notifyFor("called",o);}
  inform(o.id+" 狀態已變更為 "+statusName[el.value]+"；已結案紀錄仍可重新修改。");return;
 }
 if(el.id==="staff-room"){room=el.value;render();return;}
 const models={"pickup-day":"day","pickup-slot":"time","booking-day":"day","party-size":"party","queue-party":"party","queue-service":"service","reserve-service":"service","customer-name":"name","customer-phone":"phone","customer-note":"note","contact-name":"name","contact-phone":"phone"};
 if(models[el.id])draft[models[el.id]]=el.value;
});
document.addEventListener("input",e=>{const models={"customer-name":"name","customer-phone":"phone","customer-note":"note","contact-name":"name","contact-phone":"phone","party-size":"party","queue-party":"party","booking-day":"day"};if(models[e.target.id])draft[models[e.target.id]]=e.target.value;});
resetDraft();render();
})();
