import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const source=readFileSync(path.join(root,"saas/shared-customer-links.js"),"utf8");
const helpers=new Function(source.replace(/\bexport\s+/g,"")+";return {customerEntryUrl,safeMerchantLogoUrl};")();
const {customerEntryUrl,safeMerchantLogoUrl}=helpers;
test("merchant LIFF entry and cross-store fallback retain original URL behavior",()=>{
 assert.equal(customerEntryUrl("own",{currentSlug:"own",origin:"https://example.org",bookingPath:"/LINE/booking/",liffId:"L123"}),
   "https://liff.line.me/L123/?view=customer&merchant=own");
 assert.equal(customerEntryUrl("other",{currentSlug:"own",origin:"https://example.org",bookingPath:"/LINE/booking/",liffId:"L123"}),
   "https://example.org/LINE/booking/?view=customer&merchant=other");
 assert.equal(customerEntryUrl("own",{currentSlug:"own",origin:"https://example.org",bookingPath:"/LINE/booking/"}),
   "https://example.org/LINE/booking/?view=customer&merchant=own");
});
test("directory platform and own-OA entrypoints keep their own routing semantics",()=>{
 assert.equal(customerEntryUrl("abc",{surface:"directory",tab:"reserve",oaMode:"PLATFORM",liffId:"L123"}),
   "./?view=customer&merchant=abc&tab=reserve");
 assert.equal(customerEntryUrl("abc",{surface:"directory",tab:"queue",oaMode:"MERCHANT",liffId:"L123"}),
   "https://liff.line.me/L123/?view=customer&merchant=abc&tab=queue");
 assert.equal(customerEntryUrl("abc",{surface:"directory",tab:"queue",oaMode:"MERCHANT"}),
   "./?view=customer&merchant=abc&tab=queue");
});
test("all logo entrypoints share policy while preserving search's former URL normalization",()=>{
 const plain="https://example.com/logo.png";
 assert.equal(safeMerchantLogoUrl(plain),plain);
 assert.equal(safeMerchantLogoUrl(plain,{directory:true}),plain);
 assert.equal(safeMerchantLogoUrl("javascript:alert(1)"),"");
 assert.equal(safeMerchantLogoUrl("http://example.com/logo.png",{directory:true}),"");
 assert.equal(safeMerchantLogoUrl("https://example.com/"+ "x".repeat(500)),"");
 assert.ok(safeMerchantLogoUrl("https://example.com/"+"x".repeat(500),{directory:true}).length>500);
});
