import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,readdirSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
test('release includes extracted assets, valid scripts, and stamped versions',()=>{
 const dest=mkdtempSync(path.join(tmpdir(),'queue-assets-'));
 const sha='a'.repeat(40);
 try {
  const build=spawnSync(process.execPath,['.github/scripts/build-line-saas.mjs',dest],{cwd:root,env:{...process.env,GITHUB_SHA:sha},encoding:'utf8'});
  assert.equal(build.status,0,build.stderr);
  for(const name of readdirSync(dest).filter(x=>x.endsWith('.html'))){
   const html=readFileSync(path.join(dest,name),'utf8');
   assert.doesNotMatch(html,/__LINE_SAAS_BUILD__/);
   for(const match of html.matchAll(/(?:src|href)="\.\/(assets\/[^"?]+)(?:\?[^"]*)?"/g))assert.ok(statSync(path.join(dest,match[1])).size>0,match[1]);
  }
  const visit=dir=>{for(const entry of readdirSync(dir,{withFileTypes:true})){
   const file=path.join(dir,entry.name);
   if(entry.isDirectory())visit(file);
   else if(file.endsWith('.js')){
    const source=readFileSync(file,'utf8');
    assert.doesNotMatch(source,/__LINE_SAAS_BUILD__/);
    const check=spawnSync(process.execPath,['--input-type=module','--check'],{input:source,encoding:'utf8'});
    assert.equal(check.status,0,file+': '+check.stderr);
   }
  }};
  visit(path.join(dest,'assets'));
  assert.ok(readFileSync(path.join(dest,'index.html'),'utf8').length<6000);
 }finally{rmSync(dest,{recursive:true,force:true})}
});
