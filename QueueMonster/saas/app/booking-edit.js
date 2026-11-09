function finishManageLink(){
 manageKind="";manageItem="";manageMode="view";
 const url=new URL(location.href);
 for(const key of ["manage","item","mode"])url.searchParams.delete(key);
 if(!url.searchParams.has("liff.state"))history.replaceState(null,"",url.pathname+url.search+url.hash);
}
function dateInThirtyDays(){
 const d=new Date(taipei()+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+30);
 return d.toISOString().slice(0,10);
}
async function fetchBookingEditSlots(){
 const id=editingBookingId,lookup=editDate;
 editLoading=true;editSlots=null;render();
 try{
   const viewData=await rpc("so_public_state",{p_slug:slug,p_date:lookup});
   if(editingBookingId===id&&editDate===lookup){
     editSlots=viewData.slots||[];
     if(!editSlots.some(s=>s.time===editTime))editTime="";
   }
 }catch(e){
   showActionFeedback("無法取得可預約時段："+(e.message||String(e)),"error");
 }finally{editLoading=false;render();}
}
async function beginBookingEdit(id){
 const record=(customer?.my_reservations||[]).find(x=>x.id===id);
 if(!record||record.status!=="CONFIRMED"){showActionFeedback("這筆預約目前無法編輯","error");return;}
 editingBookingId=id;editDate=String(record.day);editTime=String(record.time);editParty=Number(record.party);
 editChosenItems=Array.isArray(record.selected_items)?record.selected_items.map(x=>x.id):[];
 customerTab="mine";manageMode="edit";manageKind="reservation";manageItem=id;
 await fetchBookingEditSlots();
}
function editBookingForm(record){
 if(editingBookingId!==record.id)return "";
 const choices=(editSlots||[]).map(x=>{
  const isOriginal=x.time===record.time&&editDate===record.day;
  return '<option value="'+esc(x.time)+'" '+(editTime===x.time?'selected ':'')+
   (!isOriginal&&x.available<editParty?'disabled ':'')+'>'+esc(x.time)+'（剩餘 '+esc(x.available)+' 位）</option>';
 }).join("");
 return '<div class="staff-record" style="margin-top:12px;background:#f8fafc">'+
  '<h3 style="margin-top:0">編輯預約資訊</h3><div class="grid">'+
  '<div>'+field("預約日期","edit-book-date",editDate,"date",'min="'+taipei()+'" max="'+dateInThirtyDays()+'"')+'</div>'+
  '<div>'+field("預約人數","edit-book-party",editParty,"number",'min="1" max="20"')+'</div></div>'+
  '<label for="edit-book-time">預約時間</label>'+
  (editLoading?'<p class="muted">正在讀取可預約時段…</p>':
   '<select id="edit-book-time" class="field"><option value="">請選擇時段</option>'+choices+'</select>')+
  menuSelectSection(customer?.tenant?.menu_booking_mode||"DISABLED",customer?.menu_items||[],editChosenItems,"edit")+
  '<p class="staff-help">修改後會再次確認名額，預約編號維持不變，並發送更新通知。</p>'+
  '<div class="staff-actionbar">'+btn("儲存預約修改","save-book-edit","primary",!editTime||editLoading?'disabled':'')+
  btn("返回","close-book-edit","outline")+'</div></div>';
}


