import {staffViewState} from "./state/staffViewState.js";
import {btn,esc} from "./shared-ui.js";

// Central allowlist for all visible staff lists; pagination must work for every queue mode.
export function isStaffListKey(key){
 return /^(?:(?:booking|ticket)-(?:open|done|deleted)|unit-queue-(?:open-[A-Za-z0-9_-]{1,80}|other-open|processed|deleted))$/.test(String(key||""));
}

export function staffListPage(items,key,renderItem){
 const limit=Math.min(500,staffViewState.staffVisibleLimits.get(key)||12);
 return items.slice(0,limit).map(renderItem).join("")+(items.length>limit?
  '<div class="staff-list-more"><span>已顯示 '+Math.min(limit,items.length)+' / '+items.length+' 筆</span>'+
  btn("再顯示 12 筆","staff-show-more","outline",'data-list-key="'+esc(key)+'"')+'</div>':"");
}
export function initializeStaffView(){
staffViewState.staffVisibleLimits=new Map();
}
