import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';

const folder=new URL('../e2e-artifacts/',import.meta.url);
await mkdir(folder,{recursive:true});
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:390,height:844}});
try{
 await page.goto('https://hub-google.github.io/LINE/workforce/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#connectionLabel')?.textContent?.includes('資料已同步'),null,{timeout:30000});
 await page.locator('#menuToggle').click();
 await page.locator('#nav [data-tab="requests"]').click();
 await page.locator('#pageActions [data-action="newOvertimeRequest"]').click();
 await page.locator('#overlay form[data-form="request"]').waitFor({state:'visible'});
 await page.waitForTimeout(300);
 const ui=await page.evaluate(()=>{
  const sidebar=document.querySelector('.sidebar');
  const modal=document.querySelector('#overlay .modal');
  const overlay=document.querySelector('#overlay');
  const bounds=modal.getBoundingClientRect();
  const toast=document.querySelector('#toast');
  toast.innerHTML='<div class="toast">狀態 1</div><div class="toast">狀態 2</div><div class="toast">狀態 3</div>';
  const visible=[...toast.children].filter(x=>getComputedStyle(x).display!=='none').length;
  toast.innerHTML='';
  return {drawer:Number(getComputedStyle(sidebar).zIndex),overlay:Number(getComputedStyle(overlay).zIndex),
   visible,bounds:{left:bounds.left,right:bounds.right},width:innerWidth};
 });
 assert.ok(ui.overlay>ui.drawer,'Mobile dialog obscured by left sidebar');
 assert.ok(ui.bounds.left>=-1&&ui.bounds.right<=ui.width+1,'Mobile dialog clipped');
 assert.equal(ui.visible,1,'Multiple stacked status notices');
 await page.screenshot({path:new URL('08-mobile-layer-fix.png',folder).pathname,fullPage:false});
 console.log('PASS mobile modal, viewport fit, status messages',JSON.stringify(ui));
}finally{await browser.close();}
