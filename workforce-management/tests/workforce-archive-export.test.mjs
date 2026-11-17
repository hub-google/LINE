import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const appSource=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const from=appSource.indexOf('const WF_ARCHIVE_TABLES=');
const to=appSource.indexOf("$('appContent').addEventListener('click',async event=>{",from);
assert.ok(from>0&&to>from,'Archive module should exist');
const fragment=appSource.slice(from,to);

function harness({rowsPerTable={},failTable='',changeTenant=false,roleValue='owner'}={}){
 const app={mode:'real',token:'authenticated-jwt',tenantId:'tenant-A',user:{id:'user-A'},
  data:{members:[]},tab:'backup'};
 const TABS={};
 const fakeDocument={
  querySelector:()=>({insertAdjacentHTML(){}}),
  createElement:()=>({click(){downloads++},remove(){}}),
  body:{appendChild(){}}
 };
 let downloads=0,archiveText='',requests=[];
 class BlobMock{constructor(parts){archiveText=parts.join('');}}
 const URLMock={createObjectURL:()=>'/local-json-file',revokeObjectURL(){}};
 const call=async(url)=>{
  requests.push(url);
  const table=url.match(/\/rest\/v1\/(wm_[a-z_]+)/)?.[1];
  const offset=Number(url.match(/[&?]offset=(\d+)/)?.[1]||0);
  const limit=Number(url.match(/[&?]limit=(\d+)/)?.[1]||500);
  if(table===failTable)throw Error('DATABASE_DENIED');
  if(changeTenant){app.tenantId='tenant-B';changeTenant=false;}
  const count=rowsPerTable[table]??1;
  return Array.from({length:Math.max(0,Math.min(limit,count-offset))},
   (_,j)=>({id:table+'-'+(offset+j),tenant_id:'tenant-A'}));
 };
 const api=new Function('app','TABS','document','$','render','heading','panel','role',
  'call','Blob','URL','setTimeout','today','wfAuthGeneration',
  fragment+';return {wfArchivePages,wfExportTenantArchive,WF_ARCHIVE_TABLES};')(
   app,TABS,fakeDocument,()=>({}),()=>{},()=>{},()=>'',()=>roleValue,
   call,BlobMock,URLMock,()=>{},()=> '2026-11-17',0);
 return {api,app,get downloads(){return downloads;},get archiveText(){return archiveText;},
  get requests(){return requests;}};
}

test('Exports every authorized table using full 500-row pagination without truncation',async()=>{
 const h=harness({rowsPerTable:{wm_shifts:1001}});
 const counts=await h.api.wfExportTenantArchive();
 assert.equal(counts.wm_shifts,1001);
 assert.equal(h.downloads,1);
 const archive=JSON.parse(h.archiveText);
 assert.equal(archive.format,'workforce-operational-export-v1');
 assert.equal(archive.tenant_id,'tenant-A');
 assert.equal(archive.tables.wm_shifts.length,1001);
 assert.equal(archive.table_counts.wm_shifts,1001);
 assert.equal(Object.keys(archive.tables).length,h.api.WF_ARCHIVE_TABLES.length);
 const shiftCalls=h.requests.filter(u=>u.includes('/wm_shifts?'));
 assert.equal(shiftCalls.length,3);
 assert.match(shiftCalls[0],/offset=0/);
 assert.match(shiftCalls[1],/offset=500/);
 assert.match(shiftCalls[2],/offset=1000/);
});

test('Export rejects unauthorized employee before any network requests',async()=>{
 const h=harness({roleValue:'employee'});
 await assert.rejects(h.api.wfExportTenantArchive(),/登入身分已變更/);
 assert.equal(h.requests.length,0);
 assert.equal(h.downloads,0);
});

test('Export fails atomically if a dataset is inaccessible instead of saving partial JSON',async()=>{
 const h=harness({failTable:'wm_punches'});
 await assert.rejects(h.api.wfExportTenantArchive(),/DATABASE_DENIED/);
 assert.ok(h.requests.length>0);
 assert.equal(h.downloads,0);
});

test('Switching tenant mid-export cancels the download without exposing other tenant data',async()=>{
 const h=harness({changeTenant:true});
 await assert.rejects(h.api.wfExportTenantArchive(),/企業或登入身分已變更/);
 assert.equal(h.downloads,0);
});

test('Archive includes neither anonymous invitation tokens nor LINE account binding tables',()=>{
 const h=harness();
 const selected=h.api.WF_ARCHIVE_TABLES.map(x=>x[0]);
 for(const excluded of ['wm_invites','wm_org_invites','wm_line_links','wm_line_deliveries'])
  assert.ok(!selected.includes(excluded),excluded);
 assert.ok(selected.includes('wm_punches'));
 assert.ok(selected.includes('wm_requests'));
 assert.match(appSource,/非同一時間點/);
});
