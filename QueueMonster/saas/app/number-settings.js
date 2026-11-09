function numberSettingsPanel(kind,t,isManager){
 const booking=kind==="booking",label=booking?"預約":"叫號";
 const prefix=booking?(t.booking_prefix||""):(t.queue_prefix||"");
 const last=booking?Number(t.booking_last_number||0):Number(t.queue_last_number||0);
 return box(label+"編號設定",
  '<p class="muted">預約與叫號各自獨立編號，流水號 1～9999999，不補零。僅管理員手動重置後從 1 開始。</p>'+
  '<div class="grid"><div>'+field("編號前綴（最多 3 字，可留空）","prefix-"+kind,prefix,"text",'maxlength="3" autocomplete="off"'+(isManager?"":' readonly'))+
  '</div><div><label>目前流水號</label><div class="serial-value">'+esc(prefix)+esc(last||1)+'</div><p class="small">'+(last===0?'尚未發號，第一筆從 1 開始。':'下一筆號碼：'+esc(prefix)+esc(last+1)+'。')+'重置後新資料從 '+esc(prefix)+'1 開始，歷史紀錄與原號碼不變。</p></div></div>'+
  (isManager?'<div class="staff-actionbar">'+btn("儲存"+label+"前綴","save-number-prefix","primary",'data-kind="'+kind+'"')+
   btn("重置"+label+"編號","reset-serial","outline",'data-kind="'+kind+'"')+'</div>':
   '<p class="small">僅企業管理員可修改編號設定。</p>'));
}
