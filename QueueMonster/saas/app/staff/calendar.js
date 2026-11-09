import {bookingCalendarPanel} from "../booking-calendar.js";

export function renderStaffCalendar({html}){
   html+=bookingCalendarPanel();

return html;
}
