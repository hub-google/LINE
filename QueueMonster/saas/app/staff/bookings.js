import {bookingState} from "../state/bookingState.js";

import {routeState} from "../state/routeState.js";
import {serviceUnitsState} from "../state/serviceUnitsState.js";
import {sharedUiState} from "../state/sharedUiState.js";
import {staffHistoryState} from "../state/staffHistoryState.js";

import {box,btn,esc,field,formatTaipeiCreated,selectedItemsHtml,staffDeletePicker,staffStatusPicker,stat,tag,taipei} from "../shared-ui.js";
import {historyBookingResultHtml,staffBookingMatches} from "../staff-history.js";
import {numberSettingsPanel} from "../number-settings.js";

import {staffListPage} from "../staff-list.js";
export function renderStaffBookings({openBookings,doneBookings,deletedBookings,isManager,pendingBookings,t,html}){
  const unitMatch=x=>!serviceUnitsState.unitEnabled()||!bookingState.bookingUnitFilter||x.service_unit_id===bookingState.bookingUnitFilter;
  const visibleOpen=openBookings.filter(x=>staffBookingMatches(x)&&unitMatch(x));
  const visibleDone=doneBookings.filter(x=>staffBookingMatches(x)&&unitMatch(x));
  const visibleDeleted=deletedBookings.filter(x=>staffBookingMatches(x)&&unitMatch(x));
  const card=x=>{

   return '<article class="staff-record '+(x.deleted_at?'staff-deleted-record':'')+'"><div class="staff-record-head"><div><div class="staff-record-title">'+'預約 '+esc(x.number||'—')+'　'+esc(x.day)+'　'+esc(x.time)+'　'+esc(x.name)+'</div>'+
   (x.unit?'<div class="small">'+esc(x.group||"")+' '+esc(x.unit)+' · '+esc(x.session||"")+'</div>':'')+
   '<div class="small">預約人數 '+esc(x.party)+' 位</div><div class="small">聯絡電話：'+(x.phone?'<a href="tel:'+esc(x.phone)+'">'+esc(x.phone)+'</a>':'尚未提供')+'</div>'+
   '<div class="small">送出預約時間：'+esc(formatTaipeiCreated(x.created_at))+'</div>'+
   selectedItemsHtml(x.selected_items)+'</div>'+tag(x.status)+'</div>'+
   (x.deleted_at?'<p class="staff-help">此預約已從顧客端隱藏；取消勾選刪除即可恢復。</p>':staffStatusPicker("reservation",x,x.day>taipei()?["CONFIRMED","CANCELLED"]:true))+staffDeletePicker("reservation",x)+
   ''+'</article>';
  };
  html+=
   (serviceUnitsState.unitEnabled()?box("服務單位篩選",'<label for="staff-booking-unit-filter">顯示哪個服務單位</label>'+
      '<select id="staff-booking-unit-filter" class="field"><option value="">全部服務單位</option>'+
      (serviceUnitsState.unitConfig.units||[]).map(u=>'<option value="'+esc(u.id)+'" '+(bookingState.bookingUnitFilter===u.id?'selected':'')+'>'+esc(u.name)+'</option>').join("")+
      '</select>'):"")+
   box("搜尋與篩選預約",'<p class="small">此處僅篩選目前已載入的資料：跨日未結案預約，以及最近 '+staffHistoryState.staffHistoryDays+' 天已處理紀錄；完整歷史請使用下方「歷史預約查詢」，也可切換日／週／月曆查看。</p>'+
    '<div class="grid3"><div>'+field("搜尋預約編號、姓名或服務","staff-booking-search",staffHistoryState.staffBookingSearch,"search",'placeholder="輸入關鍵字"')+'</div>'+
    '<div><label for="staff-booking-date">預約日期</label><select id="staff-booking-date" class="field">'+
     [["all","全部日期"],["today","今天"],["tomorrow","明天"],["next7","未來 7 天"]].map(([id,label])=>'<option value="'+id+'" '+(staffHistoryState.staffBookingDateFilter===id?"selected":"")+'>'+label+'</option>').join("")+'</select></div>'+
    '<div><label for="staff-booking-status">預約狀態</label><select id="staff-booking-status" class="field">'+
     [["all","全部狀態"],["CONFIRMED","已預約"],["CHECKED_IN","已報到"],["COMPLETED","已完成"],["NO_SHOW","未到"],["CANCELLED","已取消"]].map(([id,label])=>'<option value="'+id+'" '+(staffHistoryState.staffBookingStatusFilter===id?"selected":"")+'>'+label+'</option>').join("")+'</select></div></div>'+
    '<div class="staff-actionbar">'+btn("套用篩選","apply-booking-filter","primary")+
    btn("清除篩選","clear-booking-filter","outline")+
    (isManager?btn("匯出篩選結果 CSV","export-bookings","secondary"):"")+'</div>')+
   '<div class="grid4" style="margin-bottom:16px">'+stat("待處理預約",openBookings.length)+stat("待報到",pendingBookings.length)+
    stat("已報到未結案",openBookings.filter(x=>x.status==="CHECKED_IN").length)+stat("已處理預約",doneBookings.length)+'</div>'+
   box("預約管理方式",'<p class="muted">只要沒有標記完成、未到或取消，預約就不因跨過午夜而消失。店員可直接勾選狀態，也可重新選擇修正手誤。</p>'+
    '<p class="staff-help">'+(serviceUnitsState.unitConfig?.linked?
     '已啟用連動：報到後會為此場次建立一張候診票券，重複報到不會重複發號。':
     '預約獨立管理：報到不會產生叫號號碼。')+'未來預約僅可取消或恢復。</p>'+
    '<div class="staff-actionbar">'+
    (sharedUiState.lastStaffChange&&sharedUiState.lastStaffChange.slug===routeState.slug?btn("還原上一步","undo-staff","outline"):"")+
    '</div>')+
   box("待處理預約（"+visibleOpen.length+" / "+openBookings.length+" 筆）",visibleOpen.length?staffListPage(visibleOpen,"booking-open",card):'<p class="muted">目前沒有未結案預約。</p>')+
   box("已處理預約（最近 "+staffHistoryState.staffHistoryDays+" 天，"+visibleDone.length+" / "+doneBookings.length+" 筆）",'<p class="staff-help">包含已完成、未到、已取消。此區仍可修正狀態，資料依處理時間排序。</p>'+
    (visibleDone.length?staffListPage(visibleDone,"booking-done",card):'<p class="muted">選定範圍內還沒有已處理預約。</p>'))+
   box("已刪除預約（最近 "+staffHistoryState.staffHistoryDays+" 天，"+visibleDeleted.length+" / "+deletedBookings.length+" 筆）",
    '<p class="staff-help">顧客不會看到這些預約，也不會收到刪除通知。取消勾選即可恢復。</p>'+
    (visibleDeleted.length?staffListPage(visibleDeleted,"booking-deleted",card):'<p class="muted">目前沒有已刪除預約。</p>'))+
   box("完整預約歷史",'<p class="small">查詢本店全部歷史預約，不受工作清單「最近 7～90 天／每類最多 500 筆」限制。本區僅提供查閱，不修改狀態，也不發送 LINE 通知。</p>'+
    '<div class="grid3"><div>'+field("姓名、編號、參考碼、服務","historical-booking-search",staffHistoryState.historicalBookingQuery,"search",'maxlength="100"')+'</div>'+
    '<div>'+field("預約日期起","historical-booking-from",staffHistoryState.historicalBookingStart,"date")+'</div>'+
    '<div>'+field("預約日期迄","historical-booking-to",staffHistoryState.historicalBookingEnd,"date")+'</div></div>'+
    '<div class="grid"><div><label for="historical-booking-status">預約狀態</label><select id="historical-booking-status" class="field">'+
      [["ALL","全部狀態"],["CONFIRMED","已預約"],["CHECKED_IN","已報到"],["COMPLETED","已完成"],["NO_SHOW","未到"],["CANCELLED","已取消"]].map(([v,label])=>
       '<option value="'+v+'" '+(staffHistoryState.historicalBookingStatus===v?"selected":"")+'>'+label+'</option>').join("")+'</select></div>'+
    '<div><label for="historical-booking-deleted">顧客端隱藏狀態</label><select id="historical-booking-deleted" class="field">'+
     [["active","未刪除"],["deleted","已刪除"],["all","全部（含已刪除）"]].map(([v,label])=>
      '<option value="'+v+'" '+(staffHistoryState.historicalBookingDeleted===v?"selected":"")+'>'+label+'</option>').join("")+'</select></div></div>'+
    '<div class="staff-actionbar">'+btn("查詢完整歷史","historical-search","primary")+
      btn("重設歷史篩選","historical-reset","outline")+
      (isManager&&staffHistoryState.historicalBookingResult?btn("匯出完整搜尋結果 CSV","historical-export","secondary"):"")+
      '</div><p class="small">匯出檔案會依目前搜尋條件整理，單次最多匯出 20,000 筆；超過限制須分日期區間下載，絕不默默截斷。</p>'+historyBookingResultHtml())+numberSettingsPanel("booking",t,isManager);

return html;
}
