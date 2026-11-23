
(() => {
 const menu=document.querySelector(".mobile-menu");
 if(menu){
   menu.querySelector(".mobile-menu-close")?.addEventListener("click",()=>{menu.open=false;menu.querySelector("summary")?.focus()});
   menu.querySelectorAll(".menu-panel a").forEach(link=>link.addEventListener("click",()=>{menu.open=false}));
   document.addEventListener("keydown",event=>{if(event.key==="Escape"&&menu.open){menu.open=false;menu.querySelector("summary")?.focus()}});
   document.addEventListener("pointerdown",event=>{if(menu.open&&!menu.contains(event.target))menu.open=false});
 }
 let promptEvent=null;
 const button=document.getElementById("install-booking-app");
 const guide=document.getElementById("qm-pwa-guide");
 const close=document.getElementById("qm-pwa-close");
 const ua=navigator.userAgent||"";
 const ios=/iPad|iPhone|iPod/.test(ua)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
 const safari=/Safari/i.test(ua)&&!/CriOS|FxiOS|EdgiOS|OPiOS|Line\/|FBAN|FBAV|Instagram/i.test(ua);
 const installed=window.matchMedia?.("(display-mode: standalone)").matches||navigator.standalone===true;
 if(button&&ios&&safari&&!installed){
  button.textContent="加入主畫面";
  button.hidden=false;
 }
 window.addEventListener("beforeinstallprompt",event=>{
  event.preventDefault();
  promptEvent=event;
  if(button){button.textContent="安裝排隊怪獸";button.hidden=false}
 });
 window.addEventListener("appinstalled",()=>{
  promptEvent=null;
  if(button)button.hidden=true;
  if(guide)guide.hidden=true;
 });
 button?.addEventListener("click",async()=>{
  if(promptEvent){
   const current=promptEvent;promptEvent=null;
   if(button)button.hidden=true;
   try{await current.prompt()}catch(_){}
   return;
  }
  if(ios&&safari&&guide)guide.hidden=!guide.hidden;
 });
 close?.addEventListener("click",()=>{if(guide)guide.hidden=true});
})();
