import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=(path)=>readFileSync(new URL(path,import.meta.url),'utf8');
const src=read('../app.js');
const menu=JSON.parse(read('../line-oa/rich-menu.published.json'));
const dev=JSON.parse(read('../line-oa/rich-menu.developing.json'));
const docs=read('../line-oa/README.md');

const snippetStart=src.indexOf('const wfMiniMenuTabs=new Set(');
const snippetEnd=src.indexOf('\nconst TABS={',snippetStart);
assert.ok(snippetStart>0&&snippetEnd>snippetStart);

const openTab=(mode,search)=>{
 const opens=[];
 const factory=new Function('wfMiniMode','location','setTab',src.slice(snippetStart,snippetEnd)+';return wfMiniOpenRequestedTab;');
 factory(mode,{search},tab=>opens.push(tab))();
 return opens;
};

test('LINE OA menu uses valid LINE MINI App permanent links and complete hitboxes',()=>{
 assert.equal(menu.size.width,2500);
 assert.equal(menu.size.height,1686);
 assert.equal(menu.areas.length,6);
 assert.equal(menu.selected,true);
 assert.equal(dev.areas.length,6);
 const expected=['punch','schedule','requests','inbox','overview','approvals'];
 for(let i=0;i<6;i++){
  const area=menu.areas[i],devArea=dev.areas[i];
  assert.equal(area.action.type,'uri');
  assert.equal(new URL(area.action.uri).hostname,'miniapp.line.me');
  assert.equal(new URL(area.action.uri).searchParams.get('tab'),expected[i]);
  assert.ok(area.action.uri.includes('/2012649406-KzlLEZT6/'));
  assert.ok(devArea.action.uri.includes('/2012649404-nz3TBQdG/'));
  const {x,y,width,height}=area.bounds;
  assert.ok(x>=0&&y>=0&&width>0&&height>0&&x+width<=2500&&y+height<=1686);
 }
 assert.deepEqual(menu.areas.map(a=>a.bounds.x),[0,833,1666,0,833,1666]);
 assert.deepEqual(menu.areas.map(a=>a.bounds.y),[0,0,0,843,843,843]);
 assert.match(docs,/LINE Official Account Manager/);
});

test('OA LIFF deep link chooses an allowed page only in MINI App, after liff.init',()=>{
 assert.doesNotThrow(()=>new vm.Script(src));
 for(const tab of ['punch','schedule','requests','approvals','inbox','overview']){
  assert.deepEqual(openTab(true,'?line_env=published&tab='+tab),[tab]);
  assert.deepEqual(openTab(false,'?tab='+tab),[]);
 }
 for(const invalid of ['settings','__proto__','../../../admin','']){
  assert.deepEqual(openTab(true,'?tab='+invalid),[]);
 }
 const init=src.indexOf('await liff.init({liffId:selected.liffId,withLoginOnExternalBrowser:false});');
 const apply=src.indexOf('wfMiniOpenRequestedTab();',init);
 assert.ok(init>0&&apply>init);
 assert.ok(apply-init<160);
});
