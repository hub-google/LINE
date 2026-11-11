import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("QueueMonster is reservation/queue management; payments are explicitly out of scope",()=>{
 const root=read("README.md"),prd=read("PRD.md"),status=read("IMPLEMENTATION-STATUS.md");
 const benchmark=read("saas/PRD-20261104-DoYouBook-benchmark-and-solutions.md");
 assert.match(root,/排隊怪獸不開發信用卡、LINE Pay、訂金/);
 assert.match(root,/不是正式站已上線的功能，也不在這次開發範圍/);
 assert.doesNotMatch(root,/呼叫 LINE Pay Online API|正式付款上線|立即無縫對接 LINE 官方真實 API/);
 assert.match(prd,/2026-11-11 使用者最新範圍決策（最高優先/);
 assert.match(prd,/不開發、不宣稱支援/);
 assert.match(prd,/NR-23、FR-302／FR-307/);
 assert.match(status,/NR-23 \| \*\*排除需求\*\*/);
 assert.match(status,/不得創建金流功能/);
 assert.match(benchmark,/競品付款、訂金、退款、對帳/);
});
