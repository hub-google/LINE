import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const src=readFileSync(new URL('../app.js',import.meta.url),'utf8');

function createHarness(){
 const registered=new Map(),els=new Map();
 const cls=()=>({add(){},remove(){},toggle(){}});
 function node(id='node'){
  if(els.has(id))return els.get(id);
  const e={id,dataset:{},innerHTML:'',textContent:'',value:'',hidden:false,
   disabled:false,style:{},classList:cls(),
   addEventListener(type,handler){const key=id+':'+type;registered.set(key,[...(registered.get(key)||[]),handler]);},
   appendChild(){},remove(){},focus(){},setAttribute(){},
   querySelector(){return node('query:'+id)},querySelectorAll(){return []},
   insertAdjacentHTML(position,html){this.innerHTML+=html;},
   closest(){return null}};
  els.set(id,e);return e;
 }
 const document={
  getElementById:id=>node(id),
  querySelector:selector=>node(selector==='#nav'?'nav':'query'),
  querySelectorAll:()=>[],
  createElement:tag=>node('created:'+tag),
  addEventListener(type,handler){const key='document:'+type;registered.set(key,[...(registered.get(key)||[]),handler]);},
  head:{appendChild(){}},body:{appendChild(){}}
 };
 const origin='https://hub-google.github.io';
 const loc={origin,href:origin+'/LINE/workforce/',pathname:'/LINE/workforce/',search:'',hash:''};
 const storage={getItem:()=>null,setItem(){},removeItem(){}};
 const fakeFetch=()=>new Promise(()=>{}); // Never access or mutate Supabase in a UI test.
 const context=vm.createContext({document,location:loc,window:{addEventListener(){}},
  sessionStorage:storage,history:{replaceState(){}},fetch:fakeFetch,
  navigator:{},URL,URLSearchParams,Date,Intl,Blob,FormData,
  setTimeout:()=>0,clearTimeout(){},confirm:()=>true,
  crypto:{randomUUID:()=>'00e66a32-1304-4d7c-bd01-5ae8f3305944'}});
 vm.runInContext(src,context,{filename:'workforce-management/app.js',timeout:5000});
 const members=[
  {id:'m1',display_name:'虛構員工甲',employee_code:'EMP001',status:'active',role:'employee',
   branch_id:'b1',tenant_id:'98d3505c-cbe6-46ed-a95a-13672e6d98f4'},
  {id:'m2',display_name:'虛構員工乙',employee_code:'EMP002',status:'active',role:'employee',
   branch_id:'b1',tenant_id:'98d3505c-cbe6-46ed-a95a-13672e6d98f4'}
 ];
 const shifts=[
  {id:'s1',member_id:'m1',branch_id:'b1',status:'published',starts_at:'2026-11-10T01:00:00Z',ends_at:'2026-11-10T09:00:00Z'},
  {id:'s2',member_id:'m2',branch_id:'b1',status:'published',starts_at:'2026-11-11T01:00:00Z',ends_at:'2026-11-11T09:00:00Z'}
 ];
 const data={members,shifts,branches:[{id:'b1',name:'虛構總店',gps_required:false}],
  requests:[],leavePolicies:[{id:'lp1',leave_kind:'annual',label:'特別休假',
   effective_from:'2026-01-01',is_active:true,approval_levels:1,
   yearly_basis:'calendar',balance_required:true}],
  templates:[],departments:[],punches:[],entitlements:[],availability:[],
  requirements:[],notifications:[],closures:[],adjustments:[],corrections:[],
  attendanceCases:[],attendanceRules:null,requestDocs:[],scheduleRules:null,
  leaveBalances:{},memberBranches:[],qrSettings:[],requestStages:[]};
 const app=vm.runInContext('app',context);
 app.data=data;app.busy=false;app.tab='requests';
 vm.runInContext('render()',context);
 async function dispatch(attr,name,scope='pageActions',id=''){
  const button={
   disabled:false,dataset:{[attr==='data-action'?'action':'extra']:name,id},
   closest(selector){
    if(selector.includes('#appContent')||selector.includes('#pageActions'))return node(scope);
    if(selector==='[data-action]'&&attr==='data-action')return button;
    if(selector==='[data-extra]'&&attr==='data-extra')return button;
    if(selector.startsWith('[data-extra="')&&attr==='data-extra'&&selector==='[data-extra="'+name+'"]')return button;
    if(selector==='[data-action],[data-extra]')return button;
    return null;
   }
  };
  for(const cb of registered.get('document:click')||[])await cb({target:button,preventDefault(){}});
  return button;
 }
 return {registered,els,node,context,app,dispatch};
}

test('global header new request actually opens the leave application dialog',async()=>{
 const h=createHarness();
 assert.match(h.node('pageActions').innerHTML,/data-action="newRequest"/);
 await h.dispatch('data-action','newRequest');
 assert.equal(h.node('overlay').hidden,false);
 assert.match(h.node('overlay').innerHTML,/data-form="request"/);
 assert.match(h.node('overlay').innerHTML,/請假/);
 assert.match(h.node('overlay').innerHTML,/送出申請/);
});

test('every other create button opens a form',async()=>{
 const h=createHarness();
 for(const [name,form] of [['newShift','shift'],['newEmployee','employee'],
  ['newBranch','branch'],['newDepartment','department'],
  ['newTemplate','template'],['newAvailability','availability'],
  ['newRequirement','requirement'],['newLeavePolicy','leave_policy'],
  ['newLeaveGrant','leave_grant'],['showScheduleRules','schedule_rules'],
  ['showBranchSupport','assign_branch'],['newSwap','swap_create']]){
  h.node('overlay').innerHTML='';
  await h.dispatch(name==='showScheduleRules'||name==='showBranchSupport'||
   name==='newSwap'||name==='newLeaveGrant'||name==='newLeavePolicy'?'data-extra':'data-action',
   name,'appContent');
  assert.match(h.node('overlay').innerHTML,new RegExp('data-form="'+form+'"'),
   name+' did not open its form');
 }
});

test('header scan button dispatches a backend action rather than remaining inert',async()=>{
 const h=createHarness();
 h.app.tab='anomalies';
 vm.runInContext('render()',h.context);
 vm.runInContext('window.calls=[];action=async(name,payload)=>{window.calls.push([name,payload]);return {checked_shifts:1,created_anomalies:0}}',h.context);
 assert.match(h.node('pageActions').innerHTML,/data-extra="scanAttendance"/);
 await h.dispatch('data-extra','scanAttendance');
 const calls=vm.runInContext('window.calls',h.context);
 assert.equal(calls.length,1);
 assert.equal(calls[0][0],'attendance_scan');
});

test('all emitted action names are handled and all click listeners cover both containers',()=>{
 const actions=[...new Set([...src.matchAll(/data-action=["']([a-zA-Z0-9_]+)["']/g)].map(x=>x[1]))];
 const extras=[...new Set([...src.matchAll(/data-extra=["']([a-zA-Z0-9_]+)["']/g)].map(x=>x[1]))];
 for(const name of actions.filter(n=>n!=='closeModal')){
  assert.ok(src.includes("'"+name+"'")||src.includes('"'+name+'"'),'missing main button action '+name);
 }
 for(const name of extras){
  assert.ok(src.includes("'"+name+"'")||src.includes('"'+name+'"'),'missing extra button action '+name);
 }
 assert.ok(actions.length>=25,'main action coverage unexpectedly shrank');
 assert.ok(extras.length>=20,'extended action coverage unexpectedly shrank');
 assert.equal((src.match(/document\.addEventListener\('click'/g)||[]).length,13);
 assert.doesNotMatch(src,/\$\('appContent'\)\.addEventListener\('click'/);
 assert.match(src,/if\(!e\.target\.closest\('#appContent, #pageActions'\)\)return/);
});
