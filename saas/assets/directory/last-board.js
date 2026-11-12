// The static Pages fallback for the platform OA "last reservation board" entry.
// The canonical source of this feature lives in QueueMonster/saas/assets/directory/main.js.
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from "../../public-config.js";
import {createClient} from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
document.body.dataset.directoryMode="mine";
document.getElementById("tab-mine")?.classList.add("active");
for(const selector of [".explore-view-switch","#explore-filters",".search-wrap","#explore-game"]){
 const node=document.querySelector(selector);
 if(node)node.style.display="none";
}
const intro=document.getElementById("intro"),results=document.getElementById("results");
const heading=document.getElementById("results-heading"),count=document.getElementById("result-count");
document.getElementById("result-pages")?.classList.add("hidden");
if(heading)heading.textContent="上次預約門市的叫號看板";
if(intro)intro.innerHTML="<strong>快速開啟上次預約的叫號看板</strong><p>以 LINE 身分確認最近一次有效預約，只有店家開啟叫號時才會進入。</p>";
function show(title,message,links=""){
 if(count)count.textContent=title;
 if(results)results.innerHTML='<div class="empty" role="status"><strong>'+message+'</strong>'+
  '<p>'+links+'</p><p><a class="btn secondary" href="./directory.html?mode=mine">我的紀錄</a> '+
  '<a class="btn secondary" href="./directory.html?mode=search">搜尋店家</a></p></div>';
}
function esc(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
const login='<a class="btn" href="./?view=customer&tab=mine&site_login=1&site_return=directory.html%3Fmode%3Dlast-board">使用 LINE 登入並繼續</a>';
show("查詢中","正在確認 LINE 身分","查詢完成後將自動開啟最近預約的門市看板。");
try{
 const sb=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{
  persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:"line-saas-customer-session-v2"
 }});
 const session=await sb.auth.getSession();
 if(session.error)throw session.error;
 if(!session.data.session){
  show("需要 LINE 登入","請先使用 LINE 登入，才能辨識最近預約的門市。",login);
 }else{
  const linked=await sb.rpc("so_site_header_identity");
  if(linked.error)throw linked.error;
  if(!String(linked.data?.display_name||"").trim()){
   show("需要 LINE 登入","請先完成 LINE 身分驗證。",login);
  }else{
   const response=await sb.rpc("so_my_last_booking_board");
   if(response.error)throw response.error;
   const data=response.data||{};
   if(data.status==="FOUND"&&/^[a-z0-9][a-z0-9-]{2,39}$/.test(String(data.slug||""))){
    const dest=new URL("./board.html",location.href);
    dest.searchParams.set("merchant",data.slug);
    location.replace(dest.href);
   }else if(data.status==="LOGIN_REQUIRED"){
    show("需要 LINE 登入","LINE 身分驗證已過期，請重新登入。",login);
   }else if(data.status==="BOARD_UNAVAILABLE"){
    show("店家未開啟叫號",esc(data.name||"最近預約的店家")+"目前沒有開放叫號看板。","可從我的紀錄查看該店預約資料。");
   }else if(data.status==="NO_BOOKING"){
    show("尚無有效預約","目前沒有找到你的有效預約。","可以先從店家搜尋進行預約。");
   }else{
    show("無法開啟","沒有可對應的叫號看板。","請從我的紀錄查看。");
   }
  }
 }
}catch(error){
 console.warn("Last booking board unavailable",error);
 show("暫時無法查詢","目前無法取得最近預約店家的叫號看板。","請稍後再試。");
}
