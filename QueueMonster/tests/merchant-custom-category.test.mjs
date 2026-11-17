import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const brand=readFileSync(new URL("../saas/app/merchant-brand.js",import.meta.url),"utf8");
const css=readFileSync(new URL("../saas/monster-world.css",import.meta.url),"utf8");

test("Other exposes an optional input in the same shared creation and editing form",()=>{
 assert.match(brand,/data-merchant-category/);
 assert.match(brand,/自訂分類名稱（選填）/);
 assert.match(brand,/maxlength="30"/);
 assert.match(brand,/customCategory\|\|"其他"/);
 assert.match(brand,/custom.hidden=category.value!=="其他"/);
 assert.match(css,/\.merchant-category-custom\[hidden\]\{display:none!important\}/);
});

test("custom values round trip through the shared merchant profile",()=>{
 const src=brand.replace(/^import .*;\r?\n/gm,"").replace(/\bexport /g,"");
 const inputValues=Object.create(null);
 const elements=Object.create(null);
 const handlers={};
 const doc={documentElement:{dataset:{}},addEventListener(name,fn){handlers[name]=fn}};
 const state={MERCHANT_CATEGORIES:["其他","餐飲","美髮"],MERCHANT_PALETTE:[],logoDrafts:new Map()};
 const ctx={
  safeMerchantLogoUrl:x=>x,authState:{},lineState:{},merchantBrandState:state,
  routeState:{$:key=>elements[key]||null,slug:"test-shop"},
  authReady:()=>true,esc:x=>String(x??"").replace(/&/g,"&amp;").replace(/"/g,"&quot;"),
  field:()=>"",showActionFeedback:()=>{},val:id=>inputValues[id]??"",
  URL:{revokeObjectURL(){},createObjectURL(){return "blob:test"}},document:doc
 };
 const argNames=Object.keys(ctx),argVals=Object.values(ctx);
 const api=new Function(...argNames,src+";return {merchantProfileFields,merchantProfilePatch,initializeMerchantBrand};")(...argVals);
 api.initializeMerchantBrand();
 let html=api.merchantProfileFields("set",{directory_category:"自行車維修",onboarding_complete:true});
 assert.match(html,/value="自行車維修"/);
 assert.match(html,/value="其他" selected/);
 assert.doesNotMatch(html,/id="set-category-custom-wrap" hidden/);
 inputValues["set-directory-category"]="其他";
 inputValues["set-directory-category-custom"]="自行車維修";
 for(const key of ["set-name","set-phone","set-address","set-description"])inputValues[key]="測試店家";
 inputValues["set-accent"]="#523B70";
 inputValues["set-open"]="09:00";inputValues["set-close"]="18:00";
 inputValues["set-capacity"]="3";inputValues["set-minutes"]="30";
 assert.equal(api.merchantProfilePatch("set").directory_category,"自行車維修");
 inputValues["set-directory-category-custom"]="  ";
 assert.equal(api.merchantProfilePatch("set").directory_category,"其他");
 inputValues["set-directory-category"]="餐飲";
 inputValues["set-directory-category-custom"]="自行車維修";
 assert.equal(api.merchantProfilePatch("set").directory_category,"餐飲");
 const wrapper={hidden:true};
 elements["set-category-custom-wrap"]=wrapper;
 handlers.change({target:{closest:selector=>selector==="select[data-merchant-category]"?{dataset:{merchantCategory:"set"},value:"其他"}:null}});
 assert.equal(wrapper.hidden,false);
 handlers.change({target:{closest:selector=>selector==="select[data-merchant-category]"?{dataset:{merchantCategory:"set"},value:"餐飲"}:null}});
 assert.equal(wrapper.hidden,true);
});
