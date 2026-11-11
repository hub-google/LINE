import {calendarState} from "../state/calendarState.js";
import {routeState} from "../state/routeState.js";
import {staffHistoryState} from "../state/staffHistoryState.js";
import {staffState} from "../state/staffState.js";

import {calendarPeriod,calendarShiftAnchor,loadBookingCalendar} from "./../booking-calendar.js";
import {formatTaipeiCreated,jsStatus,showActionFeedback,taipei} from "./../shared-ui.js";
import {val} from "./../data-loading.js";
import {exportHistoricalBookings,searchHistoricalBookings,staffBookingMatches} from "./../staff-history.js";
import {render} from "./../staff-layout.js";

export async function handleStaffCalendar(ev,b,a,id){
if(a==="calendar-mode"){
   const mode=b.dataset.mode;
   if(!["day","week","month"].includes(mode))return true;
   calendarState.calendarMode=mode;calendarState.calendarPage=1;void loadBookingCalendar(1);return true;
  }
  if(a==="calendar-prev"||a==="calendar-next"){
   calendarState.calendarAnchor=calendarShiftAnchor(calendarState.calendarMode,calendarState.calendarAnchor,a==="calendar-prev"?-1:1);
   calendarState.calendarPage=1;void loadBookingCalendar(1);return true;
  }
  if(a==="calendar-today"){
   calendarState.calendarAnchor=taipei();calendarState.calendarPage=1;void loadBookingCalendar(1);return true;
  }
  if(a==="calendar-day"){
   const date=b.dataset.date;
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date||""))return true;
   calendarState.calendarAnchor=date;calendarState.calendarMode="day";calendarState.calendarPage=1;void loadBookingCalendar(1);return true;
  }
  if(a==="calendar-jump"){
   const date=val("calendar-jump-date");
   try{calendarPeriod(calendarState.calendarMode,date);}catch(e){showActionFeedback("請選擇正確日期。","error");return true;}
   calendarState.calendarAnchor=date;calendarState.calendarPage=1;void loadBookingCalendar(1);return true;
  }
  if(a==="calendar-refresh"){void loadBookingCalendar(calendarState.calendarPage);return true;}
  if(a==="calendar-page-prev"||a==="calendar-page-next"){
   if(!calendarState.calendarResult||calendarState.calendarLoading)return true;
   const target=calendarState.calendarPage+(a==="calendar-page-prev"?-1:1);
   const last=Math.max(1,Math.ceil(Number(calendarState.calendarResult.total||0)/100));
   if(target<1||target>last)return true;
   void loadBookingCalendar(target);return true;
  }
  if(a==="historical-search"){
    const search=val("historical-booking-search").trim();
    const from=val("historical-booking-from"),to=val("historical-booking-to");
    if(search.length>100){showActionFeedback("搜尋最多 100 字","error");return true;}
    if(from&&to&&from>to){showActionFeedback("結束日期不能早於開始日期","error");return true;}
    staffHistoryState.historicalBookingQuery=search;staffHistoryState.historicalBookingStart=from;staffHistoryState.historicalBookingEnd=to;
    staffHistoryState.historicalBookingStatus=val("historical-booking-status");
    staffHistoryState.historicalBookingDeleted=val("historical-booking-deleted");
    staffHistoryState.historicalBookingPage=1;void searchHistoricalBookings(1);return true;
  }
  if(a==="historical-export"){void exportHistoricalBookings();return true;}
  if(a==="historical-reset"){
    staffHistoryState.historicalBookingQuery="";staffHistoryState.historicalBookingStart="";staffHistoryState.historicalBookingEnd="";
    staffHistoryState.historicalBookingStatus="ALL";staffHistoryState.historicalBookingDeleted="active";staffHistoryState.historicalBookingPage=1;
    void searchHistoricalBookings(1);return true;
  }
  if(a==="historical-prev"||a==="historical-next"){
    if(staffHistoryState.historicalBookingLoading||!staffHistoryState.historicalBookingResult)return true;
    const candidate=staffHistoryState.historicalBookingPage+(a==="historical-prev"?-1:1);
    const max=Math.max(1,Math.ceil(Number(staffHistoryState.historicalBookingResult.total||0)/25));
    if(candidate<1||candidate>max)return true;
    void searchHistoricalBookings(candidate);return true;
  }
  if(a==="apply-booking-filter"){
   staffHistoryState.staffBookingSearch=val("staff-booking-search").trim().slice(0,100);
   staffHistoryState.staffBookingDateFilter=["all","today","tomorrow","next7"].includes(val("staff-booking-date"))?val("staff-booking-date"):"all";
   staffHistoryState.staffBookingStatusFilter=["all","CONFIRMED","CHECKED_IN","COMPLETED","NO_SHOW","CANCELLED"].includes(val("staff-booking-status"))?val("staff-booking-status"):"all";
   render();return true;
 }
 if(a==="clear-booking-filter"){
   staffHistoryState.staffBookingSearch="";staffHistoryState.staffBookingDateFilter="all";staffHistoryState.staffBookingStatusFilter="all";
   render();return true;
 }
 if(a==="export-bookings"){
   if(routeState.view!=="staff"||staffState.staffTab!=="bookings"||!["OWNER","MANAGER","PLATFORM"].includes(staffState.staff?.role)){
     showActionFeedback("僅企業管理者可匯出預約資料。","error");return true;
   }
   const records=(staffState.staff?.pending_reservations||[]).concat(staffState.staff?.processed_reservations||[],staffState.staff?.deleted_reservations||[])
     .filter(x=>staffBookingMatches(x));
   // Leading formula characters must never be interpreted as spreadsheet formulas.
   const csvCell=value=>{
     let v=String(value??"").replace(/\r?\n/g," ");
     if(/^[\s]*[=+@-]/.test(v))v="'"+v;
     return '"'+v.replace(/"/g,'""')+'"';
   };
   const columns=["預約日期","時間","預約編號","預約姓名","聯絡手機","人數","目前狀態","送出預約時間","顧客端已隱藏"];
   const rows=records.map(x=>[x.day,x.time,x.number,x.name,x.phone||"",x.party,jsStatus(x.status),
     formatTaipeiCreated(x.created_at),x.deleted_at?"是":"否"]);
   const csv="\uFEFF"+[columns,...rows].map(row=>row.map(csvCell).join(",")).join("\r\n");
   const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
   const link=document.createElement("a");link.href=url;
   link.download="LINE_booking_"+routeState.slug+"_"+taipei()+".csv";
   document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
   showActionFeedback("已匯出目前篩選中的 "+records.length+" 筆預約資料，請妥善保護顧客資訊。","success");
   return true;
 }
 if(a==="export-analytics"){
   const a=staffState.staffAnalytics;
   if(!a||!Array.isArray(a.daily)){showActionFeedback("統計資料尚未載入","error");return true;}
   const csv="\uFEFF日期,預約筆數,取號筆數,有效訂餐筆數,有效訂餐金額（NTD）\r\n"+a.daily.map(d=>[String(d.date).slice(0,10),Number(d.reservations||0),Number(d.tickets||0),Number(d.orders||0),Number(d.order_amount||0)].join(",")).join("\r\n");
   const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
   const link=document.createElement("a");link.href=url;link.download="LINE_"+routeState.slug+"_"+staffState.analyticsDays+"days.csv";
   document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
   return true;
 }
return false;
}
