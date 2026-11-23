/* Four industry scenarios in one merchant homepage; one shared demo destination. */
(()=>{
 "use strict";
 const root=document.getElementById("industry-switcher");
 if(!root)return;
 const scenarios={
  breakfast:{
   eyebrow:"早餐店・飲料店・外帶餐飲",title:"早餐尖峰很忙，先讓顧客自己點餐。",
   pain:"接電話記單、確認餐點，出餐節奏一直被打斷？",
   answer:"線上接單與指定取餐時間集中管理，店員能專心準備餐點。",
   steps:["顧客自行選餐點、數量與取餐時間","店家在同一後台接單與更新狀態","減少口頭記單、漏單與重複確認"],
   summary:"重點功能：線上點餐＋預約取餐"
  },
  salon:{
   eyebrow:"美髮・美甲・美容工作室",title:"預約不用一直接電話，服務不中斷。",
   pain:"做服務到一半，還得停下來接預約電話？",
   answer:"讓顧客自行選時段及店家提供的服務項目，預約集中在後台。",
   steps:["自行設定營業時段與可預約名額","顧客透過網頁完成預約","店家查看預約、報到及異動"],
   summary:"重點功能：線上預約＋時段管理"
  },
  clinic:{
   eyebrow:"診所・門診・多服務窗口",title:"多診間分流，現場與線上同步叫號。",
   pain:"櫃檯忙著回答目前叫到幾號，各診間進度又不同？",
   answer:"區分診間與場次，後台叫號一次，同步更新店內看板與手機候位畫面。",
   steps:["各診間獨立管理預約、報到與叫號","店員一鍵叫號、過號與重叫","店內看板與顧客手機同步顯示進度"],
   summary:"重點功能：預約報到＋分診間同步叫號"
  },
  repair:{
   eyebrow:"維修門市・服務櫃檯",title:"讓顧客自己看進度，櫃檯少被問幾號。",
   pain:"人多時手動發號、反覆口頭叫號與解釋等候進度？",
   answer:"顧客現場或線上取號，店員叫下一位，店內顯示器和手機同步更新。",
   steps:["店家設定現場取號與等候規則","叫下一位、重叫、過號由後台管理","看板與手機同步顯示最新號碼"],
   summary:"重點功能：現場取號＋同步叫號"
  }
 };
 const tabs=[...root.querySelectorAll('[data-industry]')];
 const parts={
  eyebrow:root.querySelector('[data-industry-text="eyebrow"]'),
  title:root.querySelector('[data-industry-text="title"]'),
  pain:root.querySelector('[data-industry-text="pain"]'),
  answer:root.querySelector('[data-industry-text="answer"]'),
  summary:root.querySelector('[data-industry-text="summary"]'),
  list:[...root.querySelectorAll("[data-industry-step]")]
 };
 function choose(key,focus=false){
  if(!Object.hasOwn(scenarios,key))return;
  const value=scenarios[key];
  for(const tab of tabs){
   const selected=tab.dataset.industry===key;
   tab.setAttribute("aria-selected",String(selected));
   tab.tabIndex=selected?0:-1;
  }
  for(const name of ["eyebrow","title","pain","answer","summary"])parts[name].textContent=value[name];
  parts.list.forEach((el,i)=>{el.textContent=value.steps[i]});
  root.dataset.industryCurrent=key;
  if(focus)tabs.find(tab=>tab.dataset.industry===key)?.focus();
 }
 tabs.forEach((tab,i)=>{
  tab.addEventListener("click",()=>{choose(tab.dataset.industry);window.qmMarketingTrack?.("industry_view",{source:tab.dataset.industry})});
  tab.addEventListener("keydown",event=>{
   if(!["ArrowRight","ArrowDown","ArrowLeft","ArrowUp","Home","End"].includes(event.key))return;
   event.preventDefault();
   const next=event.key==="Home"?0:event.key==="End"?tabs.length-1:
    (i+(event.key==="ArrowRight"||event.key==="ArrowDown"?1:-1)+tabs.length)%tabs.length;
   choose(tabs[next].dataset.industry,true);
   window.qmMarketingTrack?.("industry_view",{source:tabs[next].dataset.industry});
  });
 });
 choose("breakfast");
})();
