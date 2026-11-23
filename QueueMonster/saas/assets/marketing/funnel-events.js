/* Zero-cookie QueueMonster funnel events. No PII, no network beacon, no account required.
   Integrates with GA4/Tag Manager when a separately configured tag is installed.
   Events can also be observed through the 'qm:marketing' custom browser event. */
(()=>{
 "use strict";
 const allowedEvents=new Set(["page_view","industry_view","demo_click","demo_start","demo_scene","demo_role","demo_complete","signup_click","signup_email_requested","video_click","video_play","customer_search","customer_service","customer_records"]);
 const allowedSources=new Set(["home","merchant","customer","breakfast","salon","clinic","repair","video","demo","directory","header","unknown"]);
 const pathname=location.pathname.split("/").pop()||"home.html";
 const params=new URLSearchParams(location.search);
 const safeText=(v,max=50)=>String(v||"").replace(/[^a-zA-Z0-9_-]/g,"").slice(0,max);
 const scene=()=>["breakfast","salon","clinic","repair"].includes(new URLSearchParams(location.search).get("scene"))?new URLSearchParams(location.search).get("scene"):"";
 const source=pathname==="home.html"?"home":(pathname==="customer.html"||pathname==="for-customers.html")?"customer":
   pathname==="for-merchants.html"?"merchant":pathname==="video.html"?"video":
   pathname==="demo.html"?"demo":pathname==="directory.html"?"directory":"unknown";
 function track(type,extra={}){
  if(!allowedEvents.has(type))return;
  const cleanSource=allowedSources.has(extra.source)?extra.source:source;
  const fields={
   event:"qm_marketing",qm_event:type,qm_page:pathname,qm_source:cleanSource,
   qm_role:extra.role==="customer"?"customer":extra.role==="staff"?"merchant":document.body.dataset.portal==="customer"?"customer":"merchant",
   qm_scene:["breakfast","salon","clinic","repair"].includes(extra.scene)?extra.scene:scene(),
   qm_medium:safeText(params.get("utm_medium")),
   qm_campaign:safeText(params.get("utm_campaign")),
   qm_ref:safeText(params.get("utm_source"))
  };
  window.dataLayer=window.dataLayer||[];
  window.dataLayer.push(fields);
  try{window.dispatchEvent(new CustomEvent("qm:marketing",{detail:fields}));}catch(_){}
 }
 window.qmMarketingTrack=track;
 track("page_view");
 if(source==="demo")track("demo_start",{role:params.get("role")==="customer"?"customer":"staff",scene:scene()});
 document.addEventListener("click",event=>{
  const target=event.target?.closest?.("a,button");
  if(!target)return;
  const explicit=target.dataset.qmEvent;
  let type=explicit&&allowedEvents.has(explicit)?explicit:"";
  if(!type&&target.tagName==="A"){
   let url;try{url=new URL(target.getAttribute("href"),location.href)}catch{return}
   if(url.origin!==location.origin)return;
   if(url.pathname.endsWith("/demo.html"))type="demo_click";
   else if(url.pathname.endsWith("/merchant-register.html")&&url.searchParams.get("mode")==="signup")type="signup_click";
   else if(url.pathname.endsWith("/video.html"))type="video_click";
   else if(url.pathname.endsWith("/my-records.html"))type="customer_records";
   else if(url.pathname.endsWith("/directory.html"))type="customer_search";
  }
  if(type)track(type,{source:target.dataset.qmSource||source});
 },{capture:true});
 document.addEventListener("submit",event=>{
  if(event.target?.matches?.(".qm-customer-search"))track("customer_search",{role:"customer"});
 },{capture:true});
})();
