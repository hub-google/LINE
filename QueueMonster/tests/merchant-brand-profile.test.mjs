import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const app=readFileSync(path.join(root,"saas/index.html"),"utf8");
const css=readFileSync(path.join(root,"saas/monster-world.css"),"utf8");
const sql=readFileSync(path.join(root,"supabase/migrations/20261109094500_platform_merchant_brand_profile.sql"),"utf8");

test("platform create, platform edit and merchant self-configuration use shared fields",()=>{
 for(const prefix of ["create","config","set"]){
  assert.match(app,new RegExp('merchantProfileFields\\("'+prefix+'"'));
 }
 for(const key of ["-name","-description","-directory-category","-logo-file","-accent-picker",
                    "-phone","-address","-open","-close","-capacity","-minutes"]){
  assert.ok(app.includes('prefix+"'+key+'"')||app.includes("prefix+'"+key+"'"),key+" must use one shared profile ID");
 }
 assert.match(app,/function merchantProfilePatch\(prefix,previous=\{\}\)/);
 assert.match(app,/merchantProfilePatch\("create"/);
 assert.match(app,/merchantProfilePatch\("config"/);
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
 for(const prefix of ["create","config","set"]){
  assert.ok(app.includes('merchantUploadLogo("'+prefix+'"'),"upload is required for "+prefix+" save");
 }
 assert.match(sql,/insert into storage\.buckets/);
 assert.match(sql,/so-merchant-logos/);
 assert.match(sql,/for insert to authenticated/);
 assert.match(sql,/storage\.foldername\(name\)/);
 assert.match(sql,/auth\.uid\(\)/);
 assert.doesNotMatch(app,/service_role|sb_secret_/);
});

test("platform list includes the profile fields needed to edit existing stores",()=>{
 for(const field of ["description","phone","address","accent","logo_url","directory_category",
                     "open_time","close_time","slot_capacity","slot_minutes"]){
  assert.ok(sql.includes("'"+field+"',t."+field),"platform overview missing "+field);
 }
 assert.match(app,/patch\.modules=checked\("config-feature"\)/);
});

test("booking main module still passes JavaScript syntax validation",()=>{
 const start=app.indexOf('<script type="module">'),end=app.indexOf("</script>",start);
 assert.ok(start>=0&&end>start);
 const module=app.slice(start+'<script type="module">'.length,end);
 const checked=spawnSync(process.execPath,["--input-type=module","--check"],{input:module,encoding:"utf8"});
 assert.equal(checked.status,0,checked.stderr);
});
