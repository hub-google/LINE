function escapeIcsText(value){
 return String(value??"").replace(/\\/g,"\\\\").replace(/\r\n|\r|\n|\u2028|\u2029/g,"\\n")
  .replace(/;/g,"\\;").replace(/,/g,"\\,");
}
function foldIcsLine(line){
 const encoder=new TextEncoder(),chunks=[];
 let current="",bytes=0;
 for(const char of Array.from(line)){
  const len=encoder.encode(char).length;
  if(bytes+len>75){chunks.push(current);current=" "+char;bytes=1+len;}
  else{current+=char;bytes+=len;}
 }
 chunks.push(current);
 return chunks.join("\r\n");
}
function reservationToIcs(record,tenant,generatedAt=new Date().toISOString()){
 if(!record||!["CONFIRMED","CHECKED_IN"].includes(record.status))
  throw Error("這筆預約目前不能加入行事曆。");
 const day=String(record.day||""),time=String(record.time||"").slice(0,5);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
  throw Error("預約時間格式不正確，請重新整理。");
 const start=new Date(day+"T"+time+":00+08:00");
 if(!Number.isFinite(start.getTime())||new Intl.DateTimeFormat("sv-SE",
   {timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(start)!==day)
  throw Error("預約日期無效，請重新整理。");
 const minutes=Number(tenant?.slot_minutes);
 const duration=Number.isInteger(minutes)&&minutes>=5&&minutes<=240?minutes:30;
 const end=new Date(start.getTime()+duration*60000);
 const utc=x=>x.toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,"");
 const services=Array.isArray(record.selected_items)?record.selected_items.map(x=>x?.name||"").filter(Boolean).join("、"):"";
 const shop=tenant?.name||"門市";
 const description="預約編號："+String(record.number||"—")+"\n預約人數："+record.party+" 位"+
  (services?"\n服務項目："+services:"")+
  "\n此為一次性行事曆匯出，改期或取消不會自動同步，請以排隊怪獸預約頁的最新狀態為準。"+
  "\n預設標記 "+duration+" 分鐘，非實際服務時長保證。";
 const uid=String(record.id||"").replace(/[^a-zA-Z0-9-]/g,"");
 if(!/^[0-9a-f-]{36}$/i.test(uid))throw Error("預約識別碼異常，無法建立行事曆檔案。");
 const stamp=new Date(generatedAt);
 if(!Number.isFinite(stamp.getTime()))throw Error("行事曆匯出時間無效。");
 const lines=[
  "BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//LINE Booking//Reservation ICS//ZH-TW",
  "CALSCALE:GREGORIAN","METHOD:PUBLISH",
  "BEGIN:VEVENT","UID:"+uid+"@hub-google.github.io",
  "DTSTAMP:"+utc(stamp),"DTSTART:"+utc(start),"DTEND:"+utc(end),
  "SUMMARY:"+escapeIcsText(shop+" 預約"),
  "DESCRIPTION:"+escapeIcsText(description),
  "LOCATION:"+escapeIcsText(tenant?.address||""),
  "STATUS:CONFIRMED","END:VEVENT","END:VCALENDAR"
 ];
 return lines.map(foldIcsLine).join("\r\n")+"\r\n";
}
function downloadReservationIcs(bookingId){
 if(view!=="customer"||lineLinkStatus!=="linked"){
  showActionFeedback("請先完成 LINE 身分驗證，才能匯出自己的預約。","error");return;
 }
 const record=(customer?.my_reservations||[]).find(x=>x.id===bookingId);
 if(!record){showActionFeedback("找不到您的預約，請重新整理。","error");return;}
 try{
  const data=reservationToIcs(record,customer?.tenant);
  const href=URL.createObjectURL(new Blob([data],{type:"text/calendar;charset=utf-8"}));
  const anchor=document.createElement("a");
  anchor.href=href;anchor.download="LINE_booking_"+record.day+"_"+String(record.id).slice(0,8)+".ics";
  document.body.append(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(href),1500);
  showActionFeedback("已產生行事曆檔案；這是一次性匯入，未來改期或取消不會自動同步。","success");
 }catch(e){showActionFeedback(e?.message||"行事曆匯出失敗","error");}
}
