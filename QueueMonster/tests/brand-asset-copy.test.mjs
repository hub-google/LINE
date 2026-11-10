import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const read=(name)=>readFileSync(fileURLToPath(new URL('../saas/'+name,import.meta.url)),'utf8');
const sha256=(bytes)=>createHash('sha256').update(bytes).digest('hex');

test('the single approved mascot is the user-supplied character, not a reillustration',()=>{
 const svg=read('monster-mascot.svg');
 const match=svg.match(/<image[^>]*href="data:image\/avif;base64,([^"]+)"[^>]*\/>/);
 assert.ok(match,'Shared mascot must embed the approved illustration rather than reference an unavailable resource');
 const bytes=Buffer.from(match[1],'base64');
 assert.equal(bytes.length,7644,'Approved mascot image size changed');
 assert.equal(sha256(bytes),'3ac3782ca93e1d6115c4c2040015d133890ea2562799a2e699adc80195e4f61c');
 assert.match(svg,/viewBox="0 0 480 443"/);
 assert.match(svg,/001、002、003/);
 assert.doesNotMatch(svg,/<path\s+d=|<text\s+x=/,'Do not redraw character with unrelated vector paths');
});

test('every public page and installable app uses the shared approved mascot icon',()=>{
 const pages=['index','home','directory','merchant-register','merchant-center','board','privacy','terms','offline','template'];
 for(const page of pages)assert.match(read(page+'.html'),/<link rel="icon" type="image\/svg\+xml" href="\.\/monster-mascot\.svg">/,page);
 const manifest=JSON.parse(read('manifest.webmanifest'));
 assert.ok(manifest.icons.some(icon=>icon.src==='./monster-mascot.svg'&&icon.type==='image/svg+xml'));
 assert.doesNotMatch(manifest.name+' '+manifest.description,/Queue Monster|SaaS/);
 const css=read('monster-world.css');
 assert.match(css,/monster-mascot\.svg/);
});

test('decorative English is removed from customer-facing headers and sections',()=>{
 for(const page of ['home','directory','merchant-register','merchant-center']){
  const markup=read(page+'.html');
  assert.doesNotMatch(markup,/FIND YOUR STORE|PIXEL STREET|ORIGINAL|WHY THIS PLATFORM|TWO FLOWS|GET STARTED|BUILT FOR EVERYDAY BUSINESS|IN-STORE QUEUE DISPLAY|READY WHEN YOU ARE|HELP CENTER|FOR MERCHANTS|>FAQ</);
 }
 const directory=read('directory.html');
 assert.match(directory,/<h1 class="eyebrow">搜尋店家，立即使用服務<\/h1>/);
 assert.equal((directory.match(/搜尋店家，立即使用服務/g)||[]).length,1);
});
