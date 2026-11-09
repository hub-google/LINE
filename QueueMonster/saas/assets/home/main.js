
(() => {
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
