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


test('HR-LVE policy version and reserved balances cannot be approved without required stages',()=>{
 const policy=migration('20261104_workforce_prd_leave_policy_versions.sql');
 const ledger=migration('20261104_workforce_prd_leave_pending_ledger.sql');
 const stages=migration('20261104_workforce_prd_request_approval_stages.sql');
 const decision=migration('20261104_workforce_prd_approval_policy_balances.sql');
 const demo=migration('20261104_workforce_prd_demo_leave_api.sql');
 for(const term of ['wm_leave_policies','effective_from','yearly_basis','balance_required',
 'approval_levels','wm_save_leave_policy','wm_grant_leave_hours'])assert.ok(policy.includes(term),term);
 for(const term of ['wm_private.leave_balance_core','pending_hours','remaining_hours',
 'wm_leave_request_guard','wm_leave_balances'])assert.ok(ledger.includes(term),term);
 for(const term of ['wm_request_approval_steps','wm_review_request_step','wm_leave_final_approval_guard',
 'wm_request_step_status','leave_policy_id','不同主管'])assert.ok(stages.includes(term),term);
 assert.match(decision,/wm_private\.leave_balance_core/);
 assert.match(demo,/98d3505c-cbe6-46ed-a95a-13672e6d98f4/);
 assert.match(src,/wm_demo_leave_api/);
 assert.match(src,/wm_save_leave_policy/);
 assert.match(src,/wm_review_request_step/);
 assert.match(src,/showLeavePolicyForm/);
 assert.match(src,/showLeaveGrantForm/);
 assert.match(src,/pending_hours/);
});
test('HR-ORG sensitive wage columns are isolated from ordinary employee REST reads',()=>{
 const sql=migration('20261104_workforce_prd_private_wages.sql');
 assert.match(sql,/REVOKE SELECT ON TABLE public\.wm_members FROM authenticated/);
 assert.match(sql,/GRANT SELECT \(id,tenant_id,branch_id,user_id/);
 assert.doesNotMatch(sql,/GRANT SELECT \([^)]*hourly_rate/);
 assert.match(sql,/wm_staff_wages/);
 assert.match(src,/wm_staff_wages/);
 assert.match(src,/x\.tenant_id===app\.tenantId&&x\.user_id===app\.user\?\.id/);
});
test('leave UI selects latest effective policy and rejects stale version shadowing',()=>{
 assert.match(src,/const seen=new Set\(\)/);
 assert.match(src,/if\(!seen\.has\(p\.leave_kind\)\)/);
 assert.match(src,/p_on:today\(\)/);
 assert.match(src,/const leaveOptions=latest\.length/);
 assert.match(src,/if\(requestKind==='leave'\)fields\.push/);
});


test('HR-ATT-05 missing punch, late and early cases are tenant-scoped and immutable',()=>{
 const sql=migration('20261104_workforce_prd_attendance_anomalies.sql');
 for(const term of ['wm_attendance_anomalies','wm_private.scan_attendance_core',
  "missing_in","missing_out","late","early","wm_demo_attendance_api",
  "status='approved'","UNIQUE(tenant_id,shift_id,kind)"])assert.ok(sql.includes(term),term);
 assert.match(sql,/wm_private\.member_visible\(tenant_id,member_id\)/);
 assert.match(src,/TABS\.anomalies/);
 assert.match(src,/wm_demo_attendance_api/);
 assert.match(src,/wm_resolve_attendance_anomaly/);
 assert.match(src,/renderAttendanceCases/);
});

test('HR-LVE-07 private evidence requires per-request authorization, verified storage object and approval gate',()=>{
 const sql=migration('20261104_workforce_prd_private_evidence_bucket.sql');
 const guards=migration('20261104_workforce_prd_evidence_approval_guard.sql');
 for(const term of ['wm-private-evidence','5242880','image/jpeg','image/png','application/pdf',
   'wm_request_documents','wm_private.can_access_evidence','wm_request_evidence_storage_download',
   'wm_request_evidence_storage_upload','wm_request_evidence_guard'])assert.ok(sql.includes(term),term);
 assert.match(sql,/FOR INSERT TO authenticated/);
 assert.match(sql,/FOR SELECT TO authenticated/);
 assert.match(sql,/r.status='pending'/);
 assert.match(sql,/wm_private\.can_manage\(r\.tenant_id\)/);
 assert.match(guards,/JOIN storage\.objects o/);
 assert.match(guards,/此假別需要上傳證明附件後才能核准/);
 assert.match(src,/wm_request_documents/);
 assert.match(src,/\/storage\/v1\/object\/wm-private-evidence\//);
 assert.match(src,/\/storage\/v1\/object\/authenticated\/wm-private-evidence\//);
 assert.match(src,/app\.mode!=='real'/);
});

test('all employee app enhancements preserve the same static Github Pages app and backend',()=>{
 assert.match(src,/const API='https:\/\/unapiwajmgqqtdkixaab\.supabase\.co'/);
 assert.match(src,/const DEMO_ID='98d3505c-cbe6-46ed-a95a-13672e6d98f4'/);
 const open=src.match(/function openModal\(/g)||[];
 assert.equal(open.length,1);
 assert.doesNotThrow(()=>new vm.Script(src));
});



test('HR-SCH-05 tenant-defined hour/rest and cross-store permissions protect real shifts',()=>{
 const limits=migration('20261105_workforce_company_schedule_rules.sql');
 const assignment=migration('20261105_workforce_cross_branch_assignments.sql');
 const demo=migration('20261105_workforce_demo_company_schedule_rules.sql');
 for(const marker of ['wm_schedule_rules','min_rest_minutes','max_shift_minutes',
  'max_week_minutes','guard_shift_overlap'])assert.ok(limits.includes(marker),marker);
 for(const marker of ['wm_member_branches','wm_assign_branch','cross_branch_assigned',
  '員工未獲授權跨店'])assert.ok(assignment.includes(marker),marker);
 assert.match(demo,/98d3505c-cbe6-46ed-a95a-13672e6d98f4/);
 assert.match(src,/showScheduleRulesForm/);
 assert.match(src,/showBranchSupportForm/);
});
test('HR-ATT-04 QR is 90 seconds, identity checked, replay-guarded and locally rendered',()=>{
 const code=migration('20261105_workforce_dynamic_qr_clock.sql');
 const replay=migration('20261105_workforce_qr_replay_guard.sql');
 for(const term of ['wm_qr_challenges','wm_branch_qr_settings','wm_clock_qr','wm_issue_qr',
  '90 seconds','extensions.digest','allow_gps_replacement','wm.qr_verified_branch'])
  assert.ok(code.includes(term),term);
 for(const term of ['FOR UPDATE','wm_qr_uses','同一個 QR','idempotent'])
  assert.ok(replay.includes(term),term);
 const vendor=readFileSync(new URL('../vendor/qrcode.min.js',import.meta.url),'utf8');
 const license=readFileSync(new URL('../vendor/QR-CODE-LICENSE',import.meta.url),'utf8');
 assert.ok(vendor.length>10000);
 assert.match(license,/MIT License/);
 assert.match(src,/TABS\.qr/);
 assert.match(src,/wm_issue_qr/);
 assert.match(src,/wm_clock_qr/);
 assert.match(src,/\.\/vendor\/qrcode\.min\.js/);
});
test('HR-RPT personal attendance report excludes breaks across Taiwan midnight',()=>{
 const start=src.indexOf('function attendanceRows(');
 const end=src.indexOf('async function runAttendanceDetail(',start);
 assert.ok(start>0&&end>start);
 const taiDay=s=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(s));
 const taiStamp=s=>String(s);
 const person=id=>id==='u1'?{employee_code:'EM001',display_name:'虛構員工',
  branch_id:'b1',department_id:'d1'}:null;
 const parse=new Function('taiDay','taiStamp','person',
  src.slice(start,end)+';return attendanceRows;')(taiDay,taiStamp,person);
 const punch=(kind,at)=>({member_id:'u1',kind,punched_at:at});
 const out=parse([
  punch('IN','2026-11-04T23:00:00+08:00'),
  punch('BREAK_START','2026-11-05T00:00:00+08:00'),
  punch('BREAK_END','2026-11-05T00:30:00+08:00'),
  punch('OUT','2026-11-05T01:30:00+08:00')
 ],'2026-11-04','2026-11-05');
 assert.equal(out.length,1);
 assert.equal(out[0].day,'2026-11-04');
 assert.equal(out[0].workMinutes,120);
 assert.equal(out[0].incomplete,false);
});


test('HR sidebar remains usable with expanded PRD sections on desktop and mobile',()=>{
 const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(css,/\.sidebar nav\{[^}]*overflow-y:auto/);
 assert.match(css,/\.sidebar \.sidebar-foot\{[^}]*flex:0 0 auto/);
 assert.match(css,/@media \(max-width:760px\)\{[^}]*100dvh/);
 assert.match(src,/organizeWorkforceMenu/);
 for(const tab of ['overview','schedule','punch','requests','approvals','employees','reports',
  'inbox','periods','anomalies','line','qr','settings']) {
  assert.match(src,new RegExp("'"+tab+"'"));
 }
 assert.match(html,/<nav id="nav"/);
});
