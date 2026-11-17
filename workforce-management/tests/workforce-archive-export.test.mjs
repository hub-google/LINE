import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const gateway=readFileSync(new URL('../supabase/migrations/20261117195000_workforce_archive_gateway.sql',import.meta.url),'utf8');
const retirement=readFileSync(new URL('../supabase/migrations/20261117200200_workforce_retire_legacy_archive.sql',import.meta.url),'utf8');
const start=source.indexOf('const WF_ARCHIVE_TABLES=');
const end=source.indexOf("document.addEventListener('click',async event=>{",start);
assert.ok(start>0&&end>start,'Archive feature must exist');
const script=source.slice(start,end);

function harness({rowsPerTable={},failTable='',changeTenant=false,
 roleValue='owner',corruption=''}={}){
 const app={mode:'real',token:'JWT',tenantId:'tenant-A',user:{id:'user-A'},
  data:{members:[]},tab:'backup'};
 const TABS={};
 let file='',downloads=0;
 const document={
  querySelector:()=>({insertAdjacentHTML(){}}),
  createElement:()=>({click(){downloads++},remove(){}}),
  body:{appendChild(){}}
 };
 class BlobMock{constructor(parts){file=parts.join('');}}
 const URLMock={createObjectURL:()=>'/file',revokeObjectURL(){}};
 const requests=[];
 const call=async(url,method,payload)=>{
  requests.push({url,method,payload});
  assert.equal(url,'/rest/v1/rpc/wm_archive_table_page');
  assert.equal(method,'POST');
  const table=payload.p_table;
  if(table===failTable)throw Error('DATABASE_DENIED');
  if(changeTenant){app.tenantId='tenant-B';changeTenant=false;}
  const offset=payload.p_offset,limit=payload.p_limit;
  const count=rowsPerTable[table]??1;
  const total=corruption==='changed'&&table==='wm_notifications'&&offset>=500?count+1:count;
  const pageCount=corruption==='missing'&&table==='wm_notifications'&&offset>=500
   ?0:Math.max(0,Math.min(limit,count-offset));
  const rows=Array.from({length:pageCount},(_,index)=>{
   const n=(corruption==='duplicate'&&table==='wm_notifications'&&offset>=500)
    ?index:offset+index;
   const row={tenant_id:corruption==='foreign'&&table==='wm_notifications'
    ?'tenant-B':'tenant-A'};
   if(table==='wm_tenants')return {id:'tenant-A',name:'QA company'};
   if(table==='wm_branch_qr_settings')return {...row,branch_id:'branch-'+n};
   if(table==='wm_qr_uses')return {...row,challenge_id:'challenge-'+n,member_id:'member-'+n};
   if(['wm_attendance_rules','wm_availability_policies','wm_schedule_rules'].includes(table))
    return row;
   return {...row,id:table+'-'+n};
  });
  return {table,tenant_id:'tenant-A',offset,limit,total_count:total,rows};
 };
 const api=new Function('app','TABS','document','$','render','heading','panel','role',
  'call','Blob','URL','setTimeout','today','wfAuthGeneration',
  script+';return {wfArchivePages,wfExportTenantArchive,WF_ARCHIVE_TABLES};')(
   app,TABS,document,()=>({}),()=>{},()=>{},()=>'',()=>roleValue,
   call,BlobMock,URLMock,()=>{},()=> '2026-11-17',0);
 return {api,app,requests,get downloads(){return downloads;},get file(){return file;}};
}

test('33 authorized HR history tables export through one backend permission boundary',async()=>{
 const h=harness({rowsPerTable:{wm_shifts:1001,wm_notifications:1201}});
 const counts=await h.api.wfExportTenantArchive();
 assert.equal(h.api.WF_ARCHIVE_TABLES.length,33);
 assert.equal(Object.keys(counts).length,33);
 assert.equal(counts.wm_shifts,1001);
 assert.equal(counts.wm_notifications,1201);
 const payload=JSON.parse(h.file);
 assert.equal(payload.format,'workforce-operational-export-v2');
 assert.equal(payload.tenant_id,'tenant-A');
 assert.equal(payload.tables.wm_notifications.length,1201);
 assert.equal(h.downloads,1);
 for(const table of ['wm_leave_amendment_steps','wm_leave_amendments','wm_leave_cancellations',
  'wm_request_approval_steps','wm_org_role_audit','wm_shift_revisions','wm_audit'])
  assert.ok(payload.tables[table]!==undefined,table);
 assert.equal(h.requests.filter(r=>r.payload.p_table==='wm_shifts').length,3);
 assert.equal(h.requests.filter(r=>r.payload.p_table==='wm_notifications').length,3);
 assert.ok(h.requests.every(r=>r.payload.p_tenant==='tenant-A'));
});

test('Employees cannot export company data even when using the same static client',async()=>{
 const h=harness({roleValue:'employee'});
 await assert.rejects(h.api.wfExportTenantArchive(),/登入身分已變更/);
 assert.equal(h.requests.length,0);
 assert.equal(h.downloads,0);
});

test('Errors and tenant changes never download a partial archive',async()=>{
 for(const options of [{failTable:'wm_punches'},{changeTenant:true}]){
  const h=harness(options);
  await assert.rejects(h.api.wfExportTenantArchive());
  assert.equal(h.downloads,0);
 }
});

test('Count changes, duplicate pages, missing pages and foreign-tenant rows fail closed',async()=>{
 for(const corruption of ['changed','duplicate','missing','foreign']){
  const h=harness({rowsPerTable:{wm_notifications:1001},corruption});
  await assert.rejects(h.api.wfExportTenantArchive(),undefined,corruption);
  assert.equal(h.downloads,0);
 }
});

test('Composite-key QR usage and singleton settings are not mistaken for duplicates',async()=>{
 const h=harness({rowsPerTable:{wm_qr_uses:503,wm_branch_qr_settings:2}});
 const rows=await h.api.wfExportTenantArchive();
 assert.equal(rows.wm_qr_uses,503);
 assert.equal(rows.wm_branch_qr_settings,2);
});

test('Allowlisted RPC excludes invitation credentials, linked LINE identities and private wage rates',()=>{
 const h=harness();
 const selected=h.api.WF_ARCHIVE_TABLES;
 for(const excluded of ['wm_invites','wm_org_invites','wm_line_links','wm_qr_challenges'])
  assert.ok(!selected.includes(excluded),excluded);
 assert.doesNotMatch(gateway,/v_columns:='[^']*hourly_rate/);
 for(const table of selected)assert.ok(gateway.includes("'"+table+"'"),table);
 assert.match(gateway,/COALESCE\(wm_private\.my_role\(p_tenant\) NOT IN \('owner','hr'\),true\)/);
 assert.match(gateway,/REVOKE ALL ON FUNCTION public\.wm_archive_table_page/);
 assert.match(gateway,/TO authenticated/);
 assert.match(source,/非同一時間點/);
});

test('Superseded per-notification export has been retired without a second authorization path',()=>{
 assert.doesNotMatch(source,/wm_export_notification_archive/);
 assert.match(retirement,/DROP FUNCTION public\.wm_export_notification_archive/);
 assert.match(retirement,/to_regprocedure\('public\.wm_archive_table_page/);
});
