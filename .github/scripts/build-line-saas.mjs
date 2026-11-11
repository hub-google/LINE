import {copyFile, mkdir, readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import {buildFrontend} from "./frontend-build.mjs";
import {deflateSync} from "node:zlib";

const sha = (process.env.GITHUB_SHA || "").trim();
if (!/^[0-9a-f]{40}$/i.test(sha)) throw Error("GITHUB_SHA must be the deployment commit SHA");
const src = path.resolve("QueueMonster/saas");
const dest = path.resolve(process.argv[2] || "line-saas-dist");
const pages = ["index.html", "template.html", "home.html", "board.html", "directory.html", "merchant-register.html", "platform-login.html", "merchant-center.html", "privacy.html", "terms.html"];
const placeholder = "__LINE_SAAS_BUILD__";

await mkdir(dest, {recursive:true});
const frontendPages=await buildFrontend(src,dest,pages);
for (const name of pages) {
  const html = frontendPages.get(name);
  if (!html.includes(placeholder) || !html.includes("version-watch.js")) {
    throw Error(name + " is missing the automatic version update integration");
  }
  await writeFile(path.join(dest, name), html.replaceAll(placeholder, sha), "utf8");
}
await copyFile(path.join(src, "version-watch.js"), path.join(dest, "version-watch.js"));
await copyFile(path.join(src, "booking-theme.css"), path.join(dest, "booking-theme.css"));
await copyFile(path.join(src, "monster-world.css"), path.join(dest, "monster-world.css"));
await copyFile(path.join(src, "monster-mascot.svg"), path.join(dest, "monster-mascot.svg"));
await copyFile(path.join(src, "line-app-icon.svg"), path.join(dest, "line-app-icon.svg"));
await copyFile(path.join(src, "explore-game.css"), path.join(dest, "explore-game.css"));
await copyFile(path.join(src, "explore-game.js"), path.join(dest, "explore-game.js"));
await copyFile(path.join(src, "site-auth.css"), path.join(dest, "site-auth.css"));
await copyFile(path.join(src, "site-auth.js"), path.join(dest, "site-auth.js"));
await copyFile(path.join(src, "public-config.js"), path.join(dest, "public-config.js"));

await copyFile(path.join(src, "manifest.webmanifest"), path.join(dest, "manifest.webmanifest"));
await copyFile(path.join(src, "offline.html"), path.join(dest, "offline.html"));
const worker = await readFile(path.join(src, "pwa-sw.js"), "utf8");
if (!worker.includes(placeholder)) throw Error("PWA service worker missing version placeholder");
await writeFile(path.join(dest, "pwa-sw.js"), worker.replaceAll(placeholder,sha), "utf8");

// Deterministic pure-Node PNGs; no binary generated files committed and no external font packages.
function crc32(bytes) {
  let crc=0xffffffff;
  for (const b of bytes) {
    crc^=b;
    for (let i=0;i<8;i++) crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}
function pngChunk(type, data) {
  const size=Buffer.alloc(4),name=Buffer.from(type),check=Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  check.writeUInt32BE(crc32(Buffer.concat([name,data])));
  return Buffer.concat([size,name,data,check]);
}
function pwaIcon(size) {
  const stride=size*4+1, pixels=Buffer.alloc(stride*size);
  function roundRect(nx,ny,x1,y1,x2,y2,r) {
    if(nx<x1||nx>x2||ny<y1||ny>y2)return false;
    const cx=Math.max(x1+r,Math.min(x2-r,nx));
    const cy=Math.max(y1+r,Math.min(y2-r,ny));
    return (nx-cx)**2+(ny-cy)**2<=r*r;
  }
  for(let y=0;y<size;y++) for(let x=0;x<size;x++){
    const nx=(x+.5)/size,ny=(y+.5)/size;
    const p=y*stride+1+x*4;
    if(!roundRect(nx,ny,0,0,1,1,.19))continue;
    let c=[70,43,82,255]; // monster-purple background
    const paper=roundRect(nx,ny,.18,.19,.82,.84,.065);
    if(paper)c=[246,221,251,255];
    if(paper&&ny>=.31&&ny<=.43)c=[237,198,245,255];
    if(roundRect(nx,ny,.30,.14,.40,.32,.025)||
       roundRect(nx,ny,.60,.14,.70,.32,.025))c=[254,198,90,255];
    // Three rows of calendar appointments.
    for(const yy of [.54,.65,.76]){
      for(const xx of [.32,.46,.60,.74]){
        if(Math.abs(nx-xx)<.035&&Math.abs(ny-yy)<.032&&paper)
          c=xx===.60&&yy===.65?[252,165,199,255]:[107,57,137,255];
      }
    }
    pixels[p]=c[0];pixels[p+1]=c[1];pixels[p+2]=c[2];pixels[p+3]=c[3];
  }
  const header=Buffer.alloc(13);
  header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);
  header[8]=8;header[9]=6; // 8-bit RGBA PNG
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    pngChunk("IHDR",header),
    pngChunk("IDAT",deflateSync(pixels,{level:9})),
    pngChunk("IEND",Buffer.alloc(0))
  ]);
}
for(const size of [192,512]){
 await writeFile(path.join(dest,"pwa-icon-"+size+".png"),pwaIcon(size));
}
await writeFile(path.join(dest, "release.json"), JSON.stringify({
  build:sha, deployedAt:new Date().toISOString(), project:"line-booking"
}, null, 2)+"\n", "utf8");
console.log("Built LINE booking release " + sha.slice(0, 12));
