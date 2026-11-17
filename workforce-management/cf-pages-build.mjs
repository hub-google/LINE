// Static Cloudflare Pages build for Work. Runs only from GitHub release branch.
// No Workers, credentials, or other products' folders are involved.
import {copyFile, mkdir, rm, readFile, writeFile} from "node:fs/promises";
import path from "node:path";

const root=process.cwd();
if(path.basename(root)!=="workforce-management")throw Error("Run from workforce-management/");
const out=path.join(root,"dist");
await rm(out,{recursive:true,force:true});
await mkdir(path.join(out,"vendor"),{recursive:true});
await mkdir(path.join(out,"mini","vendor"),{recursive:true});
const common=["app.js","swap-sync.js","style.css"];
for(const file of ["index.html",...common])await copyFile(path.join(root,file),path.join(out,file));
for(const file of common)await copyFile(path.join(root,file),path.join(out,"mini",file));
await copyFile(path.join(root,"mini","index.html"),path.join(out,"mini","index.html"));
await copyFile(path.join(root,"mini","mini.css"),path.join(out,"mini","mini.css"));
for(const sub of ["","mini/"]){
  for(const file of ["qrcode.min.js","QR-CODE-LICENSE"]){
    await copyFile(path.join(root,"vendor",file),path.join(out,sub,"vendor",file));
  }
}
const page=await readFile(path.join(out,"index.html"),"utf8");
if(!page.includes("./app.js")||!page.includes("./style.css"))throw Error("Work assets missing");
const miniPage=await readFile(path.join(out,"mini","index.html"),"utf8");
if(!miniPage.includes("./mini.css"))throw Error("Work MINI assets missing");
await writeFile(path.join(out,"_headers"),"/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n","utf8");
console.log("Built static Work site and /mini/ without Cloudflare Worker");
