import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(path.join(root,p),"utf8");
const app=read("saas/index.html");
const css=read("saas/booking-theme.css");
const build=read("../.github/scripts/build-line-saas.mjs");
const deploy=read("../.github/workflows/line-saas-pages.yml");

test("customer and merchant management use the real shared brand stylesheet",()=>{
 assert.match(app,/<link rel="stylesheet" href="\.\/booking-theme\.css\?build=__LINE_SAAS_BUILD__">/);
 assert.match(app,/document\.body\.dataset\.portal=view/);
 assert.match(app,/function customerRender\(\)/);
 assert.match(app,/function staffRender\(\)/);
 assert.match(css,/--booking-forest:#173e34/);
 assert.match(css,/body\[data-portal="customer"\]/);
 assert.match(css,/@media\(max-width:620px\)/);
 assert.match(css,/\.staff-record/);
 assert.match(css,/\.slots/);
 assert.match(css,/\.side-item\.active/);
 assert.match(css,/prefers-reduced-motion/);
});

test("generated staff and customer links use /booking/ without changing OAuth callback handling",()=>{
 assert.match(app,/const bookingPath=location\.pathname\.replace\(/);
 assert.match(app,/const route=\(v,s=slug,tab=""\)=>bookingPath/);
 assert.match(app,/const canonical=location\.origin\+bookingPath/);
 assert.match(app,/new URL\(location\.origin\+location\.pathname\)/);
 assert.match(app,/LINE BOOKING · 顧客服務/);
 assert.match(app,/LINE BOOKING · 門市管理/);
});

test("Pages builds the stylesheet and deploys only booking and legacy SaaS paths",()=>{
 assert.match(build,/await copyFile\(path\.join\(src, "booking-theme\.css"\)/);
 assert.match(deploy,/for product in booking saas/);
 assert.match(deploy,/for f in index\.html home\.html/);
 assert.match(deploy,/release\.json booking-theme\.css/);
 assert.match(deploy,/git -C "\$pubdir" add -- booking\/ saas\//);
 assert.doesNotMatch(deploy,/git -C "\$pubdir" add\s+--all/);
});
