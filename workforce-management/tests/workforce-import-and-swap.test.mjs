import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const swap=readFileSync(new URL('../swap-sync.js',import.meta.url),'utf8');

test('Employee import CSV quotes branch names, line breaks, and formulas',()=>{
 const start=app.indexOf('function downloadCsv(){');
 const end=app.indexOf('function openCsvImport(){',start);
 const csvStart=app.indexOf('function reportCell(v){');
 const csvEnd=app.indexOf('function reportDownload(){',csvStart);
 assert.ok(start>=0&&end>start&&csvStart>0&&csvEnd>csvStart);
 let data='';
 class MockBlob{constructor(parts){data=parts.join('');}}
 const document={createElement:()=>({click(){},remove(){}}),body:{appendChild(){}}};
 const factory=new Function('app','Blob','URL','document','setTimeout',
  app.slice(csvStart,csvEnd)+app.slice(start,end)+';return downloadCsv;');
 const branchName='甲,乙'+String.fromCharCode(10)+'"測試"=1+1';
 const download=factory({data:{branches:[{name:branchName}]}},MockBlob,
  {createObjectURL:()=>'/blob',revokeObjectURL(){}},document,()=>{});
 download();
 assert.equal(data.charCodeAt(0),0xFEFF);
 const expected='"甲,乙'+String.fromCharCode(10)+'""測試""=1+1"';
 assert.ok(data.includes('"CSV001","測試小華",'+expected+',"員工","正職"'));
 assert.ok(data.includes('"CSV002","測試小林",'+expected+',"員工","兼職"'));
 assert.equal((data.match(/"甲,乙/g)||[]).length,2);
});

test('Employee import CSV neutralizes spreadsheet formula prefixes',()=>{
 const start=app.indexOf('function reportCell(v){');
 const end=app.indexOf('function reportDownload(){',start);
 const quote=new Function(app.slice(start,end)+';return reportCell;')();
 assert.equal(quote('=HYPERLINK("http://example.com")'),'"\'=HYPERLINK(""http://example.com"")"');
 assert.equal(quote('  @SUM(1,2)'),'"\'  @SUM(1,2)"');
});

test('Published schedule cards correctly count overflow beyond fifty items',()=>{
 assert.ok(app.includes('(shifts.length-(compact?3:50))'));
});

test('Failed shift-refresh keeps the old swap form disabled',async()=>{
 const start=swap.indexOf('async function syncSwapForm(){');
 const end=swap.indexOf('// The original app handles',start);
 assert.ok(start>=0&&end>start);
 const source={value:'old-source',disabled:false};
 const target={value:'old-target',disabled:false,closest:()=>({appendChild(){}})};
 const submit={disabled:false};
 const form={isConnected:true,querySelector:s=>
   s.includes('source_shift_id')?source:
   s.includes('target_shift_id')?target:
   s.includes('type="submit"')?submit:null};
 let notice;
 const doc={querySelector:()=>form,
  createElement:()=>{notice={dataset:{},setAttribute(){},textContent:'',className:''};return notice;}};
 const cache=new WeakMap();cache.set(form,{shifts:[{id:'old-source'}]});
 const build=new Function('document','SWAP_UI_SELECTOR','swapFormCache',
  'freshPublishedShifts','fillSwapSelect','rebuildSwapTargets',
  swap.slice(start,end)+';return syncSwapForm;');
 const sync=build(doc,'#overlay form[data-form="swap_create"]',cache,
  async()=>{throw Error('network not reachable');},()=>{},()=>{});
 await sync();
 assert.equal(source.disabled,true);
 assert.equal(target.disabled,true);
 assert.equal(submit.disabled,true);
 assert.equal(cache.has(form),false);
 assert.match(notice.textContent,/network not reachable/);
});

test('Swap submit guard accepts only fresh and authorized distinct published shifts',()=>{
 const start=swap.indexOf('function workforceSwapCanSubmit(');
 const end=swap.indexOf("document.addEventListener('submit'",start);
 assert.ok(start>0&&end>start);
 const canSubmit=new Function(swap.slice(start,end)+';return workforceSwapCanSubmit;')();
 const from={value:'one'},to={value:'two'};
 const form={querySelector:s=>s.includes('source_shift_id')?from:to};
 const cache={checkedAt:10000,isDemo:false,userId:'user-1',
  members:[{id:'employee-one',user_id:'user-1'}],
  shifts:[
   {id:'one',member_id:'employee-one',status:'published'},
   {id:'two',member_id:'employee-two',status:'published'},
   {id:'draft',member_id:'employee-two',status:'draft'}
  ]};
 assert.equal(canSubmit(form,cache,20000),true);
 assert.equal(canSubmit(form,cache,200001),false,'stale form must fail');
 to.value='draft';
 assert.equal(canSubmit(form,cache,20000),false,'draft target must fail');
 to.value='one';
 assert.equal(canSubmit(form,cache,20000),false,'identical shifts must fail');
 to.value='two';
 cache.members[0].user_id='another-user';
 assert.equal(canSubmit(form,cache,20000),false,'employee cannot swap for someone else');
});

test('Swaps must be blocked on Enter submission when synchronization failed',()=>{
 assert.match(swap,/document\.addEventListener\('submit',event=>/);
 assert.match(swap,/event\.stopImmediatePropagation\(\)/);
 assert.match(swap,/workforceSwapCanSubmit\(form,swapFormCache\.get\(form\)\)/);
});
