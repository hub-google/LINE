import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "./helpers/source-fs.mjs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const sql=readFileSync(path.join(root,"supabase/migrations/20261104_queue_ticket_party_size_k03.sql"),"utf8");
const app=readFileSync(path.join(root,"saas/index.html"),"utf8");

test("K03 party_size is additive and preserves all historical ticket identity",()=>{
 assert.match(sql,/alter table public\.so_tickets\s+add column if not exists party_size integer not null default 1/i);
 assert.match(sql,/check\(party_size between 1 and 20\)/);
 assert.doesNotMatch(sql,/truncate\s+|delete\s+from\s+public\.so_tickets|drop\s+table/i);
 assert.doesNotMatch(sql,/update public\.so_tickets\s+set\s+ticket_no/i);
});

test("ticket creation delegates to original LINE-verified number generator in same transaction",()=>{
 assert.match(sql,/create or replace function public\.so_take_number_with_party\(/);
 assert.match(sql,/p_slug text,p_name text,p_items jsonb,p_party_size integer/);
 assert.match(sql,/if auth\.uid\(\) is null then/);
 assert.match(sql,/p_party_size is null or p_party_size<1 or p_party_size>20/);
 assert.match(sql,/v_result:=public\.so_take_number_with_items\(p_slug,p_name,p_items\)/);
 assert.match(sql,/v_ticket:=\(v_result->>'id'\)::uuid/);
 assert.match(sql,/k\.id=v_ticket and k\.tenant_id=t\.id and t\.slug=p_slug/);
 assert.match(sql,/k\.user_id=auth\.uid\(\) and k\.deleted_at is null/);
 assert.match(sql,/if v_count<>1 then/);
 assert.match(sql,/revoke all on function public\.so_take_number_with_party\(text,text,jsonb,integer\) from public,anon/);
 assert.match(sql,/grant execute on function public\.so_take_number_with_party\(text,text,jsonb,integer\) to authenticated/);
});

test("all original scoped endpoints include party count without allowing public ticket listing",()=>{
 for(const f of ["so_public_state","so_staff_worklist","so_staff_state","so_customer_cross_store_overview","so_queue_live"]){
  assert.match(sql,new RegExp("CREATE OR REPLACE FUNCTION public\\."+f+"\\("));
 }
 assert.match(sql,/'my_tickets',[\s\S]*?'party',k\.party_size/);
 assert.match(sql,/'active_tickets',[\s\S]*?'party',k\.party_size/);
 assert.match(sql,/'processed_tickets',[\s\S]*?'party',k\.party_size/);
 assert.match(sql,/'mine',case when k\.id is null then null else jsonb_build_object\([\s\S]*?'party',k\.party_size/);
 assert.match(sql,/'selected_items',x\.selected_items,'party',x\.party_size/);
 assert.match(sql,/k\.selected_items,k\.party_size/);
 assert.doesNotMatch(sql,/grant\s+execute\s+on\s+function\s+public\.so_public_state/i);
});

test("customer chooses party before queueing, staff and customer see group size",()=>{
 assert.match(app,/queuePartySize=2/);
 assert.match(app,/field\("本次候位人數（1～20 人）","customer-queue-party",queuePartySize/);
 assert.match(app,/一張號碼牌代表一組/);
 assert.match(app,/if\(el\.id==="customer-queue-party"\)/);
 assert.match(app,/!Number\.isInteger\(party\)\|\|party<1\|\|party>20/);
 assert.match(app,/rpc\("so_take_number_with_party",\{p_slug:slug,p_name:lineDisplayName,p_items:queueChosenItems\.slice\(\),p_party_size:party\}\)/);
 assert.match(app,/const ownParty=own\?\.party\|\|fallbackTicket\?\.party\|\|1/);
 assert.match(app,/我的候位人數：/);
 assert.match(app,/候位人數：/);
 assert.match(app,/esc\(x\.party\|\|1\)\+' 人／組/);
});
