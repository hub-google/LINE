import {unitSettingsPanel} from "../service-units.js";

export function renderStaffUnits({isManager,html}){
  html+='<div class="universal-staff-head"><div><h2>服務單位與場次</h2><p>同一個店家網址，同時適用醫院、餐飲、美髮與各式櫃台。</p></div>'+
   '<a class="btn primary" href="./template.html" target="_blank" rel="noopener noreferrer">查看通用公版預覽 ↗</a></div>'+
   unitSettingsPanel(isManager);

return html;
}
