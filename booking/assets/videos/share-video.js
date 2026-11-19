/* Standalone film viewer. URL previews use static HTML metadata;
   the video itself is served as an ordinary MP4 with no app login. */
(()=>{
 "use strict";
 const video=document.getElementById("brand-film");
 if(!video)return;
 const playButton=document.getElementById("big-play");
 const soundButton=document.getElementById("sound-toggle");
 const loading=document.getElementById("loading");
 const error=document.getElementById("video-error");
 const retry=document.getElementById("retry-video");
 const toast=document.getElementById("share-toast");
 const canonical=document.querySelector('link[rel="canonical"]')?.href||location.href.split(/[?#]/)[0];
 let attempt=0;
 const setStatus=()=>{
  soundButton.textContent=video.muted?"開啟聲音":"靜音";
  soundButton.setAttribute("aria-label",video.muted?"開啟影片聲音":"關閉影片聲音");
 };
 const showError=()=>{
  loading.hidden=true;playButton.hidden=true;soundButton.hidden=true;
  error.hidden=false;
 };
 const play=async()=>{
  if(!video||!video.isConnected)return;
  const current=++attempt;
  error.hidden=true;playButton.hidden=true;
  loading.hidden=false;
  try{
   await video.play();
   if(current!==attempt)return;
   loading.hidden=true;
  }catch{
   if(current!==attempt)return;
   loading.hidden=true;
   if(video.error)showError();else playButton.hidden=false;
  }
 };
 video.setAttribute("webkit-playsinline","");
 video.muted=true;
 setStatus();
 video.addEventListener("playing",()=>{
  loading.hidden=true;playButton.hidden=true;error.hidden=true;
 });
 video.addEventListener("canplay",()=>{loading.hidden=true});
 video.addEventListener("waiting",()=>{if(!video.paused)loading.hidden=false});
 video.addEventListener("error",showError);
 video.addEventListener("ended",()=>{
  loading.hidden=true;playButton.hidden=false;
  playButton.textContent="↻ 重新播放";
 });
 playButton.addEventListener("click",()=>{
  if(video.ended)video.currentTime=0;
  void play();
 });
 soundButton.addEventListener("click",()=>{
  video.muted=!video.muted;
  setStatus();
  if(video.paused)void play();
 });
 retry.addEventListener("click",()=>{
  video.load();
  void play();
 });
 void play();
 let toastTimeout=0;
 function notify(message){
  toast.textContent=message;toast.hidden=false;
  clearTimeout(toastTimeout);
  toastTimeout=setTimeout(()=>{toast.hidden=true},2900);
 }
 async function copyLink(){
  try{
   if(!navigator.clipboard?.writeText)throw Error("clipboard unavailable");
   await navigator.clipboard.writeText(canonical);
   notify("已複製影片網址，可貼到 LINE 或社群");
  }catch{
   const target=document.createElement("textarea");
   target.value=canonical;target.setAttribute("readonly","");
   target.style.cssText="position:fixed;left:-9999px;top:0";
   document.body.append(target);
   target.select();
   let copied=false;
   try{copied=document.execCommand("copy")}catch{}
   target.remove();
   if(copied)notify("已複製影片網址，可貼到 LINE 或社群");
   else window.prompt("複製影片連結",canonical);
  }
 }
 document.getElementById("copy-link")?.addEventListener("click",()=>{void copyLink()});
 document.getElementById("share-link")?.addEventListener("click",async()=>{
  if(navigator.share){
   try{
    await navigator.share({title:"排隊怪獸｜45 秒品牌介紹影片",text:"排隊交給怪獸，時間留給自己！",url:canonical});
    return;
   }catch(error){if(error?.name==="AbortError")return}
  }
  await copyLink();
 });
})();
