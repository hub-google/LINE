import {unitSettingsPanel,unitStaffQueuePanel} from "../service-units.js";
import {staffLayoutState} from "../state/staffLayoutState.js";
import {staffState} from "../state/staffState.js";

export function renderStaffUnitQueue({html}){
 const isManager=["OWNER","MANAGER","PLATFORM"].includes(staffState.staff?.role);
 const expanded=staffLayoutState.staffUiExpanded.get("queue:unit-editor");
 html+=unitStaffQueuePanel();
 html+='<details class="staff-fold" data-staff-ui-key="queue:unit-editor" '+(expanded!==false?'open':'')+'>'+
   '<summary>'+(isManager?"直接新增／編輯服務單位與場次":"查看服務單位與場次")+'</summary>'+
   '<div class="staff-fold-body">'+unitSettingsPanel(isManager)+'</div></details>';
 return html;
}
