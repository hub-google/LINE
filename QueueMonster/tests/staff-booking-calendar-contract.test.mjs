import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {runInNewContext} from "node:vm";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const app=readFileSync(path.join(root,"saas/index.html"),"utf8");
const css=readFileSync(path.join(root,"saas/booking-theme.css"),"utf8");
const sql=readFileSync(path.join(root,"supabase/migrations/20261104_staff_booking_calendar.sql"),"utf8");

test("calendar day/week/month periods are valid and handle leap years and year boundaries",()=>{
 const begin=app.indexOf("function calendarPeriod("),end=app.indexOf("function bookingCalendarPanel()");
 assert.ok(begin>=0&&end>begin);
 const funcs=runInNewContext(app.slice(begin,end)+"\n ({calendarPeriod,calendarShiftAnchor});",{Date,String,Number,Error});
 const day=funcs.calendarPeriod("day","2026-11-04");
 assert.equal(day.start,"2026-11-04");
 assert.equal(day.end,"2026-11-04");
 assert.equal(day.days.length,1);
 const week=funcs.calendarPeriod("week","2026-11-04");
 assert.equal(week.start,"2026-11-02");
 assert.equal(week.end,"2026-11-08");
 assert.equal(week.days.length,7);
 const month=funcs.calendarPeriod("month","2024-02-29");
 assert.equal(month.start,"2024-01-29");
 assert.equal(month.end,"2024-03-03");
 assert.equal(month.days.length,35);
 const year=funcs.calendarPeriod("month","2027-01-15");
 assert.equal(year.start,"2026-12-28");
 assert.equal(year.end,"2027-01-31");
 assert.equal(funcs.calendarShiftAnchor("month","2026-01-31",1),"2026-02-01");
 assert.equal(funcs.calendarShiftAnchor("day","2026-12-31",1),"2027-01-01");
 assert.throws(()=>funcs.calendarPeriod("month","2026-02-30"),/無效/);
 assert.throws(()=>funcs.calendarPeriod("year","2026-11-04"),/無效/);
});

test("calendar RPC is read-only, tenant-scoped and suppresses deleted reservations",()=>{
 assert.match(sql,/create or replace function public\.so_staff_reservation_calendar/);
 assert.match(sql,/if auth\.uid\(\) is null then/);
 assert.match(sql,/private\.so_role\(v_tenant\) is null and not private\.so_platform\(\)/);
 assert.match(sql,/r\.tenant_id=v_tenant and r\.deleted_at is null/);
 assert.match(sql,/p_end-p_start>41/);
 assert.match(sql,/v_size>100/);
 assert.match(sql,/group by booking_date/);
 assert.match(sql,/count\(\*\) filter\(where status='CONFIRMED'\)/);
 assert.match(sql,/sum\(party_size\) filter\(where status in \('CONFIRMED','CHECKED_IN'\)\)/);
 assert.match(sql,/order by booking_date,booking_time,created_at,id/);
 assert.match(sql,/limit v_size offset v_offset/);
 assert.match(sql,/revoke all on function public\.so_staff_reservation_calendar\([\s\S]*?from public,anon/);
 assert.match(sql,/grant execute on function public\.so_staff_reservation_calendar\([\s\S]*?to authenticated/);
 assert.doesNotMatch(sql,/\b(update|truncate|delete from|drop table|alter table)\b/i);
});

test("calendar UI is a separate read-only staff view with real server totals, pagination and date navigation",()=>{
 assert.match(app,/nav\("預約日曆","calendar",staffTab,"staff"\)/);
 assert.match(app,/else if\(staffTab==="calendar"\)\{\s*html\+=bookingCalendarPanel\(\)/);
 assert.match(app,/async function loadBookingCalendar\(page=calendarPage\)/);
 assert.match(app,/rpc\("so_staff_reservation_calendar",\{/);
 assert.match(app,/p_slug:merchant,p_start:period\.start,p_end:period\.end/);
 assert.match(app,/p_status:calendarStatus,p_page:page,p_page_size:100/);
 assert.match(app,/calendarRequestToken/);
 assert.match(app,/calendarTenant/);
 assert.match(app,/data-act="calendar-day"/);
 assert.match(app,/if\(a==="calendar-mode"\)/);
 assert.match(app,/if\(a==="calendar-prev"\|\|a==="calendar-next"\)/);
 assert.match(app,/if\(a==="calendar-page-prev"\|\|a==="calendar-page-next"\)/);
 assert.match(app,/if\(el\.id==="calendar-status"\)/);
 assert.match(app,/查看日曆不會自動取號/);
 assert.match(app,/不會安排員工或服務名額/);
});

test("responsive calendar uses seven columns and keyboard-focusable day buttons",()=>{
 assert.match(css,/\.booking-calendar-weekdays,\.booking-calendar-grid\{display:grid;grid-template-columns:repeat\(7/);
 assert.match(css,/\.booking-calendar-cell:focus-visible/);
 assert.match(css,/@media\(max-width:680px\)/);
 assert.match(app,/role="gridcell"/);
 assert.match(app,/aria-label/);
});
