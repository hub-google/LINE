import {unitStaffQueuePanel} from "../service-units.js";

export function renderStaffUnitQueue({html}){
   html+=unitStaffQueuePanel();

return html;
}
