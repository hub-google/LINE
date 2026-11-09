import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {parse} from '../../.github/frontend/node_modules/@babel/parser/lib/index.js';
import traverseModule from '../../.github/frontend/node_modules/@babel/traverse/lib/index.js';
const root=fileURLToPath(new URL('../saas/app/',import.meta.url));
const browserGlobals=new Set(['URL','URLSearchParams','location','history','document','window','navigator','sessionStorage','crypto','console','fetch','Event','TextEncoder','Blob','HTMLDetailsElement','setTimeout','clearTimeout','setInterval','confirm']);
test('native feature modules have explicit dependencies and no leaked application globals',()=>{
 const files=readdirSync(root,{recursive:true}).filter(x=>x.endsWith('.js'));
 assert.ok(files.some(x=>x.replaceAll(path.sep,'/')==='actions/booking-submit.js'));
 for(const name of files){
  const source=readFileSync(path.join(root,name),'utf8');
  assert.ok(source.split('\n').length<600,name+' should be split by responsibility');
  const ast=parse(source,{sourceType:'module'});
  traverseModule.default(ast,{ReferencedIdentifier(p){
   if(!p.scope.hasBinding(p.node.name))assert.ok(browserGlobals.has(p.node.name),name+': missing explicit dependency '+p.node.name);
  },ImportDeclaration(p){
   const dependency=p.node.source.value;
   assert.ok(dependency.startsWith('.')||dependency.startsWith('https://'),name+': unknown import');
   if(dependency.startsWith('.'))assert.doesNotThrow(()=>readFileSync(path.resolve(path.dirname(path.join(root,name)),dependency)),dependency);
  }});
 }
});
