/* Public demo -> free merchant signup. Demo data stays local and registration is optional. */
(() => {
 "use strict";
 const params=new URLSearchParams(location.search);
 const scenes={repair:"維修店叫號",breakfast:"早餐店點餐",salon:"美髮店預約",clinic:"診所預約與叫號"};
 const safeScene=value=>Object.hasOwn(scenes,value)?value:"repair";
 const refFromDemo=params.get("from")==="demo";
 const referral=document.getElementById("demo-origin");
 if(referral&&refFromDemo){
  const originScene=params.get("scene");
  const label=document.getElementById("demo-origin-title");
  if(label)label.textContent="已體驗"+(Object.hasOwn(scenes,originScene)?scenes[originScene]:"排隊怪獸")+"，免費建立你的店家";
  referral.hidden=false;
 }
 const panel=document.getElementById("demo-conversion");
 if(!panel)return;
 const title=document.getElementById("demo-conversion-message");
 const mainLink=document.getElementById("demo-register-link");
 const footerLink=document.getElementById("demo-footer-signup");
 const selectedScene=()=>safeScene(document.querySelector(".demo-scene.active")?.dataset.scene||"repair");
 function registerUrl(){
  const url=new URL("./merchant-register.html",location.href);
  url.searchParams.set("mode","signup");
  url.searchParams.set("from","demo");
  url.searchParams.set("scene",selectedScene());
  return url.href;
 }
 function updateLinks(){if(mainLink)mainLink.href=registerUrl();if(footerLink)footerLink.href=registerUrl();}
 function hide(){panel.hidden=true;}
 function show(message){
  if(title)title.textContent=message;
  updateLinks();
  panel.hidden=false;
 }
 const completions={
  "order-submit":{pattern:/已送出示範訂單\s+B\d+/u,message:"已完成示範線上點餐"},
  "reserve-submit":{pattern:/示範預約\s+[SP]\d+\s+已建立/u,message:"已完成示範線上預約"},
  "take-number":{pattern:/已取得示範號碼\s+R\d+/u,message:"已完成示範線上取號"},
  next:{pattern:/^已叫號\s+\S+/u,message:"已體驗店家叫下一號"},
  "order-status":{pattern:/已更新為/u,message:"已體驗店家處理訂單"},
  "staff-status":{pattern:/狀態已變更為/u,message:"已體驗店家更新服務狀態"}
 };
 let lastShown="";
 function check(action){
  const rule=completions[action];
  const message=document.querySelector("#root .notice[role='status']")?.textContent?.trim()||"";
  if(!rule||!rule.pattern.test(message))return;
  const signature=selectedScene()+"|"+message;
  if(signature===lastShown)return;
  lastShown=signature;
  show(rule.message);
 }
 document.addEventListener("click",event=>{
  const target=event.target;
  if(!(target instanceof Element))return;
  if(target.closest("[data-scene]")){hide();queueMicrotask(updateLinks);return;}
  const action=target.closest("[data-act]")?.dataset.act;
  if(action==="dismiss-conversion"||action==="reset"){hide();return;}
  if(completions[action])queueMicrotask(()=>check(action));
 });
 document.addEventListener("change",event=>{
  if(event.target instanceof Element&&event.target.matches("[data-status-kind]")){
   queueMicrotask(()=>check("staff-status"));
  }
 });
 updateLinks();
})();
