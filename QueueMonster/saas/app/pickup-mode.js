
import {routeState} from "./state/routeState.js";
import {customerState} from "./state/customerState.js";
import {staffState} from "./state/staffState.js";
import {lineState} from "./state/lineState.js";
import {box,btn,esc,field,taipei} from "./shared-ui.js";
import {rpc,act,load} from "./data-loading.js";
import {render} from "./staff-layout.js";
import {selectCustomerDetail} from "./customer-detail.js";
import {customerNoticeSuffix,sendOrderReply,lineReplyHandoff} from "./line-session.js";
import {normalizeTaiwanPhone,isValidTaiwanPhone,TW_LANDLINE_AREAS,getTaiwanLandlineHint,isValidTaiwanPhoneParts} from "./tw-phone.js";
import {pickupEntries,pickupCartAmount,pickupCartCount,pickupAdd,pickupRemove,pickupChosen,pickupSpecsLabel,parsePickupOptions,pickupGroupFromUrl,pickupGroupShareUrl,pickupGroupLeaveUrl,pickupRestoreOrder} from "./pickup-upgrades.js";
import {couponState,renderCouponCustomer,renderCouponAdmin,loadCouponAdmin,handleCouponAction,initializeCouponInputs} from "./pickup-coupons.js";
import {pickupChime} from "./pickup-alerts.js";

// The existing store, LINE identity and so_menu_items catalogue remain the source of truth.
// This module owns only pickup-specific presentation and form state.
export const pickupState={
  customer:null,staff:null,customerSlug:"",staffSlug:"",
  day:"",slot:"",method:"scheduled",cart:{},note:"",requestId:"",history:null,historyPage:1,historyFilter:"closed",customerHistory:null,customerHistoryPage:1,phoneType:"mobile",phone:"",phoneArea:"02",phoneLocal:"",confirming:false,configuringItemId:"",groupId:"",groupData:null,soundOn:false,soundSeen:null,repeatCustomers:null,kitchenMode:false
};
const statusText={NEW:"待店家接單",ACCEPTED:"已接單・待製作",PREPARING:"製作中",
  READY:"已完成待取",PICKED_UP:"已取餐",REJECTED:"店家已取消訂單",CANCELLED:"已取消"};
export const pickupStatusLabel=status=>statusText[status]||status;
const pickupContactPhone=()=>pickupState.phoneType==="landline"?pickupState.phoneArea+pickupState.phoneLocal:pickupState.phone;
const validPickupContactPhone=()=>isValidTaiwanPhoneParts(pickupState.phoneType,pickupState.phone,pickupState.phoneArea,pickupState.phoneLocal);
const money=n=>"NT$ "+Number(n||0).toLocaleString("zh-TW",{maximumFractionDigits:2});
const modeName={DISABLED:"僅立即取餐",OPTIONAL:"顧客可選立即或預約取餐",REQUIRED:"必須選擇取餐時間"};
const uuid=()=>{if(!globalThis.crypto?.randomUUID)throw Error("瀏覽器不支援安全訂單識別");return crypto.randomUUID();};
const lines=o=>(o.items||[]).map(i=>esc(i.name)+esc(pickupSpecsLabel(i))+" × "+esc(i.qty)).join("、");

export async function loadPickupData(){
  if(routeState.view==="customer"&&customerState.customer){
    if(!pickupState.day)pickupState.day=taipei();
    if(pickupState.customerSlug!==routeState.slug){
      pickupState.customer=null;pickupState.customerSlug=routeState.slug;pickupState.groupId="";pickupState.groupData=null;couponState.code="";couponState.preview=null;
      pickupState.cart={};pickupState.slot="";pickupState.requestId="";pickupState.method="scheduled";pickupState.confirming=false;pickupState.phoneType="mobile";pickupState.phone="";pickupState.phoneArea="02";pickupState.phoneLocal="";pickupState.customerHistory=null;pickupState.customerHistoryPage=1
    }
    if(!pickupState.customer||routeState.customerTab==="order"){
      try{pickupState.customer=await rpc("so_pickup_public",{p_slug:routeState.slug,p_date:pickupState.day});}
      catch(err){console.warn("取餐服務資料不可用",err);pickupState.customer=null;}
    }
    if(routeState.customerTab==="order"||(routeState.customerTab==="detail"&&routeState.detailKind==="order")){
      try{pickupState.customerHistory=await rpc("so_pickup_my_orders",{p_slug:routeState.slug,p_page:pickupState.customerHistoryPage});}
      catch(e){console.warn("無法讀取訂餐完整歷史",e);pickupState.customerHistory=null;}
    }
    const fromUrl=pickupGroupFromUrl(location.href);
    if(fromUrl)pickupState.groupId=fromUrl;
    if(pickupState.groupId&&pickupState.customer){
      try{pickupState.groupData=await rpc("so_pickup_group_view",{p_slug:routeState.slug,p_group:pickupState.groupId});}
      catch(error){pickupState.groupData=null;console.warn("團購資料暫時無法讀取",error);}
    }
    if(pickupState.customer?.settings?.schedule_mode==="DISABLED")pickupState.method="immediate";
    if(pickupState.customer?.settings?.schedule_mode==="REQUIRED")pickupState.method="scheduled";
    if(!pickupState.customer?.slots?.some(x=>x.time===pickupState.slot&&x.left>0))pickupState.slot="";
  }else if(routeState.view==="customer"){pickupState.customer=null;}
  if(routeState.view==="staff"&&staffState.staff&&["orders","settings","dashboard","calendar","customers"].includes(staffState.staffTab)){
    if(pickupState.staffSlug!==routeState.slug){pickupState.staff=null;pickupState.staffSlug=routeState.slug;pickupState.soundSeen=null;pickupState.repeatCustomers=null;}
    try{pickupState.staff=await rpc("so_pickup_staff",{p_slug:routeState.slug});}
    catch(err){console.warn("取餐店家資料不可用",err);pickupState.staff=null;}
    if(staffState.staffTab==="orders"){
      const current=new Set((pickupState.staff?.orders||[]).filter(o=>o.status==="NEW").map(o=>o.id));
      if(pickupState.soundSeen instanceof Set){
        const fresh=[...current].filter(id=>!pickupState.soundSeen.has(id));
        pickupState.newOrderCount=fresh.length;
        if(fresh.length&&pickupState.soundOn)void pickupChime().catch(error=>console.warn("接單提示音無法播放",error));
      }
      pickupState.soundSeen=current;
      try{pickupState.history=await rpc("so_pickup_history",{p_slug:routeState.slug,p_page:pickupState.historyPage,p_filter:pickupState.historyFilter});}
      catch(err){console.warn("訂餐歷史暫時不可用",err);pickupState.history=null;}
    }
    if(staffState.staffTab==="customers"
       && ["OWNER","MANAGER","PLATFORM"].includes(staffState.staff?.role)){
      try{pickupState.repeatCustomers=await rpc("so_pickup_repeat_customers",{p_slug:routeState.slug,p_limit:30});await loadCouponAdmin();}
      catch(error){pickupState.repeatCustomers=null;console.warn("熟客分析尚不可用",error);}
    }
  }
  // Shared createStoreLiveSync handles Realtime and the Free-plan API fallback.
}
export function renderPickupSettings(isManager){
 const data=pickupState.staff;
 if(!data)return box("線上點餐與取餐設定",'<p class="muted">暫時無法取得取餐設定，請重新整理或稍後再試。</p>');
 const s=data.settings||{};
 const select=(id,options,value)=>'<select class="field" id="'+id+'">'+options.map(([v,label])=>
   '<option value="'+esc(v)+'" '+(String(v)===String(value)?"selected":"")+'>'+esc(label)+'</option>').join("")+'</select>';
 return box("線上點餐與取餐進度",
   '<p class="muted">沿用「設定 → 服務設定」的餐點，不另建第二份菜單。此模式與原本預約、取號獨立；不處理線上付款。</p>'+
   (!isManager?'<p>線上點餐：'+(s.enabled?"已啟用":"未啟用")+'；取餐方式：'+esc(modeName[s.schedule_mode]||"預約")+'</p>':
   '<p class="settings-guidance">線上點餐是否開放，請使用本頁上方的「顧客服務開放設定」。這裡只需調整取餐方式與時段。</p>'+
   '<label for="pickup-mode">顧客選擇取餐時間</label>'+
   select("pickup-mode",[["DISABLED",modeName.DISABLED],["OPTIONAL",modeName.OPTIONAL],["REQUIRED",modeName.REQUIRED]],s.schedule_mode)+
   '<p class="small">選擇預約取餐時，系統依顧客指定時間排單。晚一點取餐的餐點不會在清晨提前進入製作流程。</p>'+
   '<div class="grid"><div>'+field("每天最早取餐時間","pickup-start",s.pickup_start||"05:30","time")+
   field("每天最後取餐截止","pickup-end",s.pickup_end||"14:00","time")+
   '<label for="pickup-interval">取餐時段間隔</label>'+select("pickup-interval",[[5,"5 分鐘"],[10,"10 分鐘"],[15,"15 分鐘"],[20,"20 分鐘"],[30,"30 分鐘"],[60,"60 分鐘"]],s.interval_minutes)+'</div>'+
   '<div>'+'<label for="pickup-capacity-basis">取餐時段容量計算方式</label>'+
   select("pickup-capacity-basis",[["ORDERS","每時段訂單筆數"],["ITEMS","每時段餐點總份數"]],s.capacity_basis||"ORDERS")+
   field("每時段最多可接數量（依上方單位）","pickup-capacity",s.slot_capacity||5,"number",'min="1" max="300"')+
   field("至少提前幾分鐘下單","pickup-notice",s.min_notice_minutes??20,"number",'min="0" max="1440"')+
   field("可提前預訂天數（0～30）","pickup-days",s.days_ahead??3,"number",'min="0" max="30"')+'</div></div>'+
   field("預估製作時間（分鐘）","pickup-prep",s.prep_minutes??20,"number",'min="1" max="180"')+
   '<p class="small">取餐時段容量可選「訂單數」或「餐點份數」。選擇份數後，08:00 的 20 份漢堡會占用 20 份容量；已成立訂單的取餐時間不變。</p>'+
   '<div class="staff-actionbar">'+btn("儲存取餐設定","pickup-save","primary")+'</div>')+
   '<div class="inset" style="margin-top:12px"><strong>點餐連結</strong><p class="small">服務啟用後，可把下方網址提供給顧客。</p>'+
   (s.enabled?'<p style="overflow-wrap:anywhere"><a target="_blank" rel="noopener noreferrer" href="'+esc(new URL("./index.html?view=customer&merchant="+encodeURIComponent(routeState.slug)+"&tab=order",location.href).href)+'">'+
   esc(new URL("./index.html?view=customer&merchant="+encodeURIComponent(routeState.slug)+"&tab=order",location.href).href)+'</a></p>':'<p class="muted">尚未開放線上點餐</p>')+'</div>')+
   (isManager?box("店員訂餐操作權限",
    '<p class="small">只影響一般員工角色，負責人、管理者及平台管理員維持管理權限。已加入企業的員工不需要重複建立帳號。</p>'+
    '<label class="checklist"><input id="pickup-staff-view" type="checkbox" '+(data.staff_can_view===false?"":"checked")+'>允許一般員工查看訂單與取餐日曆</label>'+
    '<label class="checklist"><input id="pickup-staff-update" type="checkbox" '+(data.staff_can_update===false?"":"checked")+'>允許一般員工修改訂單狀態</label>'+
    btn("儲存訂餐員工權限","pickup-staff-permissions-save","primary")):"");
}

function pickupGroupPanel(){
 const group=pickupState.groupData;
 if(!pickupState.groupId){
  return '<div class="inset"><strong>和朋友一起點餐？</strong><p class="small">建立團購連結後，朋友可各自選餐，主揪統一送出一筆訂單。</p>'+
    btn("建立團體訂餐","pickup-group-create","outline")+'</div>';
 }
 if(!group)return '<div class="inset"><p class="alert">團購連結無法使用。請確認已完成本店顧客身分綁定，或退出團購。</p>'+btn("退出團購","pickup-group-leave","outline")+'</div>';
 const link=pickupGroupShareUrl(location.href,pickupState.groupId);
 const catalog=pickupState.customer?.items||[];
 const participants=(group.participants||[]).map(p=>{
   const names=(p.items||[]).map(line=>{
     const item=catalog.find(x=>x.id===line.id);
     const opts=pickupChosen(item,line.options||[]).map(x=>x.choice_name);
     return esc(item?.name||"餐點")+(opts.length?"（"+esc(opts.join("／"))+"）":"")+" × "+esc(line.qty);
   }).join("、");
   return '<div class="listline"><strong>'+esc(p.name)+(p.mine?"（我）":"")+'</strong><span class="small">'+(names||"尚未選餐")+'</span></div>';
 }).join("");
 return '<div class="inset" style="margin:12px 0">'+
   '<strong>團體訂餐・'+(group.owner?"你是主揪":"參與點餐")+'</strong>'+
   (group.submitted?'<p class="notice">團購已結單，訂單 '+esc(group.order?.number||"")+'；狀態：'+esc(pickupStatusLabel(group.order?.status)||"已送出")+'</p>':
     '<p class="small">把下方連結分享給朋友，大家各自選餐並按「儲存我的餐點」，最後由主揪一次送出。有效期限 24 小時。</p>'+
     '<input class="field" readonly aria-label="團購分享連結" value="'+esc(link.href)+'">'+btn("複製團購連結","pickup-group-copy","outline"))+
   '<h4>大家已選的餐點</h4>'+(participants||'<p class="small">尚無參與者。</p>')+
   '<div class="staff-actionbar">'+btn("更新團購名單","pickup-group-refresh","outline")+btn("退出團購","pickup-group-leave","outline")+'</div></div>';
}
function renderPickupOptionEditor(){
 const item=(pickupState.customer?.items||[]).find(x=>x.id===pickupState.configuringItemId);
 if(!item)return "";
 return '<div class="inset" role="region" aria-label="客製餐點規格" style="margin:12px 0;border:2px solid var(--border,#e5e7eb)">'+
   '<h3>選擇 '+esc(item.name)+' 的規格</h3>'+
   (item.pickup_options||[]).map((g,i)=>'<div style="margin:12px 0"><strong>'+esc(g.name)+(g.required?'（必選）':'（選填）')+'</strong>'+
     (g.multiple?
       '<div class="staff-actionbar">'+(g.choices||[]).map((c,j)=>'<label class="checklist"><input type="checkbox" data-pickup-multi="'+i+'" value="'+j+'"> '+esc(c.name)+(Number(c.price)>0?' +'+money(c.price):'')+'</label>').join('')+'</div>':
       '<select class="field" data-pickup-single="'+i+'"><option value="">'+(g.required?'請選擇':'不加選項')+'</option>'+
       (g.choices||[]).map((c,j)=>'<option value="'+j+'">'+esc(c.name)+(Number(c.price)>0?' +'+money(c.price):'')+'</option>').join('')+'</select>')+
    '</div>').join('')+
   '<div class="staff-actionbar">'+btn("加入購物車","pickup-option-add","primary",'data-id="'+esc(item.id)+'"')+
   btn("取消","pickup-option-close","outline")+'</div></div>';
}
export function renderCustomerPickup(){
 const d=pickupState.customer;
 if(!d)return box("線上點餐",'<p class="muted">正在讀取店家菜單，若持續無法載入請重新整理。</p>');
 const s=d.settings||{};
 
 const immediate=pickupState.method==="immediate";
 const openNow=s.open_now!==false;
 const total=pickupCartAmount(pickupState.cart,d.items||[]);
 const count=pickupCartCount(pickupState.cart);
 const customerOrders=pickupState.customerHistory?.orders||d.orders||[];
 const historyTotal=Number(pickupState.customerHistory?.total??customerOrders.length);
 const historyMax=Math.max(1,Math.ceil(historyTotal/25));
 const historyControls=historyTotal>25?
   '<div class="staff-actionbar">'+
   btn("上一頁","pickup-customer-history-page","outline",'data-page="'+(pickupState.customerHistoryPage-1)+'"'+(pickupState.customerHistoryPage<=1?' disabled':''))+
   '<span>第 '+pickupState.customerHistoryPage+'／'+historyMax+' 頁</span>'+
   btn("下一頁","pickup-customer-history-page","outline",'data-page="'+(pickupState.customerHistoryPage+1)+'"'+(pickupState.customerHistoryPage>=historyMax?' disabled':''))+
   '</div>':"";
 const featuredCancelIndex=customerOrders.findIndex(o=>o.status==="NEW"&&
   Number.isFinite(Date.parse(o.created_at||""))&&Date.now()<Date.parse(o.created_at)+15000);
 const orderCardList=customerOrders.map(o=>{
  const deadline=Date.parse(o.created_at||"")+15000;
  const remaining=Number.isFinite(deadline)?Math.max(0,Math.ceil((deadline-Date.now())/1000)):0;
  const canCancel=o.status==="NEW"&&remaining>0;
  return '<div class="inset" style="margin-top:10px"><div class="listline"><strong>'+esc(o.number)+'</strong><span>'+esc(canCancel?"可取消・倒數中":statusText[o.status]||o.status)+'</span></div>'+
   '<p class="small">取餐：'+esc(o.pickup_at)+(o.scheduled?"（預約）":"（即時）")+'</p>'+
   '<p>'+lines(o)+'</p><p><strong>'+money(o.total)+'</strong></p>'+
    (o.status==='READY'?'<p class="notice" role="status"><strong>餐點已完成，可以到店取餐！</strong></p>':'')+
    btn('再點一次','pickup-repeat','outline','data-id="'+esc(o.id)+'"')+
   (canCancel?'<div data-pickup-grace-until="'+deadline+'" role="status" aria-live="off">'+
    '<p class="notice" style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span>可取消訂單剩餘時間</span><strong style="font-size:1.45em;font-variant-numeric:tabular-nums"><span class="pickup-grace-seconds">'+remaining+'</span> 秒</strong></p>'+
    '<p class="small">倒數結束後訂單會送給店家，無法自行取消。</p>'+
    btn("取消訂單","pickup-cancel","outline",'data-id="'+esc(o.id)+'"')+'</div>':
    (o.status==="NEW"?'<p class="small">訂單已送給店家，無法自行取消。</p>':
    ["ACCEPTED","PREPARING","READY"].includes(o.status)?'<p class="small">店家已接單，無法自行取消。</p>':""))+
   '</div>';
 });
 const orderCards=orderCardList.join("");
 const featuredCancelCard=featuredCancelIndex>=0?orderCardList[featuredCancelIndex]:"";
 const otherOrderCards=orderCardList.filter((_,i)=>i!==featuredCancelIndex).join("");
 if(!s.enabled)return box("尚未開放線上點餐",'<p>店家暫停接受新訂單，既有訂單仍可查看。</p>'+(orderCards||'<p>目前沒有訂餐紀錄。</p>')+historyControls);
 const available=(d.slots||[]).filter(x=>x.left>0);
 return box("線上點餐",
  '<p class="muted">直接使用本店上架菜單，送出後可在此追蹤接單、製餐、可取餐與已取餐進度。</p>'+btn('更新訂單進度','pickup-refresh','outline')+
  pickupGroupPanel()+
  (featuredCancelCard?'<section role="region" aria-label="新訂單取消倒數" style="margin:10px 0 18px"><h3>訂單已送出</h3>'+featuredCancelCard+'</section>':
  '<p class="notice"><strong>下單後 15 秒內可取消。</strong>送出訂單後會顯示倒數；倒數結束，訂單才會交給店家接單，之後無法自行取消。</p>')+
  (s.schedule_mode==="OPTIONAL"?'<div class="staff-actionbar">'+
   btn("立即取餐","pickup-method",immediate?"primary":"outline",'data-value="immediate" '+(openNow?"":'disabled'))+
   btn("預約指定時間","pickup-method",!immediate?"primary":"outline",'data-value="scheduled"')+'</div>':"")+
  (immediate&&!openNow?'<p class="alert">目前不在營業時間內，無法立即取餐；可切換預約取餐日期查看開放時段。</p>':"")+
  (immediate?'<p class="notice">預估製作時間約 '+esc(s.prep_minutes)+' 分鐘，實際以店家接單進度為準。</p>':
   '<div class="grid"><div>'+field("取餐日期","pickup-day",pickupState.day||taipei(),"date",'min="'+taipei()+'"')+
   '</div><div><label for="pickup-slot">取餐時間</label><select class="field" id="pickup-slot"><option value="">請選擇取餐時間</option>'+
   available.map(x=>'<option value="'+esc(x.time)+'" '+(pickupState.slot===x.time?"selected":"")+'>'+esc(x.time)+'（可接 '+esc(x.left)+(s.capacity_basis==='ITEMS'?' 份':' 單')+'）</option>').join("")+
   '</select></div></div>'+
   (available.length?"":'<p class="alert">本日沒有可預約時段，請更換日期或稍後再試。</p>'))+
  '<h3 style="margin:18px 0 10px">選擇餐點</h3>'+
  (d.items||[]).map(i=>{
    const qty=pickupEntries(pickupState.cart).filter(x=>x.id===i.id).reduce((sum,x)=>sum+x.qty,0);
    const left=i.daily_remaining==null?null:Number(i.daily_remaining);
    const soldOut=left!==null&&left<=0;
    const options=Array.isArray(i.pickup_options)&&i.pickup_options.length>0;
    return '<div class="listline" style="align-items:center;gap:10px"><div style="flex:1;min-width:0"><strong>'+esc(i.name)+'</strong>'+
      '<p class="small">'+esc(i.description||"")+'</p><strong>'+money(i.price)+'</strong>'+
      (left===null?'':'<p class="small">'+(soldOut?'今日已售完':'當日尚可預訂 '+esc(left)+' 份')+'</p>')+'</div>'+
      '<div class="staff-actionbar">'+btn("－","pickup-qty","outline",'data-id="'+esc(i.id)+'" data-delta="-1" aria-label="減少 '+esc(i.name)+'"'+(qty? '':' disabled'))+
      '<strong>'+esc(qty)+'</strong>'+
      btn(options?"選規格＋":"＋",options?"pickup-option-open":"pickup-qty","outline",
       'data-id="'+esc(i.id)+'"'+(options?'':' data-delta="1"')+' aria-label="增加 '+esc(i.name)+'"'+(soldOut||left!==null&&qty>=left?' disabled':''))+
      '</div></div>';
  }).join("")+renderPickupOptionEditor()+
  '<div style="margin-top:12px"><label for="pickup-phone-type">聯絡電話類型</label><div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">'+
   '<select class="field" id="pickup-phone-type" style="width:140px;max-width:100%"><option value="mobile" '+(pickupState.phoneType==="mobile"?"selected":"")+'>手機</option><option value="landline" '+(pickupState.phoneType==="landline"?"selected":"")+'>市話</option></select>'+
   '</div>'+
   (pickupState.phoneType==="mobile"?
      field("手機號碼","pickup-customer-phone",pickupState.phone,"tel",'inputmode="numeric" autocomplete="tel-national" pattern="[0-9]*" maxlength="10" placeholder="例如：0912345678（臺灣號碼，09 開頭、10 碼、半形數字）"'):
      '<div style="display:grid;grid-template-columns:minmax(0,125px) minmax(0,1fr);gap:10px;margin-top:8px;align-items:end">'+
        '<div><label for="pickup-customer-area">市話區碼</label><select class="field" id="pickup-customer-area">'+TW_LANDLINE_AREAS.map(a=>'<option value="'+esc(a)+'" '+(a===pickupState.phoneArea?"selected":"")+'>'+esc(a)+'</option>').join("")+'</select></div>'+
        '<div style="min-width:0">'+field("市話號碼","pickup-customer-local",pickupState.phoneLocal,"tel",'inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="例如：'+esc(getTaiwanLandlineHint(pickupState.phoneArea).example)+'（臺灣市話，半形數字）"')+'</div></div>')+
   '</div>'+
   '<div style="margin-top:12px">'+field("給店家的備註（最多 200 字）","pickup-note",pickupState.note,"text",'maxlength="200" placeholder="例如：不要加辣"')+'</div>'+
  renderCouponCustomer(total,pickupState.groupId)+
  '<div class="listline"><strong>共 '+esc(count)+' 份</strong><strong>'+money(total)+'</strong></div>'+
  '<p class="small">此處僅建立訂單，不會線上收款；請依店家現場方式結帳。</p>'+
  (pickupState.groupId?(
    pickupState.groupData?.submitted?'<p class="notice">團購已完成下單。請到上方查看訂單狀態。</p>':
    '<div class="staff-actionbar">'+btn("儲存我的餐點到團購","pickup-group-save","primary")+
      (pickupState.groupData?.owner?btn("主揪送出整張訂單","pickup-group-submit","outline",((immediate&&!openNow)||(!immediate&&!pickupState.slot))?'disabled':''):'')+'</div>'
   ):(pickupState.confirming?'<div class="inset" role="group" aria-label="確認訂餐內容"><strong>請核對送出前的訂餐內容</strong>'+
    '<p>聯絡電話：'+esc(normalizeTaiwanPhone(pickupContactPhone()))+'</p>'+
    '<p>預計取餐：'+(immediate?'立即取餐（以店家接單為準）':esc(pickupState.day)+' '+esc(pickupState.slot))+'</p>'+
    '<p>餐點：'+pickupEntries(pickupState.cart).map(line=>{const i=(d.items||[]).find(x=>x.id===line.id);return esc(i?.name||'餐點')+esc((pickupChosen(i,line.options)||[]).length?'（'+pickupChosen(i,line.options).map(x=>x.choice_name).join('／')+'）':'')+' × '+esc(line.qty)}).join('、')+'</p>'+
    '<p>金額：'+money(total)+'（以送出時店家菜單價格重新計算）</p>'+
    '<p>備註：'+esc(pickupState.note||'無')+'</p><div class="staff-actionbar">'+
    btn("返回修改","pickup-review-back","outline")+btn("確定送出訂單","pickup-submit","primary")+'</div></div>':
    btn("下一步：確認訂單內容","pickup-review","primary full",(!count||(immediate&&!openNow)||(!immediate&&!pickupState.slot))?"disabled":"")))+
  (customerOrders.length>(featuredCancelCard?1:0)?
    '<h3 style="margin:20px 0 8px">我的取餐進度（'+historyTotal+' 筆）</h3>'+otherOrderCards+historyControls:
    (featuredCancelCard?historyControls:'<p class="small">還沒有取餐訂單。</p>')));
}
export function renderStaffPickup(){
 const d=pickupState.staff;
 if(!d)return box("取餐訂單",'<p class="muted">目前無法讀取取餐訂單，請重新整理。</p>');
 // 停用訂餐僅阻止新增訂單，不隱藏既有訂單或歷史紀錄。
 const orders=d.orders||[],active=orders.filter(o=>!["PICKED_UP","REJECTED","CANCELLED"].includes(o.status));
 const history=orders.filter(o=>["PICKED_UP","REJECTED","CANCELLED"].includes(o.status));
 const canUpdate=d.can_update!==false;
 const staffStatusText={NEW:"待接單",ACCEPTED:"已接單",PREPARING:"製作中",
   READY:"已完成待取",PICKED_UP:"已取餐",REJECTED:"店家已取消訂單",CANCELLED:"已取消"};
 const action=(o,label,status,disabled=false,style="outline")=>btn(label,"pickup-status",style,
   'data-id="'+esc(o.id)+'" data-status="'+status+'" data-expected="'+esc(o.status)+'"'+
   (disabled?' disabled title="目前狀態或尚未到建議製作時間"':''));
 // These choices remain available for every order, including rejected and finished orders.
 const choices=o=>[[o.status==="READY"?"確認已取餐":"接單",o.status==="READY"?"PICKED_UP":"ACCEPTED"],["已完成待取","READY"],["取消訂單","REJECTED"]];
 const card=o=>'<div class="inset" style="margin:0 0 12px;padding:14px"><div class="listline"><strong>'+
  esc(o.number)+'</strong><strong>'+esc(staffStatusText[o.status]||o.status)+'</strong></div>'+
  '<p class="small"><strong>約定取餐 '+esc(o.pickup_at)+'</strong> '+(o.scheduled?"（指定時間）":"（立即）")+'</p>'+
  '<p class="small">聯絡電話：'+esc(o.customer_phone||'未提供')+'</p><p class="small">建議開始製作：'+esc(o.prepare_at)+(o.can_prepare?"":" — 尚未到製作時間")+'</p>'+
  '<p>'+lines(o)+'</p><p class="small">'+(o.note?"備註："+esc(o.note):"無備註")+' ・ '+money(o.total)+'</p>'+
  (canUpdate?'<div class="staff-actionbar" role="group" aria-label="選擇訂單狀態">'+
  choices(o).map(([label,status])=>action(o,label,status,o.status===status,o.status===status?"primary":"outline")).join("")+'</div>':
  '<p class="small">此員工角色僅可查看訂單，由管理者修改狀態。</p>')+
  (canUpdate?'<details style="margin-top:8px"><summary class="small">其他操作（開始製作／取消類型更正／恢復待接單）</summary>'+
  '<div class="staff-actionbar" style="margin-top:10px">'+
  (o.status==="ACCEPTED"?action(o,"開始製作","PREPARING",!o.can_prepare):"")+
  (o.status!=="CANCELLED"?action(o,"更正為顧客取消","CANCELLED"):"")+
  (o.status!=="NEW"?action(o,"恢復待接單","NEW"):"")+'</div></details>':"")+'</div>';
 const h=pickupState.history||{},past=h.orders||[],maxPage=Math.max(1,Math.ceil(Number(h.total||0)/25));
 const choose=(f,label)=>btn(label,"pickup-history-filter",pickupState.historyFilter===f?"primary":"outline",'data-filter="'+f+'"');
 const toolbar='<div class="staff-actionbar" style="margin:12px 0">'+
   btn(pickupState.soundOn?"關閉接單提示音":"開啟接單提示音","pickup-sound-toggle",
      pickupState.soundOn?"primary":"outline")+
   btn(pickupState.kitchenMode?"返回一般訂單":"廚房大字模式","pickup-kitchen-toggle","outline")+
   btn("重新整理訂單","pickup-refresh","outline")+
   (pickupState.newOrderCount>0?'<strong role="status">新增 '+pickupState.newOrderCount+' 筆訂單</strong>':'')+'</div>';
 if(pickupState.kitchenMode||new URLSearchParams(location.search).get("kitchen")==="1"){
   pickupState.kitchenMode=true;
   return box("廚房出餐大字看板",toolbar+
     '<p class="small">依預計開始製作及取餐時間排序，訂單狀態由原本的店家權限控制。請按「開啟接單提示音」授權瀏覽器播放，資料使用即時事件更新，不額外每秒輪詢。</p>'+
     '<div class="staff-actionbar">'+btn("切換全螢幕","pickup-kitchen-fullscreen","outline")+'</div>'+
     '<div class="qm-kitchen-grid">'+(active.length?active.map(o=>
       '<section class="qm-kitchen-card" aria-label="訂單 '+esc(o.number)+'">'+
       '<div class="listline"><strong class="qm-kitchen-number">'+esc(o.number)+'</strong><strong>'+esc(staffStatusText[o.status]||o.status)+'</strong></div>'+
       '<p class="qm-kitchen-time">取餐 '+esc(o.pickup_at)+'</p>'+
       '<p class="small">建議製作 '+esc(o.prepare_at)+(o.can_prepare?'':'・尚未到製作時間')+'</p>'+
       '<div class="qm-kitchen-items">'+(o.items||[]).map(i=>'<p>'+esc(i.name)+esc(pickupSpecsLabel(i))+' × <strong>'+esc(i.qty)+'</strong></p>').join('')+'</div>'+
       (o.note?'<p class="notice">備註：'+esc(o.note)+'</p>':'')+
       (canUpdate?'<div class="staff-actionbar">'+
          (o.status==="NEW"?action(o,"接單","ACCEPTED"):o.status==="ACCEPTED"&&o.can_prepare?action(o,"開始製作","PREPARING"): '')+
          (o.status!=="READY"?action(o,"完成待取","READY"):action(o,"已取餐","PICKED_UP"))+
        '</div>':'')+
       '</section>').join(""):'<p class="muted">目前沒有待出餐訂單。</p>')+'</div>');
 }
 return box("取餐訂單管理",toolbar+
  '<p class="small">依約定取餐時間排序。可切換接單、已完成待取或取消訂單；誤操作可以更正，所有變更均保留稽核紀錄。</p>'+
  '<p><strong>待處理 '+active.length+' 筆</strong></p>'+
  (active.length?active.map(card).join(""):'<p class="muted">目前沒有待處理訂單。</p>')+
  '<details class="pickup-history-panel" open><summary>歷史訂單（'+Number(h.total??history.length)+' 筆，可更正狀態）</summary>'+
  '<div class="staff-actionbar" style="margin-top:12px">'+choose("all","全部")+choose("active","進行中")+choose("closed","已結束")+'</div>'+
  (past.length?past.map(card).join(""):'<p class="muted">目前沒有符合條件的訂單。</p>')+
  '<div class="staff-actionbar">'+btn("上一頁","pickup-history-page","outline",'data-page="'+(pickupState.historyPage-1)+'"'+(pickupState.historyPage<=1?' disabled':''))+
  '<span>第 '+pickupState.historyPage+'／'+maxPage+' 頁</span>'+
  btn("下一頁","pickup-history-page","outline",'data-page="'+(pickupState.historyPage+1)+'"'+(pickupState.historyPage>=maxPage?' disabled':''))+'</div></details>');

}
export function renderPickupLoyalCustomers(){
 const customers=pickupState.repeatCustomers;
 if(!Array.isArray(customers))return box("訂餐熟客分析",'<p class="small">目前無法載入本店熟客分析；請稍後重新整理。</p>')+renderCouponAdmin();
 return box("訂餐熟客分析（最多 30 位）",
 '<p class="small">僅管理者可查看本店訂餐客戶，按照有效訂單筆數排序。金額為訂單總額，不代表已實際收款。資料僅供本店使用。</p>'+
 (customers.length?
  '<div class="scroll"><table class="rows"><thead><tr><th>顧客</th><th>有效訂單</th><th>累計訂單金額</th><th>最常訂的餐點</th><th>最近訂購</th></tr></thead><tbody>'+
  customers.map(c=>'<tr><td>'+esc(c.name)+'</td><td>'+esc(c.orders)+' 筆</td><td>'+money(c.amount)+'</td>'+
    '<td>'+esc(c.favorite||'—')+'</td><td>'+esc(c.last_order?new Date(c.last_order).toLocaleDateString("zh-TW",{timeZone:"Asia/Taipei"}):'—')+'</td></tr>').join("")+
  '</tbody></table></div>':'<p class="muted">目前沒有可統計的訂單。</p>'))+renderCouponAdmin();
}
export async function handlePickupAction(ev,b,a,id){
 if(!a.startsWith("pickup-"))return false;
 if(a.startsWith("pickup-coupon-"))return await handleCouponAction(a,b,pickupCartAmount(pickupState.cart,pickupState.customer?.items||[]));
 if(a==="pickup-line-reply"){
   if(!id)return true;
   await act(async()=>{
     const handoff=await lineReplyHandoff("order",id);
     location.assign(handoff.oaMessageUrl);
     return "正在開啟 LINE 聊天室；請按傳送取得訂餐確認卡";
   });return true;
 }
 if(a==="pickup-group-create"){
   await act(async()=>{
     const g=await rpc("so_pickup_group_create",{p_slug:routeState.slug});
     pickupState.groupId=g.id;
     const url=pickupGroupShareUrl(location.href,g.id);
     history.replaceState(null,"",url.pathname+url.search+url.hash);
     return "團購已建立，請複製分享連結邀請朋友";
   });return true;
 }
 if(a==="pickup-group-leave"){
   pickupState.groupId="";pickupState.groupData=null;pickupState.cart={};
   const url=pickupGroupLeaveUrl(location.href);history.replaceState(null,"",url.pathname+url.search+url.hash);
   render();return true;
 }
 if(a==="pickup-group-copy"){
   const url=pickupGroupShareUrl(location.href,pickupState.groupId);
   try{await navigator.clipboard.writeText(url.href);window.alert("團購連結已複製");}
   catch(_){window.prompt("請複製團購網址",url.href);}
   return true;
 }
 if(a==="pickup-group-refresh"){await load();return true;}
 if(a==="pickup-group-save"){
   if(!pickupState.groupId||pickupState.groupData?.submitted)return true;
   const items=pickupEntries(pickupState.cart).map(x=>({id:x.id,qty:x.qty,options:x.options||[]}));
   await act(async()=>{
     await rpc("so_pickup_group_save",{p_slug:routeState.slug,p_group:pickupState.groupId,p_items:items});
     return "你的團購餐點已儲存";
   });return true;
 }
 if(a==="pickup-group-submit"){
   if(!pickupState.groupId||!pickupState.groupData?.owner||pickupState.groupData.submitted)return true;
   if(!validPickupContactPhone()){window.alert("主揪請先填寫有效的聯絡電話");return true;}
   if(pickupState.method!=="immediate"&&!pickupState.slot){window.alert("請先選取餐時間");return true;}
   if(!window.confirm("確定統一送出團體訂單？送出後其他人不能再修改。"))return true;
   await act(async()=>{
     const result=await rpc("so_pickup_group_submit",{
       p_slug:routeState.slug,p_group:pickupState.groupId,
       p_date:pickupState.method==="immediate"?null:pickupState.day,
       p_time:pickupState.method==="immediate"?null:pickupState.slot,
       p_note:pickupState.note,p_immediate:pickupState.method==="immediate",
       p_customer_phone:normalizeTaiwanPhone(pickupContactPhone())
     });
     pickupState.cart={};pickupState.note="";
     return "團購已送出："+result.number+"（15 秒內可取消）";
   });return true;
 }
 if(a==="pickup-refresh"){await load();return true;}
 if(a==="pickup-sound-toggle"){
   pickupState.soundOn=!pickupState.soundOn;
   if(pickupState.soundOn){
     try{await pickupChime();}catch(error){pickupState.soundOn=false;window.alert(error.message);}
   }
   render();return true;
 }
 if(a==="pickup-kitchen-toggle"){
   pickupState.kitchenMode=!pickupState.kitchenMode;
   const u=new URL(location.href);
   if(pickupState.kitchenMode)u.searchParams.set("kitchen","1");else u.searchParams.delete("kitchen");
   history.replaceState(null,"",u.pathname+u.search+u.hash);
   render();return true;
 }
 if(a==="pickup-kitchen-fullscreen"){
   try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}
   catch(error){window.alert("此瀏覽器無法切換全螢幕："+error.message);}
   return true;
 }
 if(a==="pickup-customer-history-page"){
    const page=Number(b.dataset.page),max=Math.max(1,Math.ceil(Number(pickupState.customerHistory?.total||0)/25));
    if(Number.isInteger(page)&&page>=1&&page<=max){pickupState.customerHistoryPage=page;await load();}
    return true;
 }
 if(a==="pickup-history-page"){
  const page=Number(b.dataset.page),max=Math.max(1,Math.ceil(Number(pickupState.history?.total||0)/25));
  if(Number.isInteger(page)&&page>=1&&page<=max){pickupState.historyPage=page;await load();}
  return true;
 }
 if(a==="pickup-history-filter"){
  if(!["all","active","closed"].includes(b.dataset.filter))return true;
  pickupState.historyFilter=b.dataset.filter;pickupState.historyPage=1;await load();return true;
 }
 if(a==="pickup-review"){
   if(!validPickupContactPhone()){window.alert(pickupState.phoneType==="mobile"?"請輸入 09 開頭、10 碼的台灣手機號碼":"市話區碼與電話號碼格式錯誤，請依區碼確認位數及號碼開頭");return true;}
   if(!pickupCartCount(pickupState.cart)){window.alert("請先選擇餐點");return true;}
   pickupState.confirming=true;render();return true;
 }
 if(a==="pickup-review-back"){pickupState.confirming=false;render();return true;}
 if(a==="pickup-method"){
   pickupState.method=b.dataset.value==="immediate"?"immediate":"scheduled";pickupState.confirming=false;render();return true;
 }
 if(a==="pickup-option-open"){pickupState.configuringItemId=id;pickupState.confirming=false;render();return true;}
 if(a==="pickup-option-close"){pickupState.configuringItemId="";render();return true;}
 if(a==="pickup-option-add"){
   const item=(pickupState.customer?.items||[]).find(x=>x.id===id);
   if(!item)return true;
   const selections=[];
   for(const [i,g] of (item.pickup_options||[]).entries()){
     if(g.multiple){
       document.querySelectorAll('input[data-pickup-multi="'+i+'"]:checked').forEach(el=>selections.push({group:i,choice:Number(el.value)}));
     }else{
       const value=document.querySelector('select[data-pickup-single="'+i+'"]')?.value;
       if(value!==""&&value!=null)selections.push({group:i,choice:Number(value)});
     }
     if(g.required&&!selections.some(x=>x.group===i)){window.alert("請選擇「"+g.name+"」");return true;}
   }
   const remaining=item.daily_remaining==null?Infinity:Number(item.daily_remaining);
   const existing=pickupEntries(pickupState.cart).filter(x=>x.id===id).reduce((s,x)=>s+x.qty,0);
   if(existing>=remaining){window.alert("此餐點今日剩餘數量不足");return true;}
   pickupAdd(pickupState.cart,id,selections,1);
   pickupState.configuringItemId="";pickupState.requestId="";pickupState.confirming=false;render();return true;
 }
 if(a==="pickup-qty"){
   const item=(pickupState.customer?.items||[]).find(x=>x.id===id);
   if(!item)return true;
   const delta=Number(b.dataset.delta||0);
   if(delta>0){
     const existing=pickupEntries(pickupState.cart).filter(x=>x.id===id).reduce((s,x)=>s+x.qty,0);
     if(item.daily_remaining!=null&&existing>=Number(item.daily_remaining)){window.alert("此餐點今日剩餘數量不足");return true;}
     if((item.pickup_options||[]).length){pickupState.configuringItemId=id;render();return true;}
     pickupAdd(pickupState.cart,id,[],1);
   }else pickupRemove(pickupState.cart,id);
   pickupState.requestId="";pickupState.confirming=false;render();return true;
 }
 if(a==="pickup-repeat"){
   const order=(pickupState.customerHistory?.orders||pickupState.customer?.orders||[]).find(x=>x.id===id);
   if(!order)return true;
   const {cart:next,skipped}=pickupRestoreOrder(order.items||[],pickupState.customer?.items||[]);
   if(!pickupCartCount(next)){window.alert("原訂單餐點已停售、缺貨或規格變更，請重新選擇");return true;}
   pickupState.cart=next;pickupState.confirming=false;pickupState.requestId="";render();
   if(skipped)window.alert("已加入仍可訂購餐點；有 "+skipped+" 項因停售、缺貨或規格變動未加入。");
   window.scrollTo({top:0,behavior:"smooth"});return true;
 }
 if(a==="pickup-extras-save"){
   const value=routeState.$("pickup-extras-text")?.value||"";
   let options;try{options=parsePickupOptions(value);}catch(e){window.alert(e.message);return true;}
   const raw=routeState.$("pickup-extras-stock")?.value?.trim()||"";
   const limit=raw===""?null:Number(raw);
   if(limit!==null&&(!Number.isInteger(limit)||limit<0||limit>100000)){window.alert("每日限量請輸入 0～100000 或留空");return true;}
   await act(async()=>{
     await rpc("so_pickup_save_extras",{p_slug:routeState.slug,p_item_id:id,p_options:options,p_daily_limit:limit});
     return "商品規格與每日限量已儲存";
   });return true;
 }
 if(a==="pickup-staff-permissions-save"){
   const canView=!!routeState.$("pickup-staff-view")?.checked;
   const canUpdate=!!routeState.$("pickup-staff-update")?.checked;
   if(!canView&&canUpdate){window.alert("若關閉訂單檢視權限，也必須關閉修改權限");return true;}
   await act(async()=>{
     await rpc("so_pickup_set_staff_permissions",{p_slug:routeState.slug,p_can_view:canView,p_can_update:canUpdate});
     return "一般員工的訂餐權限已更新";
   });return true;
 }
 if(a==="pickup-save"){
   await act(async()=>{
     await rpc("so_pickup_save_capacity_settings",{p_slug:routeState.slug,
       p_enabled:pickupState.staff?.settings?.enabled===true,p_mode:routeState.$("pickup-mode")?.value,
       p_start:routeState.$("pickup-start")?.value,p_end:routeState.$("pickup-end")?.value,
       p_interval:Number(routeState.$("pickup-interval")?.value),
       p_capacity:Number(routeState.$("pickup-capacity")?.value),
       p_notice:Number(routeState.$("pickup-notice")?.value),
       p_days:Number(routeState.$("pickup-days")?.value),
       p_prep:Number(routeState.$("pickup-prep")?.value),p_capacity_basis:routeState.$("pickup-capacity-basis")?.value});
     pickupState.customer=null;return "取餐時段與容量設定已儲存";
   });return true;
 }
 if(a==="pickup-submit"){
   if(!pickupState.confirming){window.alert("請先確認訂單內容");return true;}
   if(!validPickupContactPhone()){
     pickupState.confirming=false;window.alert("請填寫有效的台灣手機或市話");render();return true;
   }
   const items=pickupEntries(pickupState.cart).map(x=>({id:x.id,qty:x.qty,options:x.options||[]}));
   if(!items.length)return true;
   if(pickupState.method!=="immediate"&&!pickupState.slot)return true;
   const couponCode=couponState.code.trim().toUpperCase(),usingCoupon=!!couponCode;
   if(usingCoupon&&(!couponState.preview||couponState.preview.code!==couponCode||couponState.preview.cartAmount!==pickupCartAmount(pickupState.cart,pickupState.customer?.items||[]))){window.alert("請先按「套用優惠碼」，確認訂單符合折抵條件");return true;}
   try{if(!pickupState.requestId)pickupState.requestId=uuid();}catch(e){window.alert(e.message);return true;}
   let placed=false;
   await act(async()=>{
     const args={p_slug:routeState.slug,
       p_date:pickupState.method==="immediate"?null:pickupState.day,
       p_time:pickupState.method==="immediate"?null:pickupState.slot,
       p_items:items,p_note:pickupState.note,p_request_id:pickupState.requestId,
       p_immediate:pickupState.method==="immediate",
       p_customer_phone:normalizeTaiwanPhone(pickupContactPhone())};
     if(usingCoupon)args.p_coupon_code=couponCode;
     const res=await rpc(usingCoupon?"so_pickup_place_with_coupon":"so_pickup_place_phone",args);
     pickupState.cart={};pickupState.note="";pickupState.requestId="";pickupState.confirming=false;couponState.code="";couponState.preview=null;placed=true;
     if(!selectCustomerDetail("order",res.id))routeState.customerTab="order";
     const notice=await sendOrderReply(res.id);
      return "訂單 "+res.number+" 已送出。15 秒內可取消，倒數後交給店家接單"+customerNoticeSuffix(notice);
   });
   if(placed)window.scrollTo({top:0,behavior:"instant"});
   return true;
 }
 if(a==="pickup-status"){
   if(!id)return true;
   const desired=b.dataset.status,expected=b.dataset.expected;
   if(desired===expected)return true;
   if(["REJECTED","CANCELLED"].includes(desired)&&!confirm("確定要取消這筆訂單？"))return true;
   if(desired==="PICKED_UP"&&!confirm("確認顧客已領取這筆訂單？"))return true;
   await act(async()=>{
     await rpc("so_pickup_update",{p_slug:routeState.slug,p_order_id:id,p_expected:expected,p_status:desired});
     return "訂單狀態已更新為："+(statusText[desired]||desired);
   });return true;
 }
 if(a==="pickup-cancel"){
   if(!id)return true;
   // Cancel immediately: a confirmation dialog would consume the 15-second window.
   await act(async()=>{
     await rpc("so_pickup_cancel",{p_slug:routeState.slug,p_order_id:id});
     return "訂單已取消";
   });return true;
 }
 // Only consume pickup actions handled here. Menu availability actions are
 // handled by handleMerchantSettings later in the click-action chain.
 return false;
}
export function initializePickupMode(){
 pickupState.day=taipei();initializeCouponInputs(()=>{pickupState.requestId="";pickupState.confirming=false;});
 // Countdown updates only the DOM; no 1-second API requests.
 setInterval(()=>{
   document.querySelectorAll("[data-pickup-grace-until]").forEach(el=>{
     const seconds=Math.max(0,Math.ceil((Number(el.dataset.pickupGraceUntil)-Date.now())/1000));
     const counter=el.querySelector(".pickup-grace-seconds");
     if(counter)counter.textContent=String(seconds);
     if(!seconds){
       el.querySelectorAll("button").forEach(button=>{button.disabled=true;});
       if(!el.dataset.expired){
         el.dataset.expired="true";
         const p=el.querySelector(".notice");
         if(p)p.textContent="取消期限已結束，訂單已交給店家，無法自行取消。";
       }
     }
   });
 },250);
 document.addEventListener("input",ev=>{
  if(ev.target?.id==="pickup-note"){pickupState.note=ev.target.value;pickupState.requestId="";pickupState.confirming=false;}
  if(ev.target?.id==="pickup-customer-phone"){pickupState.phone=ev.target.value.replace(/\D/g,"").slice(0,10);ev.target.value=pickupState.phone;pickupState.requestId="";pickupState.confirming=false;}
  if(ev.target?.id==="pickup-customer-local"){pickupState.phoneLocal=ev.target.value.replace(/\D/g,"").slice(0,8);ev.target.value=pickupState.phoneLocal;pickupState.requestId="";pickupState.confirming=false;}
 });
 document.addEventListener("change",async ev=>{
  if(ev.target?.id==="pickup-phone-type"){pickupState.phoneType=ev.target.value==="landline"?"landline":"mobile";pickupState.requestId="";pickupState.confirming=false;render();return;}
  if(ev.target?.id==="pickup-customer-area"){pickupState.phoneArea=TW_LANDLINE_AREAS.includes(ev.target.value)?ev.target.value:"02";pickupState.requestId="";pickupState.confirming=false;render();return;}
  if(ev.target?.id==="pickup-day"){
   pickupState.day=ev.target.value;pickupState.slot="";pickupState.requestId="";pickupState.confirming=false;
   try{
     pickupState.customer=await rpc("so_pickup_public",{p_slug:routeState.slug,p_date:pickupState.day});
     render();
   }catch(err){window.alert(err.message);}
  }
  if(ev.target?.id==="pickup-slot"){pickupState.slot=ev.target.value;pickupState.requestId="";pickupState.confirming=false;render();}
 });
}
