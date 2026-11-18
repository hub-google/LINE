/* Self-contained marketing-only intro. Nothing is sent to a database or third party. */
(()=>{
 "use strict";
 if(document.body?.dataset.monsterPage!=="home")return;
 const replayButton=document.getElementById("watch-intro-video");
 if(!replayButton)return;
 const preview=new URLSearchParams(location.search).get("intro_preview")==="1";
 const manifestUrl=new URL("./assets/videos/intro-video.json",location.href);
 let manifest=null,overlay=null,video=null,priorFocus=null;
 function dismiss(){
  if(!overlay||overlay.hidden)return;
  if(video){video.pause();video.removeAttribute("src");video.load();video=null}
  overlay.hidden=true;document.documentElement.classList.remove("qm-intro-locked");
  if(priorFocus?.isConnected)priorFocus.focus({preventScroll:true});
  priorFocus=null;
 }
 function buildDialog(){
  if(overlay)return overlay;
  overlay=document.createElement("div");
  overlay.id="qm-intro-overlay";
  overlay.className="qm-intro-overlay";
  overlay.hidden=true;
  overlay.innerHTML='<section class="qm-intro-panel" role="dialog" aria-modal="true" aria-label="排隊怪獸品牌介紹影片">'+
   '<header class="qm-intro-top"><strong><img src="./monster-mascot.svg" alt="" width="34" height="32">排隊怪獸｜品牌介紹</strong>'+
   '<button class="qm-intro-skip" type="button">跳過影片 <span aria-hidden="true">×</span></button></header>'+
   '<div class="qm-intro-stage"><video class="qm-intro-movie" controls playsinline muted preload="metadata" aria-label="45 秒品牌介紹影片" hidden></video>'+
   '<div class="qm-intro-empty" hidden><img src="./monster-mascot.svg" alt="" width="100" height="95"><strong>排隊怪獸介紹影片</strong><p>影片尚未上傳，這是開屏廣告的預覽畫面。</p></div></div>'+
   '<div class="qm-intro-footer"><h2>排隊交給怪獸，時間留給自己！</h2>'+
   '<p>排隊叫號、線上預約・線上點餐，怪獸幫你搞定。</p>'+
   '<div class="qm-intro-actions"><a href="./demo.html" class="qm-intro-action">立即免費體驗</a>'+
   '<button class="qm-intro-restart" type="button" hidden>重新播放</button></div></div></section>';
  document.body.append(overlay);
  overlay.querySelector(".qm-intro-skip").addEventListener("click",dismiss);
  overlay.querySelector(".qm-intro-restart").addEventListener("click",()=>{
   if(video){video.currentTime=0;video.play().catch(()=>{})}
  });
  overlay.addEventListener("pointerdown",event=>{if(event.target===overlay)dismiss()});
  overlay.addEventListener("keydown",event=>{
   if(event.key==="Escape"){event.preventDefault();dismiss();return}
   if(event.key!=="Tab")return;
   const focusables=[...overlay.querySelectorAll("button:not([hidden]),a[href],video:not([hidden])")];
   if(!focusables.length)return;
   const first=focusables[0],last=focusables[focusables.length-1];
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  });
  return overlay;
 }
 function open(manual){
  const panel=buildDialog();
  if(!panel.hidden)return;
  priorFocus=document.activeElement;
  const player=panel.querySelector(".qm-intro-movie");
  const placeholder=panel.querySelector(".qm-intro-empty");
  const restart=panel.querySelector(".qm-intro-restart");
  player.hidden=true;placeholder.hidden=true;restart.hidden=true;
  if(manifest){
   video=player;player.hidden=false;
   player.muted=true;player.playsInline=true;
   player.src=new URL(manifest.videoUrl,location.href).href;
   player.onended=()=>{restart.hidden=false};
   player.onerror=()=>{
    player.hidden=true;placeholder.hidden=false;
    placeholder.querySelector("p").textContent="影片暫時無法播放，請稍後再試。";
   };
  }else{
   placeholder.hidden=false;
  }
  panel.hidden=false;
  document.documentElement.classList.add("qm-intro-locked");
  panel.querySelector(".qm-intro-skip").focus({preventScroll:true});
  if(video)video.play().catch(()=>{/* User can play using native controls. */});
 }
 async function init(){
  try{
   const response=await fetch(manifestUrl,{cache:"no-store"});
   if(response.ok){
    const value=await response.json();
    if(value?.enabled===true&&value.videoUrl==="./assets/videos/intro.mp4"&&
       /^[0-9a-f]{16}$/.test(value.version)){
     manifest=value;
    }
   }
  }catch{/* Fail closed, preserving all homepage actions. */}
  if(manifest){
   replayButton.hidden=false;
   replayButton.addEventListener("click",()=>open(true));
  }
  if(preview){open(true);return}
  // Open on EVERY homepage entry (including cache-busting query parameters and signed-in visitors).
  // Dismissal is exclusively a visitor action; no time/frequency or login gate.
  if(manifest)open(false);
 }
 void init();
})();
