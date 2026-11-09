/* Original pixel-street merchant discovery. Uses the same public store feed as list search. */
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const panel=$("explore-game"), world=$("explore-world"), street=$("explore-street");
const list=$("explore-list"), listSwitch=$("explore-switch-list"),gameSwitch=$("explore-switch-game");
if(!panel||!world||!street||!listSwitch||!gameSwitch)return;
let shops=[],area=null,visible=[],selectedIndex=0,activeView=false,category="全部";
const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const cities=["基隆市","臺北市","台北市","新北市","桃園市","新竹市","新竹縣","苗栗縣","臺中市","台中市","彰化縣","南投縣","雲林縣","嘉義市","嘉義縣","臺南市","台南市","高雄市","屏東縣","宜蘭縣","花蓮縣","臺東縣","台東縣","澎湖縣","金門縣","連江縣"];
const cityOf=store=>{
 const address=String(store.address||"");
 const found=cities.find(city=>address.includes(city));
 return found?.replace(/^臺/,"台")||"線上商圈";
};
function shopCategory(shop){return String(shop.category||"其他").trim()||"其他"}
function groupOf(shop){return cityOf(shop)}
function destination(shop){
 if(shop.modules?.reservation)return shop.reserve_href;
 if(shop.modules?.queue)return shop.queue_href;
 return shop.board_href||"";
}
function gameList(){
 return shops.filter(s=>category==="全部"||shopCategory(s)===category);
}
function setView(view){
 activeView=view==="game";
 list.hidden=activeView;
 panel.hidden=!activeView;
 listSwitch.setAttribute("aria-pressed",String(!activeView));
 gameSwitch.setAttribute("aria-pressed",String(activeView));
 $("explore-filters")?.classList.toggle("hidden",activeView);
 $("explore-game-note")?.classList.toggle("hidden",!activeView);
 const params=new URLSearchParams(location.search);
 if(!["mine","queue"].includes(params.get("mode"))){
  if(activeView)params.set("mode","game");
  else if(params.get("mode")==="game")params.set("mode","search");
  history.replaceState(null,"",location.pathname+"?"+params.toString());
 }
 if(activeView)showWorld();
}
function shopSummary(store){
 const modes=[];
 if(store.modules?.reservation)modes.push("線上預約");
 if(store.modules?.queue)modes.push("現場取號");
 if(store.modules?.queue&&store.modules?.calling)modes.push("即時叫號看板");
 return [shopCategory(store),...modes].join(" · ");
}
function optionsForRegion(){return [...new Set(gameList().map(groupOf))].sort((a,b)=>a.localeCompare(b,"zh-Hant"))}
function showWorld(){
 area=null;
 street.hidden=true;
 world.hidden=false;
 const groups=optionsForRegion();
 $("arcade-region-count").textContent=shops.length+" 家公開店家";
 const container=$("arcade-regions");
 if(!groups.length){
  container.innerHTML='<div class="arcade-empty"><strong>目前尚無已公開店家</strong>有店家開通公開列表後，會出現在這張探索地圖。</div>';
  return;
 }
 container.innerHTML=groups.map(group=>{
  const count=gameList().filter(s=>groupOf(s)===group).length;
  return '<button type="button" class="region-choice" data-region="'+escapeHtml(group)+'" aria-label="進入'+escapeHtml(group)+'">'+
   '<span class="region-art" aria-hidden="true"><span class="building"></span><span class="building"></span><span class="building"></span></span>'+
   '<strong>'+escapeHtml(group)+'</strong><small>'+count+' 家</small></button>';
 }).join("");
}
function drawStreet(){
 if(!area)return;
 visible=gameList().filter(shop=>groupOf(shop)===area);
 selectedIndex=Math.min(Math.max(selectedIndex,0),Math.max(0,visible.length-1));
 $("arcade-street-name").textContent=area;
 $("arcade-street-meta").textContent=visible.length+" 家店面";
 const line=$("arcade-shopline");
 if(!visible.length){
  line.innerHTML='<div class="arcade-empty"><strong>目前沒有店家</strong>請回到商圈地圖選擇其他區域。</div>';
  $("arcade-shop-info").innerHTML="";
  return;
 }
 line.innerHTML=visible.map((shop,index)=>{
  const name=escapeHtml(shop.name);
  return '<button type="button" class="street-shop" data-shop-index="'+index+'" data-selected="'+(index===selectedIndex)+'" aria-label="查看'+name+'">'+
   '<span class="pixel-roof" aria-hidden="true"></span><span class="pixel-body" aria-hidden="true"><span class="pixel-sign">'+name+'</span><span class="pixel-window"></span><span class="pixel-window right"></span><span class="pixel-door"></span><span class="pixel-keeper"><i class="keeper-hair"></i><i class="keeper-face"></i><i class="keeper-apron"></i></span></span>'+
   '<span class="shop-name-bubble">'+name+'</span></button>';
 }).join("")+'<div class="pixel-avatar" id="arcade-avatar" aria-hidden="true"><span class="hair"></span><span class="face"></span><span class="shirt"></span><span class="feet"></span></div>';
 selectShop(selectedIndex,false);
}
function selectShop(index,scroll=true){
 if(!visible.length)return;
 selectedIndex=(index+visible.length)%visible.length;
 const shop=visible[selectedIndex];
 for(const button of $("arcade-shopline").querySelectorAll("[data-shop-index]")){
  button.dataset.selected=String(Number(button.dataset.shopIndex)===selectedIndex);
 }
 const buttons=$("arcade-shopline").querySelectorAll("[data-shop-index]");
 const button=buttons[selectedIndex],avatar=$("arcade-avatar");
 if(button&&avatar)avatar.style.transform="translateX("+Math.round(button.offsetLeft+button.offsetWidth/2-12)+"px)";
 if(button&&scroll)button.scrollIntoView({behavior:"smooth",block:"nearest",inline:"center"});
 const target=destination(shop);
 const links=(shop.modules?.reservation?'<a class="btn" href="'+escapeHtml(shop.reserve_href)+'">立即預約</a>':"")+
  (shop.modules?.queue?'<a class="btn secondary" href="'+escapeHtml(shop.queue_href)+'">現場取號</a>':"")+
  (shop.modules?.queue&&shop.modules?.calling?'<a class="btn secondary" href="'+escapeHtml(shop.board_href)+'">查看叫號看板</a>':"");
 $("arcade-shop-info").innerHTML='<div><strong>'+escapeHtml(shop.name)+'</strong><p>'+
  escapeHtml(shopSummary(shop))+(shop.address?" · "+escapeHtml(shop.address):"")+
  '</p></div>'+
  '<div class="arcade-panel-actions">'+links+'</div>';
 $("arcade-open-shop").disabled=!target;
 $("arcade-open-shop").dataset.href=target||"";
}
function enterRegion(region){
 if(!optionsForRegion().includes(region))return;
 area=region;selectedIndex=0;world.hidden=true;street.hidden=false;drawStreet();
}
listSwitch.addEventListener("click",()=>setView("list"));
gameSwitch.addEventListener("click",()=>setView("game"));
$("arcade-regions").addEventListener("click",event=>{
 const button=event.target.closest("[data-region]");
 if(button)enterRegion(button.dataset.region);
});
$("arcade-back").addEventListener("click",()=>showWorld());
$("arcade-previous").addEventListener("click",()=>selectShop(selectedIndex-1));
$("arcade-next").addEventListener("click",()=>selectShop(selectedIndex+1));
$("arcade-open-shop").addEventListener("click",()=>{
 const href=$("arcade-open-shop").dataset.href;
 if(href)location.assign(href);
});
$("arcade-shopline").addEventListener("click",event=>{
 const button=event.target.closest("[data-shop-index]");
 if(!button)return;
 selectShop(Number(button.dataset.shopIndex));
});
$("arcade-game-categories").addEventListener("change",event=>{
 category=event.target.value;showWorld();
});
document.addEventListener("keydown",event=>{
 if(!activeView||street.hidden||event.altKey||event.metaKey||event.ctrlKey)return;
 if(event.target.closest("input,textarea,select,[contenteditable]"))return;
 if(event.key==="ArrowLeft"){event.preventDefault();selectShop(selectedIndex-1)}
 if(event.key==="ArrowRight"){event.preventDefault();selectShop(selectedIndex+1)}
 if(event.key==="Enter"&&event.target===document.body){event.preventDefault();$("arcade-open-shop").click()}
});
window.LineExploreGame={
 setData({shops:publicShops=[]}={}){
  shops=Array.isArray(publicShops)?publicShops.filter(s=>s?.slug&&!s.slug.startsWith("qa-")&&!["greenfield-salon","demo-clinic"].includes(s.slug)):[];
  const current=$("arcade-game-categories").value||"全部";
  const values=["全部",...new Set(shops.map(shopCategory))];
  $("arcade-game-categories").innerHTML=values.map(v=>'<option value="'+escapeHtml(v)+'">'+escapeHtml(v==="全部"?"全部類別":v)+'</option>').join("");
  category=values.includes(current)?current:"全部";
  $("arcade-game-categories").value=category;
  if(activeView)showWorld();
 },
 setView
};
setView(new URLSearchParams(location.search).get("mode")==="game"?"game":"list");
})();
