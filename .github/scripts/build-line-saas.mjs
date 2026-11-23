import {copyFile, mkdir, readFile, writeFile, stat} from "node:fs/promises";
import path from "node:path";
import {buildFrontend} from "./frontend-build.mjs";
import {createHash} from "node:crypto";
import {deflateSync} from "node:zlib";

const sha = (process.env.GITHUB_SHA || "").trim();
if (!/^[0-9a-f]{40}$/i.test(sha)) throw Error("GITHUB_SHA must be the deployment commit SHA");
const src = path.resolve("QueueMonster/saas");
const dest = path.resolve(process.argv[2] || "line-saas-dist");
const pages = ["index.html", "template.html", "home.html", "video.html", "for-merchants.html", "for-customers.html", "demo.html", "board.html", "pickup-board.html", "directory.html", "my-records.html", "merchant-register.html", "platform-login.html", "merchant-center.html", "privacy.html", "terms.html"];
const placeholder = "__LINE_SAAS_BUILD__";
// Test stays on GitHub Pages; a later approved release can swap crawlable origins.
const webOrigin=(process.env.QUEUE_MONSTER_SITE_URL||"https://hub-google.github.io/LINE/booking").replace(/\/$/,"");

await mkdir(dest, {recursive:true});
const frontendPages=await buildFrontend(src,dest,pages);
for (const name of pages) {
  const html = frontendPages.get(name);
  if (!html.includes(placeholder) || !html.includes("version-watch.js")) {
    throw Error(name + " is missing the automatic version update integration");
  }
  // The independent share page needs absolute, publicly crawlable OG links.
  // A release build points to the official domain; test builds point to Pages.
  const addressed=html.replaceAll("https://hub-google.github.io/LINE/booking",webOrigin);
  const versioned=addressed.replaceAll(placeholder,sha)
    .replaceAll('href="./site-auth.css"','href="./site-auth.css?build='+sha+'"')
    .replaceAll('src="./site-auth.js"','src="./site-auth.js?build='+sha+'"');
  await writeFile(path.join(dest,name),versioned,"utf8");
}
await copyFile(path.join(src, "version-watch.js"), path.join(dest, "version-watch.js"));
await copyFile(path.join(src, "booking-theme.css"), path.join(dest, "booking-theme.css"));
await copyFile(path.join(src, "monster-world.css"), path.join(dest, "monster-world.css"));
await copyFile(path.join(src, "monster-mascot.svg"), path.join(dest, "monster-mascot.svg"));
await copyFile(path.join(src, "line-app-icon.svg"), path.join(dest, "line-app-icon.svg"));
await copyFile(path.join(src, "site-auth.css"), path.join(dest, "site-auth.css"));
await copyFile(path.join(src, "site-auth.js"), path.join(dest, "site-auth.js"));
await copyFile(path.join(src, "public-config.js"), path.join(dest, "public-config.js"));
// Generate a disabled campaign when no movie is present; uploads enable automatically.
const introSource=path.join(src,"assets/videos/intro.mp4");
const introDest=path.join(dest,"assets/videos");
await mkdir(introDest,{recursive:true});
const introManifest={enabled:false,videoUrl:"./assets/videos/intro.mp4",version:null};
let introStat=null;
try{introStat=await stat(introSource)}catch(error){if(error.code!=="ENOENT")throw error}
if(introStat){
 if(!introStat.isFile()||introStat.size===0||introStat.size>25*1024*1024)
  throw Error("Brand intro MP4 must be nonempty and no more than 25 MiB");
 const bytes=await readFile(introSource);
 if(bytes.subarray(4,8).toString("ascii")!=="ftyp")throw Error("Brand intro must be an MP4 container");
 const videoHash=createHash("sha256").update(bytes).digest("hex");
 await copyFile(introSource,path.join(introDest,"intro.mp4"));
 // Publish approved, version-controlled video-frame thumbnails. Generating
 // JPEGs on every site build was wasteful and required 100+ apt packages.
 // Uploading a replacement movie should also update these two companion JPGs.
 function jpegSize(data){
  if(data.length<5000||data[0]!==255||data[1]!==216||data[2]!==255)
   throw Error("Brand film preview is not a valid JPEG");
  for(let off=2;off+9<data.length;){
   if(data[off]!==255){off++;continue}
   const marker=data[off+1],len=data.readUInt16BE(off+2);
   if([192,193,194,195,198,199,201,202,203,205,206,207].includes(marker))
    return {width:data.readUInt16BE(off+7),height:data.readUInt16BE(off+5)};
   if(len<2)break;
   off+=len+2;
  }
  throw Error("Brand film preview has no valid JPEG dimensions");
 }
 for(const [name,w,h] of [["intro-og.jpg",1200,630],["intro-poster.jpg",540,960]]){
  const jpg=await readFile(path.join(src,"assets/videos",name));
  const actual=jpegSize(jpg);
  if(actual.width!==w||actual.height!==h)
   throw Error(name+" must be "+w+"x"+h+" for social/player previews");
  await copyFile(path.join(src,"assets/videos",name),path.join(introDest,name));
 }
 const info={file:"intro.mp4",format:"MP4",sizeBytes:bytes.length,
  sha256:videoHash,codecVerified:false,thumbnail:"intro-og.jpg",
  thumbnailWidth:1200,thumbnailHeight:630,poster:"intro-poster.jpg"};
 await writeFile(path.join(introDest,"intro-video-info.json"),JSON.stringify(info,null,2)+"\n","utf8");
 introManifest.enabled=true;
 introManifest.version=videoHash.slice(0,16);
}
await writeFile(path.join(introDest,"intro-video.json"),JSON.stringify(introManifest,null,2)+"\n","utf8");

await mkdir(path.join(dest,"vendor"),{recursive:true});
await copyFile(path.join(src,"vendor/qrcode.min.js"),path.join(dest,"vendor/qrcode.min.js"));
await copyFile(path.join(src,"vendor/QR-CODE-LICENSE"),path.join(dest,"vendor/QR-CODE-LICENSE"));

await copyFile(path.join(src, "manifest.webmanifest"), path.join(dest, "manifest.webmanifest"));
await copyFile(path.join(src, "sitemap.xml"), path.join(dest, "sitemap.xml"));
if(webOrigin!=="https://hub-google.github.io/LINE/booking"){
 const sitemap=await readFile(path.join(dest,"sitemap.xml"),"utf8");
 await writeFile(path.join(dest,"sitemap.xml"),sitemap.replaceAll("https://hub-google.github.io/LINE/booking",webOrigin),"utf8");
}
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
