import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "./helpers/source-fs.mjs";
import { spawnSync } from "node:child_process";

const read = file => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const ui = read("saas/index.html");
const board = read("saas/board.html");
const bridge = read("supabase/functions/line-bridge/index.ts");
const sql = read("supabase/migrations/20261105_unified_service_queues.sql");
const lookup = read("supabase/migrations/20261105_unified_service_queues_records.sql");
const prd = read("PRD.md");

test("new service-unit switches are opt-in with legacy booking/queue modules retained", () => {
  for (const key of ["multi_unit_enabled", "grouped_units_enabled", "checkin_queue_enabled"])
    assert.match(sql, new RegExp(key + "[^\\n]*default false"));
  assert.match(ui, /unitEnabled=\(\)=>unitConfig\?\.multi===true/);
  assert.match(ui, /if\(!m\.reservation\)/);
  assert.match(ui, /else if\(unitEnabled\(\)\)html=unitBookingPanel\(\)/);
  assert.match(ui, /else if\(unitEnabled\(\)\)html=unitQueuePanel\(\)/);
  assert.match(ui, /so_book_with_contact_once/);
  assert.match(ui, /so_take_number_with_party/);
});

test("one shared tenant and resource model, not separate doctor/restaurant products", () => {
  assert.match(sql, /alter table public\.so_booking_resources/);
  assert.match(sql, /create table if not exists public\.so_service_sessions/);
  assert.match(sql, /foreign key \(tenant_id,unit_id\) references public\.so_booking_resources/);
  assert.match(sql, /add column if not exists service_session_id uuid/);
  assert.match(ui, /so_unit_manage/);
  assert.match(ui, /unitSettingsPanel/);
  assert.match(ui, /unitEnabled\(\)\?"":box\("預約資源/);
  assert.match(prd, /2026-11-05 通用服務單位/);
});

test("session booking protects capacity, idempotency, and tenant isolation", () => {
  assert.match(sql, /create or replace function public\.so_unit_book_once/);
  assert.match(sql, /for update/);
  assert.match(sql, /client_request_id=p_request_id/);
  assert.match(sql, /service_session_id=s\.id/);
  assert.match(sql, /if \(select coalesce\(sum\(party_size\),0\)/);
  assert.match(sql, /if v_count\+new\.party_size>s\.capacity/);
});

test("check-in is atomic and does not duplicate reservation queue ticket", () => {
  assert.match(sql, /create or replace function public\.so_unit_checkin/);
  assert.match(sql, /where reservation_id=r\.id for update/);
  assert.match(sql, /'replayed',true/);
  assert.match(sql, /private\.so_next_ticket_number/);
  assert.match(sql, /'RESERVATION'/);
  assert.match(ui, /so_unit_checkin/);
  assert.match(ui, /so_staff_set_reservation_status/);
});

test("independent queue RPC isolates current service session; link record lookup is authorized", () => {
  assert.match(sql, /create or replace function public\.so_unit_call/);
  assert.match(sql, /service_session_id=s\.id/);
  assert.match(sql, /create or replace function public\.so_unit_progress/);
  assert.match(sql, /create or replace function public\.so_unit_set_ticket_status/);
  assert.match(lookup, /private\.so_role\(t\.id\)/);
  assert.match(lookup, /so_line_links me/);
  assert.match(sql, /alter table public\.so_service_sessions enable row level security/);
});

test("one responsive TV board handles single and multiple queues without customer data", () => {
  assert.match(board, /so_unit_public_board/);
  assert.match(board, /so_public_board/);
  assert.match(board, /selectedSession/);
  assert.match(board, /renderUnits\(/);
  assert.doesNotMatch(board, /customer_name|customer_phone|line_sub|service_role/i);
  assert.match(board, /textContent/);
  assert.match(sql, /grant execute on function public\.so_unit_public_board\(text,uuid\) to anon,authenticated/);
});

test("LINE notice includes scoped session and preserves existing recipient behavior", () => {
  assert.match(bridge, /serviceSessionNoticeLines/);
  assert.match(bridge, /ticket\.service_session_id/);
  assert.match(bridge, /scope\(db\.from\("so_tickets"\)/);
  assert.match(bridge, /LINE_MESSAGING_ACCESS_TOKEN/);
  assert.match(bridge, /line_sub/);
});

test("new customer and board module JavaScript parses", () => {
  for (const [name, html] of [["index.html",ui],["board.html",board]]) {
    const matches = [...html.matchAll(/<script\b[^>]*type=["']module["'][^>]*>([\s\S]*?)<\/script>/g)];
    assert.equal(matches.length,1, name);
    const checked=spawnSync(process.execPath,["--input-type=module","--check"],{
      input:matches[0][1],encoding:"utf8"
    });
    assert.equal(checked.status,0,name+": "+checked.stderr);
  }
});


test("settings groups service windows, menu, branches and business profile under a single entry",()=>{
 const view=read("saas/app/staff-view.js");
 const hub=read("saas/app/staff/settings.js");
 assert.match(view,/const menu=nav\("設定","settings"/);
 assert.doesNotMatch(view,/nav\("菜單及服務設定","menu"/);
 assert.doesNotMatch(view,/nav\("多分店管理","branches"/);
 for(const section of ["profile","operations","sessions","catalog","branches","customers","public"])
  assert.match(hub,new RegExp('\\["'+section+'","'));
 assert.match(hub,/renderStaffMenu\(/);
 assert.match(hub,/renderStaffBranches\(/);
 assert.match(hub,/unitSettingsPanel\(/);
});

test("ordinary shops can create sessions without a window, and edit/delete actions are guarded",()=>{
 const ui=read("saas/app/service-units.js");
 const actions=read("saas/app/actions/service-unit-actions.js");
 const migration=read("supabase/migrations/20261110175000_settings_sessions_optional_window.sql");
 assert.match(ui,/不指定（一般場次）/);
 assert.match(ui,/unit-session-edit/);
 assert.match(ui,/unit-session-delete/);
 assert.match(ui,/unit-session-start",editing\?\.start\|\|"09:00","time"\)/);
 assert.match(actions,/p_action:"session_delete"/);
 assert.match(actions,/unit_id:val\("unit-admin-unit"\)\|\|null/);
 assert.match(migration,/is_default_session_unit/);
 assert.match(migration,/deleted_at is null/);
 assert.match(migration,/此場次仍有有效預約或候位號碼/);
});


test("no-window mode lists active sessions linked to real resource ids, including one-unit shops",()=>{
 const ui=read("saas/app/service-units.js");
 const first=ui.indexOf("export function unitList()");
 const last=ui.indexOf("export function unitBookingFingerprint(");
 assert.ok(first>=0&&last>first,"expected pure session selection functions");
 const source=ui.slice(first,last).replaceAll("export function ","function ");
 const factory=new Function("serviceUnitsState","bookingState","routeState","taipei",source+";return {sessionsOf,selectedUnitSession};");
 const date="2099-12-01";
 const s1={id:"session-a",unit_id:"unit-a",date,start:"09:00",end:"12:00",active:true,capacity:20,booked:1};
 const s2={id:"session-b",unit_id:"unit-b",date,start:"10:00",end:"13:00",active:true,capacity:20,booked:0};
 const state={unitConfig:{picker:false,units:[{id:"unit-a",active:true},{id:"unit-b",active:true}],sessions:[s1,s2]},unitChoice:"unit-a",unitCategory:"",unitSessionChoice:"session-b"};
 const app=factory(state,{bookingParty:2},{customerTab:"reserve"},()=>date);
 assert.equal(app.sessionsOf(null,"reserve").length,2,"null means all active sessions when no window picker");
 assert.equal(app.selectedUnitSession("reserve").id,"session-b","explicit session remains selectable across named units");
 state.unitConfig.picker=true;
 assert.equal(app.selectedUnitSession("reserve").id,"session-a","picker limits sessions to chosen named unit");
 state.unitConfig.units=[{id:"unit-a",active:true}];state.unitConfig.sessions=[s1];
 assert.equal(app.selectedUnitSession("reserve").id,"session-a","single window works whether picker is on or off");
 state.unitConfig.picker=false;
 assert.equal(app.selectedUnitSession("reserve").id,"session-a","ordinary shop default unit still provides sessions");
 assert.match(ui,/dateInNinetyDays\(\)/);
});

test("session based booking date picker agrees with the backend 90-day session limit",()=>{
 const ui=read("saas/app/service-units.js"),dates=read("saas/app/booking-edit.js");
 const match=dates.match(/export function dateInNinetyDays\(\)\{[\s\S]*?\n\}/);
 assert.ok(match,"90-day helper exists");
 const compute=new Function("taipei",match[0].replace("export ","")+";return dateInNinetyDays;")(()=> "2026-11-11");
 assert.equal(compute(),"2027-02-09");
 assert.match(ui,/max="'\+dateInNinetyDays\(\)\+'"/);
 assert.match(read("supabase/migrations/20261110175000_settings_sessions_optional_window.sql"),/interval '90 days'|\+90/);
});

test("QueueMonster FK performance migration is additive and retains board RLS semantics",()=>{
 const sql=read("supabase/migrations/20261111090000_queue_monster_fk_index_performance.sql");
 assert.equal((sql.match(/CREATE INDEX IF NOT EXISTS/g)||[]).length,15);
 assert.doesNotMatch(sql,/\\b(?:TRUNCATE|DROP TABLE|DELETE FROM|UPDATE\\s+public\\.so_)\\b/i);
 for(const table of ["so_audit","so_invites","so_line_links","so_members","so_membership_exits","so_reservations","so_service_rules","so_tenants","so_tickets"]){
  assert.ok(sql.includes("ON public."+table+" ("),"missing covering index on "+table);
 }
 assert.match(sql,/ALTER POLICY so_queue_displays_active_read/);
 assert.match(sql,/TO authenticated/);
 assert.match(sql,/SELECT auth\.uid\(\)/);
 assert.match(sql,/t\.status='ACTIVE'/);
});


test("one renderer powers ordinary queues and independent sessions without losing history",()=>{
 const queue=read("saas/app/staff/queue.js");
 const view=read("saas/app/staff-view.js");
 const unit=read("saas/app/service-units.js");
 assert.equal((view.match(/renderStaffQueue\(/g)||[]).length,1,"one queue rendering entrypoint");
 assert.doesNotMatch(view,/renderStaffUnitQueue/);
 assert.doesNotMatch(unit,/unitStaffQueuePanel/);
 assert.doesNotMatch(view,/staff\/unit-queue/);
 assert.match(queue,/unitMode\?"unit-call":"call"/);
 assert.match(queue,/unitMode\?"unit-recall":"recall"/);
 const source=queue.slice(queue.indexOf("export function renderStaffQueue("))
   .replace("export function renderStaffQueue","function renderStaffQueue");
 const dependencies=["routeState","sharedUiState","staffHistoryState","staffState","serviceUnitsState",
   "box","btn","esc","formatTaipeiCreated","queueSessionName","selectedItemsHtml",
   "staffDeletePicker","staffStatusPicker","stat","tag","numberSettingsPanel","staffListPage","unitNameForSession"];
 const factory=new Function(...dependencies,source+";return renderStaffQueue;");
 const c=(id,status,session,name)=>({id,status,service_session_id:session,number:id,name,
   day:"2026-11-11",party:1,created_at:"2026-11-11T02:00:00Z"});
 const working=c("w1","WAITING","session-a","等待客戶");
 const older=c("old","PASSED","session-previous","跨場次客戶");
 const finished=c("d1","COMPLETED","session-a","已完成客戶");
 const cancelled=c("c1","CANCELLED","session-previous","已取消客戶");
 const deleted={...c("x1","COMPLETED","session-a","已刪除客戶"),deleted_at:"2026-11-11T02:00:00Z"};
 const state={mode:false,unitStaffSession:"session-a",unitConfig:{sessions:[
   {id:"session-a",name:"上午場",start:"09:00",active:true}]}};
 const data={staff:{active_tickets:[working,older],processed_tickets:[finished,cancelled],
   deleted_tickets:[deleted],queue_session:{code:"MORNING"}}};
 const ui=factory({slug:"test-store"},{
   route:()=>"?view=staff&merchant=test-store",lastStaffChange:{slug:"test-store"}
 },{staffHistoryDays:30},data,{unitEnabled:()=>state.mode,
   get unitConfig(){return state.unitConfig},get unitStaffSession(){return state.unitStaffSession}},
   (heading,inner)=>"<section><h2>"+heading+"</h2>"+inner+"</section>",
   (label,action,style="",attrs="")=>'<button data-act="'+action+'" '+attrs+'>'+label+'</button>',
   x=>String(x??""),x=>x||"無",x=>x||"早場",()=>"",
   (_,item)=>'<status data-ticket="'+item.id+'">'+item.status+'</status>',
   (_,item)=>'<delete data-ticket="'+item.id+'"></delete>',
   (label,value)=>label+"="+value,
   status=>"<tag>"+status+"</tag>",
   ()=>"NUMBER SETTINGS",
   (items,key,render)=>items.map(render).join(""),
   ()=>"一般場次");
 const plain=ui({isManager:true,t:{modules:{calling:true}},html:""});
 assert.match(plain,/取號場次管理/);
 assert.match(plain,/NUMBER SETTINGS/);
 assert.match(plain,/data-act="call"/);
 assert.match(plain,/已結束號碼牌/);
 assert.match(plain,/已完成客戶/);
 assert.match(plain,/已取消客戶/);
 assert.match(plain,/已刪除客戶/);
 state.mode=true;
 const multi=ui({isManager:true,t:{modules:{calling:true}},html:""});
 assert.match(multi,/按場次獨立叫號/);
 assert.match(multi,/data-act="unit-call"/);
 assert.match(multi,/data-act="unit-recall"/);
 assert.match(multi,/本隊列看板/);
 assert.match(multi,/已處理號碼牌/);
 assert.match(multi,/已完成客戶/);
 assert.match(multi,/已取消客戶/);
 assert.match(multi,/跨場次客戶/);
 assert.match(multi,/已刪除客戶/);
 assert.match(multi,/data-act="undo-staff"/);
 assert.doesNotMatch(multi,/NUMBER SETTINGS/);
 state.unitConfig.sessions=[];
 const closed=ui({isManager:true,t:{modules:{calling:true}},html:""});
 assert.match(closed,/沒有可操作的場次/);
 assert.match(closed,/已完成客戶/,"closing a session never hides its history");
 const actions=read("saas/app/actions/staff-queue-actions.js");
 const form=read("saas/app/form-events.js");
 assert.match(actions,/export function ticketStatusRpc\(id\)/);
 assert.match(actions,/ticketStatusRpc\(previous\.id\)/);
 assert.match(form,/ticketStatusRpc\(id\)/);
 assert.doesNotMatch(form,/unitRelated\?"so_unit_set_ticket_status"/);
});
