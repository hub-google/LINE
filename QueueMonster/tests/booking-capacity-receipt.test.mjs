import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "./helpers/source-fs.mjs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {runInNewContext} from "node:vm";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const app=readFileSync(path.join(root,"saas/index.html"),"utf8");
const css=readFileSync(path.join(root,"saas/booking-theme.css"),"utf8");

test("party-size availability compares integer parties against actual remaining capacity",()=>{
 const m=app.match(/function availableForParty\(slot,party=bookingParty\)\{[\s\S]*?\n\}/);
 assert.ok(m,"must retain availability function");
 const check=runInNewContext(m[0]+"\n availableForParty;",{});
 assert.equal(check({available:1},4),false);
 assert.equal(check({available:4},4),true);
 assert.equal(check({available:0},1),false);
 assert.equal(check({available:10},0),false);
 assert.equal(check({available:10},21),false);
 assert.equal(check({available:10},2.5),false);
 assert.equal(check({available:2},2),true);
 assert.equal(check(null,2),false);
});

test("selection and submission both enforce capacity, and count is not reset on render",()=>{
 assert.match(app,/bookingParty=1;\s*queuePartySize=2;\s*bookingContactName=/);
 assert.match(app,/field\("預約人數","customer-party",bookingParty\|\|""/);
 assert.match(app,/!availableForParty\(s\)\?"disabled/);
 assert.match(app,/if\(!availableForParty\(option\)\)/);
 assert.match(app,/if\(!availableForParty\(selected,party\)\)throw Error/);
 assert.match(app,/if\(el\?\.id==="customer-party"\)syncBookingPartyInput\(el\.value\)/);
 assert.match(app,/if\(el\.id==="customer-party"\)\{syncBookingPartyInput\(el\.value\)/);
 assert.match(app,/if\(customer&&chosenSlot&&/);
 assert.match(app,/!menuChoiceReady/);
});

test("customers can view a timestamped current-state proof and print or save it",()=>{
 assert.match(app,/function openBookingReceipt\(bookingId\)/);
 assert.match(app,/customer\?\.my_reservations/);
 assert.match(app,/lineLinkStatus!=="linked"/);
 assert.match(app,/查看／列印預約憑證/);
 assert.match(app,/本憑證為/);
 assert.match(app,/不是即時有效性保證/);
 assert.match(app,/舊截圖及列印內容可能失效/);
 assert.match(app,/if\(a==="receipt-print"\)\{window\.print\(\);return true;\}/);
 assert.match(css,/@media print/);
 assert.match(css,/#booking-receipt-overlay/);
 assert.match(css,/\.receipt-warning/);
});

test("unscoped customer portal no longer silently selects the fake demonstration shop",()=>{
 assert.match(app,/isUnscopedCustomer=/);
 assert.match(app,/new URL\("\.\/directory\.html\?mode=search"/);
 assert.match(app,/lineCallbackKeys=\["liff\.state","code","state","access_token","ticket","manage","recover","site_return"\]/);
});
