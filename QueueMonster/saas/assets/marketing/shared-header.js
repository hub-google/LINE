/* Role-aware header for QueueMonster public pages; merchant and customer share one platform. */
(()=>{
 const mount=document.getElementById("marketing-header");if(!mount)return;
 const page=location.pathname.split("/").pop();
 const params=new URLSearchParams(location.search);
 const merchantPages=new Set(["home.html","for-merchants.html","merchant.html","merchant-center.html","merchant-register.html","platform-login.html"]);
 const merchant=merchantPages.has(page)||
   (page==="demo.html"&&params.get("role")!=="customer")||
   ((page===""||page==="index.html")&&["staff","platform"].includes(params.get("view")));
 const merchantItems=[
   ["店家首頁","./home.html","home.html"],
   ["經營效益","./home.html#benefits",""],
   ["產品功能","./home.html#features",""],
   ["適用產業","./home.html#industries",""],
   ["免費體驗","./demo.html?role=merchant","demo.html"],
   ["操作教學","./merchant.html#guides","for-merchants.html"],
   ["顧客版","./customer.html",""]
 ];
 const customerItems=[
   ["找店家","./customer.html","customer.html"],
   ["我的紀錄","./my-records.html","my-records.html"],
   ["店家版","./home.html",""]
 ];
 const items=merchant?merchantItems:customerItems;
 const menuItems=merchant?[...items,["免費建立店家","./merchant-register.html?mode=signup","merchant-register.html"]]:items;
 const quick=merchant?
   [["免費體驗","./demo.html?role=merchant",""],["建立店家","./merchant-register.html?mode=signup",""]]:
   [["找店家","./customer.html",""],["我的紀錄","./my-records.html",""]];
 const link=arr=>arr.map(([label,url,active])=>'<a href="'+url+'"'+(active&&active===page?' aria-current="page"':'')+'>'+label+'</a>').join("");
 const headerRole=merchant?"店家版":"顧客版";
 mount.innerHTML='<header class="qm-public-header'+(page==="home.html"?' site-head':'')+'" data-header-role="'+(merchant?"merchant":"customer")+'"><div class="qm-public-inner">'+
  '<a href="'+(merchant?"./home.html":"./customer.html")+'" class="qm-public-logo" aria-label="排隊怪獸'+headerRole+'首頁"><img src="./monster-mascot.svg" alt="" width="60" height="60"><b>排隊怪獸</b><small class="qm-public-role">'+headerRole+'</small></a>'+
  '<nav class="qm-public-nav" aria-label="'+headerRole+'導覽"><span>'+link(items.slice(0,4))+'</span><span class="qm-public-extra">'+link(items.slice(4))+'</span></nav>'+
  '<nav class="qm-public-quicklinks" aria-label="快速操作">'+link(quick)+'</nav>'+
  '<div id="site-auth-root" class="site-auth-slot qm-public-auth" aria-label="使用者登入狀態"><span class="site-auth-name" role="status">正在確認登入狀態</span></div>'+
  (merchant?'<a href="./merchant-register.html?mode=signup" class="qm-header-cta">免費建立店家</a>':'')+
  '<details class="qm-public-mobile"><summary>選單 <span aria-hidden="true">⌄</span></summary><div class="qm-public-menu"><button type="button" class="qm-public-close">關閉 ×</button><nav aria-label="'+headerRole+'手機選單">'+link(menuItems)+'</nav></div></details>'+
 '</div></header>';
 const menu=mount.querySelector(".qm-public-mobile");
 menu.querySelector(".qm-public-close").addEventListener("click",()=>{menu.open=false;menu.querySelector("summary").focus()});
 menu.addEventListener("click",event=>{if(event.target.closest("a"))menu.open=false});
 document.addEventListener("keydown",e=>{if(e.key==="Escape"&&menu.open){menu.open=false;menu.querySelector("summary").focus()}});
 document.addEventListener("pointerdown",e=>{if(menu.open&&!menu.contains(e.target))menu.open=false});
 // DEMO role changes must update this shared navigation without remounting
 // the auth node or clearing the user's existing login state.
 window.addEventListener("qm:demo-mode-change",event=>{
  if(page!=="demo.html")return;
  const asMerchant=event.detail?.role!=="customer";
  const header=mount.querySelector(".qm-public-header");
  const currentItems=asMerchant?merchantItems:customerItems;
  const currentMenu=asMerchant?[...currentItems,["免費建立店家","./merchant-register.html?mode=signup","merchant-register.html"]]:currentItems;
  const currentQuick=asMerchant?
   [["免費體驗","./demo.html?role=merchant",""],["建立店家","./merchant-register.html?mode=signup",""]]:
   [["搜尋店家","./directory.html?mode=search",""],["我的紀錄","./my-records.html",""]];
  const roleText=asMerchant?"店家版":"顧客版";
  header.dataset.headerRole=asMerchant?"merchant":"customer";
  const brand=header.querySelector(".qm-public-logo");
  brand.href=asMerchant?"./home.html":"./customer.html";
  brand.setAttribute("aria-label","排隊怪獸"+roleText+"首頁");
  brand.querySelector(".qm-public-role").textContent=roleText;
  const nav=header.querySelector(".qm-public-nav");
  nav.setAttribute("aria-label",roleText+"導覽");
  nav.innerHTML='<span>'+link(currentItems.slice(0,4))+'</span><span class="qm-public-extra">'+link(currentItems.slice(4))+'</span>';
  header.querySelector(".qm-public-quicklinks").innerHTML=link(currentQuick);
  header.querySelector(".qm-public-menu nav").innerHTML=link(currentMenu);
  let cta=header.querySelector(".qm-header-cta");
  if(asMerchant&&!cta){
   cta=document.createElement("a");
   cta.href="./merchant-register.html?mode=signup";
   cta.className="qm-header-cta";
   cta.textContent="免費建立店家";
   header.querySelector(".qm-public-mobile").before(cta);
  }else if(!asMerchant&&cta)cta.remove();
 });

})();
