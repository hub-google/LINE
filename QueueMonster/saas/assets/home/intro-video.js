/* Queue Monster opening film. Progressive HTML5 video playback with a
   visible user-gesture fallback for browsers that block autoplay. */
(()=>{
 "use strict";
 if(document.body?.dataset.monsterPage!=="home")return;
 const replayButton=document.getElementById("watch-intro-video");
 if(!replayButton)return;

 const preview=new URLSearchParams(location.search).get("intro_preview")==="1";
 const manifestUrl=new URL("./assets/videos/intro-video.json",location.href);
 const skipKey="qm-home-intro-skipped-v1";
 let manifest=null,overlay=null,video=null,priorFocus=null;
 function hasSkipped(){
  try{return localStorage.getItem(skipKey)==="1"}catch{return false}
 }
 function rememberSkip(){
  try{localStorage.setItem(skipKey,"1")}catch{}
 }
 function stopVideo(){
  if(!video)return;
  video.pause();video.removeAttribute("src");video.load();video=null;
 }
 function dismiss(){
  if(!overlay||overlay.hidden)return;
  // A deliberate dismissal suppresses future auto-opening, never manual replay.
  if(manifest)rememberSkip();
  stopVideo();
  overlay.hidden=true;
  document.documentElement.classList.remove("qm-intro-locked");
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
   '<button class="qm-intro-skip" type="button" aria-label="跳過影片並關閉廣告">跳過影片 <span aria-hidden="true">×</span></button></header>'+
   '<div class="qm-intro-stage">'+
    '<video class="qm-intro-movie" controls autoplay playsinline muted preload="metadata" aria-label="45 秒品牌介紹影片" hidden></video>'+
    '<div class="qm-intro-loading" role="status" aria-live="polite" hidden>影片載入中…</div>'+
    '<button class="qm-intro-play" type="button" hidden aria-label="播放影片">▶ 點此播放影片</button>'+
    '<button class="qm-intro-sound" type="button" hidden aria-label="開啟影片聲音">開啟聲音</button>'+
    '<div class="qm-intro-empty" hidden><img src="./monster-mascot.svg" alt="" width="100" height="95"><strong>影片暫時無法播放</strong><p>請檢查網路連線，或改用原始影片開啟。</p><div class="qm-intro-recovery"><button type="button" class="qm-intro-retry">重試播放</button><a class="qm-intro-direct" href="#" target="_blank" rel="noopener">直接開啟影片</a></div></div>'+
   '</div>'+
   '<div class="qm-intro-footer"><h2>少一點繁瑣工作，多一點做生意的時間。</h2>'+
   '<p>現場與線上同步叫號，預約、點餐集中管理。</p>'+
   '<div class="qm-intro-actions"><a href="./demo.html?role=merchant" class="qm-intro-action" data-qm-event="demo_click" data-qm-source="home">免費體驗店家端</a>'+
   '<button class="qm-intro-restart" type="button" hidden>重新播放</button></div></div></section>';
  document.body.append(overlay);
  const player=overlay.querySelector(".qm-intro-movie");
  const stage=overlay.querySelector(".qm-intro-stage");
  const loading=overlay.querySelector(".qm-intro-loading");
  const playButton=overlay.querySelector(".qm-intro-play");
  const soundButton=overlay.querySelector(".qm-intro-sound");
  const empty=overlay.querySelector(".qm-intro-empty");
  const restart=overlay.querySelector(".qm-intro-restart");
  let playAttempt=0;
  function showError(){
   if(!video||video!==player)return;
   loading.hidden=true;playButton.hidden=true;soundButton.hidden=true;
   player.hidden=true;empty.hidden=false;
  }
  function tryPlay(){
   if(!video||overlay.hidden)return;
   const attempt=++playAttempt;
   loading.hidden=false;
   playButton.hidden=true;
   // Autoplay is a best-effort request; mobile Safari and user settings
   // may require a direct click. The fallback must remain visible.
   video.play().then(()=>{
    if(attempt!==playAttempt||overlay.hidden)return;
    loading.hidden=true;playButton.hidden=true;
   }).catch(()=>{
    if(attempt!==playAttempt||overlay.hidden)return;
    loading.hidden=true;
    if(!player.error)playButton.hidden=false;
    else showError();
   });
  }
  playButton.addEventListener("click",()=>tryPlay());
  soundButton.addEventListener("click",()=>{
   if(!video)return;
   video.muted=!video.muted;
   soundButton.textContent=video.muted?"開啟聲音":"靜音";
   soundButton.setAttribute("aria-label",video.muted?"開啟影片聲音":"關閉影片聲音");
   if(video.paused)tryPlay();
  });
  stage.querySelector(".qm-intro-retry").addEventListener("click",()=>{
   if(!video)return;
   empty.hidden=true;player.hidden=false;
   player.load();
   tryPlay();
  });
  overlay.querySelector(".qm-intro-skip").addEventListener("click",dismiss);
  restart.addEventListener("click",()=>{
   if(!video)return;
   restart.hidden=true;video.currentTime=0;tryPlay();
  });
  player.addEventListener("loadedmetadata",()=>{
   if(!video||video!==player)return;
   const portrait=player.videoWidth>0&&player.videoHeight>player.videoWidth;
   overlay.querySelector(".qm-intro-panel").classList.toggle("qm-intro-portrait",portrait);
   // Same full-frame contain behavior for both 9:16 and 16:9 videos.
  });
  player.addEventListener("playing",()=>{
   loading.hidden=true;playButton.hidden=true;soundButton.hidden=false;empty.hidden=true;
  });
  player.addEventListener("waiting",()=>{
   if(!player.paused)loading.hidden=false;
  });
  player.addEventListener("canplay",()=>{loading.hidden=true});
  player.addEventListener("error",showError);
  player.addEventListener("ended",()=>{
   loading.hidden=true;playButton.hidden=true;restart.hidden=false;
  });
  overlay.addEventListener("pointerdown",event=>{if(event.target===overlay)dismiss()});
  overlay.addEventListener("keydown",event=>{
   if(event.key==="Escape"){event.preventDefault();dismiss();return}
   if(event.key!=="Tab")return;
   const focusables=[...overlay.querySelectorAll("button:not([hidden]),a[href]:not([hidden]),video:not([hidden])")].filter(el=>el.getClientRects().length);
   if(!focusables.length)return;
   const first=focusables[0],last=focusables[focusables.length-1];
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  });
  overlay._openPlayer=()=>{
   playAttempt++;
   stopVideo();
   video=player;
   player.hidden=false;empty.hidden=true;restart.hidden=true;
   playButton.hidden=true;soundButton.hidden=true;
   loading.hidden=false;
   player.muted=true;player.playsInline=true;
   player.setAttribute("webkit-playsinline","");
   player.controls=true;
   soundButton.textContent="開啟聲音";
   const url=new URL(manifest.videoUrl,location.href).href;
   empty.querySelector(".qm-intro-direct").href=url;
   player.src=url;player.load();
   // Start only after the dialog has become visible.
   tryPlay();
  };
  overlay._emptyPreview=()=>{
   player.hidden=true;loading.hidden=true;playButton.hidden=true;
   soundButton.hidden=true;empty.hidden=false;
   empty.querySelector("strong").textContent="排隊怪獸品牌影片";
   empty.querySelector("p").textContent="影片尚未提供，這是廣告版型的預覽。";
   empty.querySelector(".qm-intro-recovery").hidden=true;
  };
  return overlay;
 }
 function open(manual){
  const panel=buildDialog();
  if(!panel.hidden)return;
  priorFocus=document.activeElement;
  panel.querySelector(".qm-intro-panel").classList.toggle("qm-intro-portrait",Boolean(manifest));
  panel.hidden=false;
  document.documentElement.classList.add("qm-intro-locked");
  if(manifest)panel._openPlayer();else panel._emptyPreview();
  panel.querySelector(".qm-intro-skip").focus({preventScroll:true});
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
  }catch{/* Preserve the homepage if video metadata cannot be retrieved. */}
  if(manifest){
   replayButton.hidden=false;
   replayButton.addEventListener("click",()=>open(true));
  }
  if(preview){open(true);return}
  // New visitors see the film; once skipped, the replay CTA remains optional.
  if(manifest&&!hasSkipped())open(false);
 }
 void init();
})();
