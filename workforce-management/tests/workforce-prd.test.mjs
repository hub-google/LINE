import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const src=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const migration=name=>readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');

test('Workforce client remains syntactically valid and contains only publishable key',()=>{
 assert.doesNotThrow(()=>new vm.Script(src));
 assert.match(src,/sb_publishable_/);
 assert.doesNotMatch(src,/sb_secret_[A-Za-z0-9]|service_role\s*[:=]\s*['"]/);
});
test('existing public demo routes remain available',()=>{
 for(const marker of ['const DEMO_ID=','wm_demo_api','wm_clock','wm_submit_request','wm_decide_request',
  'function schedule()','function punch()','function employees()','function reports()'])assert.ok(src.includes(marker),marker);
});
test('extended HR PRD UI is wired to real server actions',()=>{
 for(const marker of ['wm_create_invite','wm_accept_invite','wm_import_employees','wm_copy_week',
  'wm_insert_draft_schedule','wm_create_swap','wm_consent_swap','wm_review_swap',
  'wm_month_report','wm_close_month','wm_adjust_closed_month','wm_withdraw_request',
  'TABS.inbox','TABS.periods','newDepartment','newAvailability','newRequirement','newTemplate',
  'csvRows','proposeWorkforceWeek','newAdjustment'])assert.ok(src.includes(marker),marker);
});
test('auto schedule makes fair, nonoverlapping Monday suggestions',()=>{
 const start=src.indexOf('function proposeWorkforceWeek(){');
 const end=src.indexOf('const previousScheduleAuto=schedule;',start);
 assert.ok(start>0&&end>start);
 const body=src.slice(start,end);
 const dayAdd=(d,n)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);};
 const taiDay=s=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(s));
 const data={date:'2026-11-09',data:{
  members:[{id:'one',branch_id:'branch',employee_code:'001',status:'active'},
   {id:'two',branch_id:'branch',employee_code:'002',status:'active'}],
  requirements:[{branch_id:'branch',weekday:1,starts_local:'09:00:00',ends_local:'17:00:00',needed:2}],
  shifts:[],requests:[],availability:[]}};
 const result=new Function('app','dayAdd','taiDay',body+';return proposeWorkforceWeek();')(data,dayAdd,taiDay);
 assert.equal(result.suggestions.length,2);
 assert.equal(result.gaps.length,0);
 assert.notEqual(result.suggestions[0].member_id,result.suggestions[1].member_id);
 assert.equal(result.suggestions[0].starts_at,'2026-11-09T01:00:00.000Z');
});
test('CSV parser supports Chinese headers, quoted commas and branch lookup',()=>{
 const start=src.indexOf('function csvRows(text){'),end=src.indexOf('function downloadCsv(){',start);
 assert.ok(start>0&&end>start);
 const fn=new Function('app',src.slice(start,end)+';return csvRows;')({
  mode:'demo',data:{branches:[{id:'b1',name:'台北,中山店'}]}});
 const rows=fn('員工編號,姓名,分店,角色,聘僱類型\nCSV003,"王,小明","台北,中山店",員工,兼職\n');
 assert.equal(rows.length,1);
 assert.equal(rows[0].name,'王,小明');
 assert.equal(rows[0].branch_id,'b1');
 assert.equal(rows[0].employment_type,'part_time');
});
test('all critical database RPCs and tenant RLS guards are versioned',()=>{
 const base=migration('20261104_workforce_prd_departments_invitations_inbox.sql');
 const swap=migration('20261104_workforce_prd_shift_swap_approval.sql');
 const monthly=migration('20261104_workforce_prd_monthly_reports_corrections.sql');
 const gps=migration('20261104_workforce_prd_gps_punch_guard.sql');
 const importSql=migration('20261104_workforce_prd_bulk_employee_import.sql');
 for(const fragment of ['wm_create_invite','wm_accept_invite','wm_notifications',
  'wm_departments','wm_staffing_requirements','wm_private.is_owner'])assert.ok(base.includes(fragment),fragment);
 for(const fragment of ['wm_create_swap','wm_consent_swap','wm_review_swap','wm_shift_revisions','target_accepted_at'])assert.ok(swap.includes(fragment),fragment);
 for(const fragment of ['wm_month_report','wm_close_month','wm_adjust_closed_month','wm_attendance_adjustments'])assert.ok(monthly.includes(fragment),fragment);
 for(const fragment of ['wm_punch_validate','v_branch.gps_required','same']){if(fragment!=='same')assert.ok(gps.includes(fragment),fragment);}
 assert.match(importSql,/on conflict\(tenant_id,employee_code\) do nothing/);
 assert.match(swap,/private\.can_manage|wm_private\.can_manage/);
});
