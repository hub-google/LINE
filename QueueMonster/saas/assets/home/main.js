
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
 window.addEventListener("beforeinstallprompt",event=>{
  event.preventDefault();promptEvent=event;
  if(button)button.hidden=false;
 });
 window.addEventListener("appinstalled",()=>{promptEvent=null;if(button)button.hidden=true;});
 button?.addEventListener("click",async()=>{
  if(!promptEvent)return;
  const current=promptEvent;promptEvent=null;
  if(button)button.hidden=true;
  await current.prompt();
 });
})();
