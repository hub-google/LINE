import {customerEntryUrl,safeMerchantLogoUrl} from "../../shared-customer-links.js";
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from "../../public-config.js";

import {createClient} from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
const SB_URL=SUPABASE_URL;
const SB_KEY=SUPABASE_PUBLISHABLE_KEY;
const bridge=SB_URL+"/functions/v1/line-bridge?action=config";
const sb=createClient(SB_URL,SB_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:"line-saas-customer-session-v2"}});
const params=new URLSearchParams(location.search),mode=["search","queue","mine","game"].includes(params.get("mode"))?params.get("mode"):"search";
const els={intro:document.getElementById("intro"),results:document.getElementById("results"),keyword:document.getElementById("keyword"),test:null};
document.body.dataset.directoryMode=mode;
const filterDisclosure=document.getElementById("explore-filters");
const filterViewport=window.matchMedia("(max-width: 760px)");
const adaptFilters=()=>{if(filterDisclosure)filterDisclosure.open=!filterViewport.matches;};
adaptFilters();
filterViewport.addEventListener?.("change",adaptFilters);
function updateFilterSummary(){
 const summary=document.getElementById("filter-summary");
 if(!summary)return;
 const ids=["explore-category","explore-area","explore-service"];
 const applied=ids.filter(id=>document.getElementById(id)?.value!=="全部").length+
  (document.getElementById("explore-sort")?.value!=="popular"?1:0);
 summary.firstChild.textContent=applied?"進階篩選（已設定 "+applied+" 項） ":"進階篩選 ";
}
["explore-category","explore-area","explore-service","explore-sort"].forEach(id=>{
 document.getElementById(id)?.addEventListener("change",updateFilterSummary);
});
updateFilterSummary();

document.getElementById("tab-"+(mode==="game"?"search":mode)).classList.add("active");
let all=[],popular=[],searchResults=[],searchTotal=0,searchPage=1;
let searchLoading=false,searchError="",searchRequest=0,searchTimer=null;
let liffId="";
let mineIdentityState="loading";
const searchCriteria=()=>mode!=="mine"&&(
 Boolean(els.keyword.value.trim())||
 document.getElementById("explore-category").value!=="全部"||
 document.getElementById("explore-area").value!=="全部"||
 document.getElementById("explore-service").value!=="全部"||
 document.getElementById("explore-sort").value!=="popular"
);
const cityNames=["基隆市","臺北市","台北市","新北市","桃園市","新竹市","新竹縣","苗栗縣","臺中市","台中市","彰化縣","南投縣","雲林縣","嘉義市","嘉義縣","臺南市","台南市","高雄市","屏東縣","宜蘭縣","花蓮縣","臺東縣","台東縣","澎湖縣","金門縣","連江縣"];
function areaOf(shop){return (cityNames.find(x=>String(shop.address||"").includes(x))||"線上商圈").replace(/^臺/,"台")}
function serviceMatches(shop,service){
 const m=shop.modules||{};
 return service==="全部"||(service==="預約"&&!!m.reservation)||(service==="取號"&&!!m.queue)||(service==="點餐"&&!!m.pickup)||(service==="看板"&&!!(m.queue&&m.calling));
}
function setupExploreFilters(){
 const options=(id,items,allText)=>{
  const control=document.getElementById(id),old=control.value;
  control.innerHTML='<option value="全部">'+allText+'</option>'+items.map(x=>'<option value="'+e(x)+'">'+e(x)+'</option>').join("");
  control.value=items.includes(old)?old:"全部";
 };
 options("explore-category",[...new Set(all.map(x=>x.category||"其他"))].sort((a,b)=>a.localeCompare(b,"zh-Hant")),"全部類別");
 options("explore-area",[...new Set(all.map(areaOf))].sort((a,b)=>a.localeCompare(b,"zh-Hant")),"所有地區");
 document.querySelector(".explore-view-switch").hidden=mode==="mine";
 document.getElementById("explore-filters").classList.toggle("hidden",mode==="mine");
}

function e(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function customerUrl(slug,tab,oaMode="PLATFORM"){
 return customerEntryUrl(slug,{surface:"directory",tab,oaMode,liffId});
}
function badges(t){
 const m=t.modules||{};
 return '<span class="badge">'+e(t.category||"其他")+'</span>'+
 (m.reservation?'<span class="badge">線上預約</span>':"")+(m.queue?'<span class="badge">現場取號</span>':"")+(m.pickup?'<span class="badge">線上點餐</span>':"")+
 (t.oa_mode==="PLATFORM"?'<span class="badge">平台 LINE 服務</span>':"");
}
function render(){
 if(mode==="mine"&&mineIdentityState!=="ready"){
  document.getElementById("results-heading").textContent="我的紀錄";
  document.getElementById("result-count").textContent=mineIdentityState==="loading"?"正在確認身分":mineIdentityState==="guest"?"請先登入 LINE":"目前無法取得紀錄";
  document.getElementById("result-pages").classList.add("hidden");
  const text=mineIdentityState==="loading"?
   '<strong>正在確認 LINE 身分</strong><p>確認後才會顯示與你綁定的預約及取號紀錄。</p>':
   mineIdentityState==="guest"?
   '<strong>請先使用 LINE 登入</strong><p>登入後才能查詢自己的預約和號碼；未登入不代表沒有紀錄。</p><p class="mine-login-action"><a class="btn" href="./?view=customer&tab=mine&site_login=1&site_return=directory.html%3Fmode%3Dmine">使用 LINE 登入後查看</a></p>':
   '<strong>目前無法取得紀錄</strong><p>請重新整理頁面，或確認 LINE 已完成授權。</p>';
  els.results.innerHTML='<div class="empty" role="status">'+text+'</div>';
  return;
 }
 const keyword=els.keyword.value.trim().toLocaleLowerCase("zh-TW");
 const searching=searchCriteria();
 let filtered=[],count=0;
 if(mode==="mine"){
   filtered=all.filter(t=>((t.name||"")+" "+(t.address||"")).toLocaleLowerCase("zh-TW").includes(keyword));
   const category=document.getElementById("explore-category").value;
   const area=document.getElementById("explore-area").value;
   const service=document.getElementById("explore-service").value;
   filtered=filtered.filter(t=>(category==="全部"||(t.category||"其他")===category)
     &&(area==="全部"||areaOf(t)===area)&&serviceMatches(t,service));
   filtered.sort((a,b)=>a.name.localeCompare(b.name,"zh-Hant"));
   count=filtered.length;
 }else if(searching){
   const category=document.getElementById("explore-category").value;
   const area=document.getElementById("explore-area").value;
   const service=document.getElementById("explore-service").value;
   filtered=searchResults;
   count=searchTotal;
 }else{
   filtered=popular.slice(0,50);
   count=filtered.length;
 }
 const heading=document.getElementById("results-heading");
 heading.textContent=mode==="mine"?"我的紀錄":searching?"搜尋結果":"熱門店家排行";
 document.getElementById("result-count").textContent=searchLoading&&searching?"搜尋中…":
   searchError&&searching?"搜尋失敗":
   !searching&&mode!=="mine"?"近 30 天預約＋取號＋訂餐 · 前 "+count+" 名":
   searching?count+" 個結果":count+" 個店家";
 const paging=document.getElementById("result-pages");
 paging.classList.toggle("hidden",!searching||searchLoading||Boolean(searchError)||searchTotal<=50);
 document.getElementById("page-label").textContent="第 "+searchPage+" / "+Math.max(1,Math.ceil(searchTotal/50))+" 頁";
 document.getElementById("page-prev").disabled=searchPage<=1;
 document.getElementById("page-next").disabled=searchPage*50>=searchTotal;
 
 if(searching&&searchLoading){
   els.results.innerHTML='<div class="empty"><strong>正在搜尋店家</strong><p>依照目前的搜尋條件查詢公開店家。</p></div>';
   return;
 }
 if(searching&&searchError){
   els.results.innerHTML='<div class="empty"><strong>搜尋暫時失敗</strong><p>請稍後重試，或改用其他搜尋條件。</p></div>';
   return;
 }
 if(!filtered.length){
   const msg=mode==="mine"?"還沒有找到你的預約紀錄":searching?"找不到符合條件的店家":"目前沒有已公開的店家";
   els.results.innerHTML='<div class="empty"><strong>'+e(msg)+'</strong><p>'+
    (mode==="mine"?"可從店家提供的排隊怪獸預約連結登入同一帳號查看。":searching?"試試其他店名、地點或篩選條件。":"新的合作店家開放服務後，將顯示在此處。")+
    '</p></div>';
   return;
 }
 els.results.innerHTML=filtered.map(t=>{
  const name=e(t.name),desc=e(t.description||""),address=e(t.address||"");
  const logo=safeLogo(t.logo_url);
  const services=t.modules||{};
  const boardHref="./board.html?merchant="+encodeURIComponent(t.slug);
  const reserveHref=customerUrl(t.slug,"reserve",t.oa_mode);
  const queueHref=customerUrl(t.slug,"queue",t.oa_mode);
   const orderHref=customerUrl(t.slug,"order",t.oa_mode);
  const mineHref=customerUrl(t.slug,"mine",t.oa_mode);
  let actions="",primaryHref="";
  if(mode==="mine"){
    primaryHref=mineHref;
    actions='<a class="btn" href="'+e(mineHref)+'">查看我的紀錄</a>'+
      (services.queue?'<a class="btn secondary" href="'+e(queueHref)+'">查看號碼</a>':"")+
      (services.pickup?'<a class="btn secondary" href="'+e(orderHref)+'">查看取餐進度</a>':"")+
      (services.queue&&services.calling?'<a class="btn secondary" href="'+boardHref+'">公開叫號看板</a>':"");
  }else{
    primaryHref=services.reservation?reserveHref:services.queue?queueHref:services.pickup?orderHref:"";
    actions=(services.reservation?'<a class="btn" href="'+e(reserveHref)+'">立即預約</a>':"")+
      (services.queue?'<a class="btn'+(services.reservation?" secondary":"")+'" href="'+e(queueHref)+'">現場取號</a>':"")+
      (services.pickup?'<a class="btn secondary" href="'+e(orderHref)+'">立即點餐</a>':"")+
      (services.queue&&services.calling?'<a class="btn secondary" href="'+boardHref+'">公開叫號看板</a>':"");
  }
  const badges=badgesForStore(t);
  const rank=mode!=="mine"&&!searching&&Number(t.popularity_rank)>0?
    '<span class="rank-number'+(Number(t.popularity_rank)<=3?' leading':'')+'">#'+Number(t.popularity_rank)+'</span>':"";
  const metric=rank?'<p class="popularity-metrics">近30天 · 預約 '+Number(t.booking_count||0)+' · 取號 '+Number(t.ticket_count||0)+' · 訂餐 '+Number(t.order_count||0)+'</p>':"";
  const cover=primaryHref?'<a class="card-cover" href="'+e(primaryHref)+'" aria-label="開啟 '+name+'"></a>':"";
  return '<article class="merchant-card">'+cover+
   '<div class="card-content"><div class="card-top"><span class="shop-icon" aria-hidden="true">'+
   (logo?'<img src="'+e(logo)+'" alt="" loading="lazy" referrerpolicy="no-referrer">':'▤')+'</span>'+
   '<div class="shop-details"><div class="rank-line">'+rank+'<h3 class="shop-name" style="margin:0">'+name+'</h3></div><div class="badges">'+badges+'</div></div></div>'+
   metric+
   (desc?'<p class="shop-desc">'+desc+'</p>':"")+
   (address?'<p class="shop-address">地點：'+address+'</p>':"")+
   (mode==="mine"?'<p class="shop-desc">最近預約 '+Number(t.booking_count||0)+' 筆 · 取號 '+Number(t.ticket_count||0)+' 筆</p>':"")+
   '<div class="card-actions">'+actions+
   (address?'<a class="btn secondary" href="https://www.google.com/maps/search/?api=1&amp;query='+encodeURIComponent(t.address)+'" target="_blank" rel="noopener noreferrer">地圖位置</a>':"")+
   '</div></div></article>';
 }).join("");
}
function badgesForStore(t){return badges(t);}
function safeLogo(src){return safeMerchantLogoUrl(src,{directory:true});}
async function loadSearch(){
 if(mode==="mine")return render();
 const current=++searchRequest;
 if(!searchCriteria()){
   searchLoading=false;searchError="";searchResults=[];searchTotal=0;
   render();return;
 }
 searchLoading=true;searchError="";render();
 let {data,error}=await sb.rpc("so_public_store_search",{
   p_query:els.keyword.value.trim()||null,
   p_mode:mode==="queue"?"queue":"all",
   p_category:document.getElementById("explore-category").value,
   p_area:document.getElementById("explore-area").value,
   p_service:document.getElementById("explore-service").value,
   p_sort:document.getElementById("explore-sort").value,
   p_page:searchPage
 });
 // Search additionally by publicly configured category when a literal keyword
 // matched no store names; never exclude or hide shops by hard-coded slug.
 if(!error&&Number(data?.total||0)===0&&els.keyword.value.trim()&&document.getElementById("explore-category").value==="全部"){
  const keyword=els.keyword.value.trim().toLocaleLowerCase("zh-TW");
  const match=[...document.getElementById("explore-category").options].slice(1)
   .map(o=>o.value).filter(c=>c.toLocaleLowerCase("zh-TW").includes(keyword));
  if(match.length===1){
   const retry=await sb.rpc("so_public_store_search",{
    p_query:null,p_mode:mode==="queue"?"queue":"all",p_category:match[0],
    p_area:document.getElementById("explore-area").value,
    p_service:document.getElementById("explore-service").value,
    p_sort:document.getElementById("explore-sort").value,p_page:searchPage
   });
   if(!retry.error){data=retry.data;error=null}
  }
 }
 if(current!==searchRequest)return;
 searchLoading=false;
 if(error){searchError=error.message||"SEARCH_FAILED";searchResults=[];searchTotal=0}
 else{searchError="";searchResults=Array.isArray(data?.items)?data.items:[];
   searchTotal=Number(data?.total||0);}
 render();
}
function queueSearch(){
 if(mode==="mine")return render();
 searchPage=1;searchRequest++;
 clearTimeout(searchTimer);
 if(!searchCriteria()){
   searchLoading=false;searchError="";searchResults=[];searchTotal=0;render();return;
 }
 searchLoading=true;render();
 searchTimer=setTimeout(loadSearch,240);
}
els.keyword.addEventListener("input",queueSearch);
for(const id of ["explore-category","explore-area","explore-service","explore-sort"]){
 document.getElementById(id).addEventListener("change",queueSearch);
}
for(const [id,delta] of [["page-prev",-1],["page-next",1]]){
 document.getElementById(id).addEventListener("click",()=>{
   const next=searchPage+delta;
   if(next<1||next>Math.ceil(searchTotal/50))return;
   searchPage=next;
   loadSearch();
   document.getElementById("results-heading").scrollIntoView({behavior:"smooth",block:"start"});
 });
}
// Resolve a merchant's own LIFF app at click time instead of sending everyone
// through the headquarters LINE Login provider.
document.addEventListener("click",async event=>{
 const anchor=event.target.closest('a[href*="merchant="]');
 if(!anchor)return;
 const original=new URL(anchor.href,location.href);
 const merchant=original.searchParams.get("merchant")||"";
 if(original.searchParams.get("view")!=="customer")return; // A public board link must NOT be redirected to LINE login.
 if(!/^[a-z0-9][a-z0-9-]{2,39}$/.test(merchant))return;
 // No second LIFF redirect for merchants sharing the headquarters OA.
 const selected=all.find(shop=>shop.slug===merchant);
 if(selected?.oa_mode==="PLATFORM")return;
 event.preventDefault();
 const query=new URLSearchParams();
 query.set("view","customer");query.set("merchant",merchant);
 const tab=original.searchParams.get("tab")||"home";
 if(["home","reserve","queue","mine","progress"].includes(tab))query.set("tab",tab);
 try{
  const response=await fetch(bridge+"&merchant="+encodeURIComponent(merchant),{cache:"no-store"});
  if(!response.ok)throw Error("LINE_CHANNEL_UNAVAILABLE");
  const config=await response.json();
  if(!/^\d{8,}-[A-Za-z0-9]+$/.test(String(config.liffId||"")))
    throw Error("LIFF_NOT_AVAILABLE");
  location.assign("https://liff.line.me/"+encodeURIComponent(config.liffId)+"/?"+query.toString());
 }catch(error){
  // The canonical web page will still look up the correct merchant channel.
  location.assign("./?"+query.toString());
 }
});
function publishGameDirectory(){
 if(mode==="mine")return;
 window.LineExploreGame?.setData({
  shops:all.map(shop=>({...shop,
    reserve_href:customerUrl(shop.slug,"reserve",shop.oa_mode),
    queue_href:customerUrl(shop.slug,"queue",shop.oa_mode),
    board_href:"./board.html?merchant="+encodeURIComponent(shop.slug)
  }))
 });
}
async function load(){
 // Render identity-loading before the first network request, not "popular stores".
 let identityTimer=null;
 if(mode==="mine"){
  render();
  identityTimer=setTimeout(()=>{
   if(mineIdentityState==="loading"){mineIdentityState="error";render();}
  },10000);
 }
 try{
  // Parallelize LINE config and identity; guests can see the sign-in CTA without config.
  const confPromise=fetch(bridge,{cache:"no-store"}).then(r=>r.ok?r.json():{}).catch(()=>({}));
  if(mode==="mine"){
    els.intro.innerHTML='<strong>我的預約與取號紀錄</strong><p>查詢自己已綁定 LINE 身分的預約與號碼紀錄。</p>';
    const s=await sb.auth.getSession();
    if(s.error)throw s.error;
    if(!s.data.session){const x=await sb.auth.signInAnonymously();if(x.error)throw x.error}
    const linked=await sb.rpc("so_site_header_identity");
    if(linked.error)throw linked.error;
    if(!String(linked.data?.display_name||"").trim()){
      mineIdentityState="guest";
      all=[];
    }else{
      const {data,error}=await sb.rpc("so_my_merchant_activity");
      if(error)throw error;
      mineIdentityState="ready";
      all=Array.isArray(data)?data:[];
      const conf=await confPromise;
      liffId=conf.liffId||"";
    }
  }else{
    // Optional LINE channel configuration must not block public store discovery.
    // When it arrives later, refresh existing links without fetching stores again.
    void confPromise.then(conf=>{
      const updated=String(conf?.liffId||"");
      if(updated===liffId)return;
      liffId=updated;
      if(all.length){publishGameDirectory();render();}
    });
    els.intro.innerHTML=mode==="game"?
      '<strong>遊戲逛街 · 逛商圈找店家</strong><p>在虛擬商店街點選店面，查看真實公開店家的預約與取號入口。</p>':mode==="search"?
      '<strong>找店家、查看叫號更簡單</strong><p>搜尋店名或地點，直接查看可使用的服務。公開叫號看板無須登入；預約及取號才需 LINE 身分驗證。</p>':
      '<strong>選擇提供現場取號的店家</strong><p>公開看板可直接查看；實際取號時才需要 LINE 驗證。</p>';
    const [directory,ranking]=await Promise.all([
      sb.rpc("so_public_directory",{p_query:null,p_mode:mode==="queue"?"queue":"all"}),
      sb.rpc("so_public_popular_stores",{p_mode:mode==="queue"?"queue":"all",p_limit:50})
    ]);
    if(directory.error)throw directory.error;
    if(ranking.error)throw ranking.error;
    all=Array.isArray(directory.data)?directory.data:[];
    popular=Array.isArray(ranking.data)?ranking.data:[];
  }
  setupExploreFilters();
  publishGameDirectory();
  render();
 }catch(error){
  console.warn("Store discovery unavailable",error);
  if(mode==="mine"){mineIdentityState="error";render();}
  els.intro.innerHTML='<strong>暫時無法取得店家資訊</strong><p>請稍後重新整理頁面。</p>';
  els.results.innerHTML='<div class="empty"><strong>資料暫時無法載入</strong><p>請稍後重新整理頁面。</p></div>';
 }finally{
  if(identityTimer!==null)clearTimeout(identityTimer);
 }
}
load();
