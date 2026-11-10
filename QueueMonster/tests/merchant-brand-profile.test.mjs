import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "./helpers/source-fs.mjs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const app=readFileSync(path.join(root,"saas/index.html"),"utf8");
const css=readFileSync(path.join(root,"saas/monster-world.css"),"utf8");
const sql=readFileSync(path.join(root,"supabase/migrations/20261109094500_platform_merchant_brand_profile.sql"),"utf8");

test("platform creation and shared merchant settings use the same brand-profile controls",()=>{
 for(const prefix of ["create","set"]){
  assert.match(app,new RegExp('merchantProfileFields\\("'+prefix+'"'));
 }
 for(const key of ["-name","-description","-directory-category","-logo-file","-accent-picker",
                    "-phone","-address","-open","-close","-capacity","-minutes"]){
  assert.ok(app.includes('prefix+"'+key+'"')||app.includes("prefix+'"+key+"'"),key+" must use one shared profile ID");
 }
 assert.match(app,/function merchantProfilePatch\(prefix,previous=\{\}\)/);
 assert.match(app,/merchantProfilePatch\("create"/);
 assert.ok(!app.includes('merchantProfilePatch("config"'),"remove duplicate platform brand form");
 assert.match(app,/merchantProfilePatch\("set"/);
 assert.doesNotMatch(app,/品牌色（#RRGGBB）/);
});

test("brand color is selectable by native color picker, swatches and live preview",()=>{
 assert.match(app,/merchant-color-picker" type="color"/);
 assert.match(app,/data-color-picker/);
 assert.match(app,/data-color-preset/);
 assert.match(app,/merchantSetAccent\(picker\.dataset\.colorPicker,picker\.value\)/);
 assert.match(app,/merchantSetAccent\(b\.dataset\.colorFor,b\.dataset\.colorPreset\)/);
 assert.match(app,/aria-pressed/);
 assert.match(app,/merchantBrandContrast\(color\)/);
 assert.match(css,/\.merchant-color-picker/);
 assert.match(css,/\.merchant-color-swatch\.selected/);
 assert.match(css,/\.merchant-color-preview/);
});

test("logo is selected and previewed before upload, saved only with user action",()=>{
 assert.match(app,/merchant-logo-file" type="file"/);
 assert.match(app,/data-logo-file/);
 assert.match(app,/accept="image\/png,image\/jpeg,image\/webp"/);
 assert.match(app,/URL\.createObjectURL\(file\)/);
 assert.match(app,/URL\.revokeObjectURL/);
 assert.match(app,/merchantClearLogo\(b\.dataset\.logoClear\)/);
 assert.match(app,/file\.size>2097152/);
 assert.match(app,/supa\.storage\.from\(MERCHANT_LOGO_BUCKET\)\.upload\(objectPath,file/);
 assert.match(app,/session\.user\.id\+"\/"\+crypto\.randomUUID\(\)/);
 for(const prefix of ["create","set"]){
  assert.ok(app.includes('merchantUploadLogo("'+prefix+'"'),"upload is required for "+prefix+" save");
 }
 assert.match(sql,/insert into storage\.buckets/);
 assert.match(sql,/so-merchant-logos/);
 assert.match(sql,/for insert to authenticated/);
 assert.match(sql,/storage\.foldername\(name\)/);
 assert.match(sql,/auth\.uid\(\)/);
 assert.doesNotMatch(app,/service_role|sb_secret_/);
});

test("platform list navigates to merchant settings while retaining profile data in its overview",()=>{
 for(const field of ["description","phone","address","accent","logo_url","directory_category",
                     "open_time","close_time","slot_capacity","slot_minutes"]){
  assert.ok(sql.includes("'"+field+"',t."+field),"platform overview missing "+field);
 }
 assert.ok(app.includes('route("staff",t.slug)+"&tab=settings"'));
 assert.ok(!app.includes('if(a==="save-company")'));
 assert.ok(app.includes('if(a==="toggle-company")'));
});

test("booking main module still passes JavaScript syntax validation",()=>{
 const start=app.indexOf('<script type="module">'),end=app.indexOf("</script>",start);
 assert.ok(start>=0&&end>start);
 const module=app.slice(start+'<script type="module">'.length,end);
 const checked=spawnSync(process.execPath,["--input-type=module","--check"],{input:module,encoding:"utf8"});
 assert.equal(checked.status,0,checked.stderr);
});


test("pending merchant logo stays selected across DOM replacement and clears only on save",async()=>{
 const {initializeMerchantBrand,merchantLogoControl,merchantLogoFile,merchantClearLogo,merchantLogoSaved}=await import("../saas/app/merchant-brand.js");
 const {routeState}=await import("../saas/app/state/routeState.js");
 const originalDocument=globalThis.document;
 const originalCreateObjectURL=URL.createObjectURL;
 const originalRevokeObjectURL=URL.revokeObjectURL;
 const originalSlug=routeState.slug,originalGetter=routeState.$;
 const callbacks={};
 const file=Object.assign(new Blob(["image"],{type:"image/png"}),{name:"pikachu.png"});
 const inputs={
  "set-logo-file":{files:[file],value:"pikachu.png"},
  "set-logo-preview":{hidden:true,src:"",removeAttribute(k){delete this[k];}},
  "set-logo-placeholder":{hidden:false},
  "set-logo":{value:""},
  "set-logo-selection":{hidden:true,textContent:""}
 };
 try{
  globalThis.document={
   documentElement:{dataset:{}},
   addEventListener(name,fn){callbacks[name]=fn;},
   querySelectorAll(){return [];}
  };
  URL.createObjectURL=()=> "blob:test-pikachu";
  URL.revokeObjectURL=()=>{};
  routeState.slug="logo-persistence-test";
  routeState.$=id=>inputs[id]||null;
  initializeMerchantBrand();
  callbacks.change({target:{closest(selector){
   return selector==="input[data-logo-file]"?{dataset:{logoFile:"set"}}:null;
  }}});
  assert.equal(merchantLogoFile("set"),file);
  // Re-render replaces the file input with a blank DOM node.
  inputs["set-logo-file"]={files:[],value:""};
  assert.equal(merchantLogoFile("set"),file);
  assert.match(merchantLogoControl("set",""),/blob:test-pikachu/);
  assert.match(merchantLogoControl("set",""),/pikachu.png/);
  assert.equal(document.documentElement.dataset.unsavedMerchantLogo,"true");
  merchantClearLogo("set");
  assert.equal(merchantLogoFile("set"),null);
  assert.doesNotMatch(merchantLogoControl("set","https://example.com/stored.png"),/stored.png/);
  merchantLogoSaved("set");
  assert.equal(document.documentElement.dataset.unsavedMerchantLogo,"false");
 }finally{
  globalThis.document=originalDocument;
  URL.createObjectURL=originalCreateObjectURL;
  URL.revokeObjectURL=originalRevokeObjectURL;
  routeState.slug=originalSlug;
  routeState.$=originalGetter;
 }
});

