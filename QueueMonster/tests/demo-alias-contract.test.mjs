import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

const primary=readFileSync(new URL("../demo/index.html",import.meta.url),"utf8");
const alias=readFileSync(new URL("../demo/live.html",import.meta.url),"utf8");

test("demo/live.html keeps the public alias but reuses the sole demo implementation",()=>{
 assert.match(primary,/so_demo_state/);
 assert.match(primary,/so_demo_take_ticket/);
 assert.match(alias,/location\.replace\("\.\/index\.html"\+location\.search\+location\.hash\)/);
 assert.match(alias,/<a href="\.\/index\.html">/);
 assert.doesNotMatch(alias,/so_demo_state|so_demo_take_ticket|so_demo_book|so_demo_staff_action/);
 assert.ok(alias.length<1000);
});
