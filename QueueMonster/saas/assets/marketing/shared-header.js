/* Role-aware header for QueueMonster public pages; merchant and customer share one platform. */
(()=>{
 const mount=document.getElementById("marketing-header");if(!mount)return;
 const page=location.pathname.split("/").pop();
 const params=new URLSearchParams(location.search);
 const merchantPages=new Set(["home.html","for-merchants.html","merchant-center.html","merchant-register.html","platform-login.html"]);
 const merchant=merchantPages.has(page)||
   (page==="demo.html"&&params.get("role")!=="customer")||
   ((page===""||page==="index.html")&&["staff","platform"].includes(params.get("view")));
 const merchantItems=[
   ["店家首頁","./home.html","home.html"],
   ["經營效益","./home.html#benefits",""],
   ["產品功能","./home.html#features",""],
   ["適用產業","./home.html#industries",""],
   ["免費體驗","./demo.html?role=merchant","demo.html"],
   ["操作教學","./for-merchants.html#guides","for-merchants.html"],
   ["顧客版","./for-customers.html",""]
 ];
 const customerItems=[
   ["顧客首頁","./for-customers.html","for-customers.html"],
   ["搜尋店家","./directory.html?mode=search","directory.html"],
   ["我的紀錄","./my-records.html","my-records.html"],
   ["使用教學","./for-customers.html#how-to",""],
   ["店家版","./home.html",""]
 ];
 const items=merchant?merchantItems:customerItems;
 const menuItems=merchant?[...items,["免費建立店家","./merchant-register.html?mode=signup","merchant-register.html"]]:items;
 const quick=merchant?
   [["免費體驗","./demo.html?role=merchant",""],["建立店家","./merchant-register.html?mode=signup",""]]:
   [["搜尋店家","./directory.html?mode=search",""],["我的紀錄","./my-records.html",""]];
 const link=arr=>arr.map(([label,url,active])=>'<a href="'+url+'"'+(active&&active===page?' aria-current="page"':'')+'>'+label+'</a>').join("");
 const headerRole=merchant?"店家版":"顧客版";
 mount.innerHTML='<header class="qm-public-header'+(page==="home.html"?' site-head':'')+'" data-header-role="'+(merchant?"merchant":"customer")+'"><div class="qm-public-inner">'+
  '<a href="'+(merchant?"./home.html":"./for-customers.html")+'" class="qm-public-logo" aria-label="排隊怪獸'+headerRole+'首頁"><img src="./monster-mascot.svg" alt="" width="60" height="60"><b>排隊怪獸</b><small class="qm-public-role">'+headerRole+'</small></a>'+
  '<nav class="qm-public-nav" aria-label="'+headerRole+'導覽"><span>'+link(items.slice(0,4))+'</span><span class="qm-public-extra">'+link(items.slice(4))+'</span></nav>'+
  '<nav class="qm-public-quicklinks" aria-label="快速操作">'+link(quick)+'</nav>'+
  '<div id="site-auth-root" class="site-auth-slot qm-public-auth" aria-label="使用者登入狀態"><span class="site-auth-name" role="status">正在確認登入狀態</span></div>'+
  (merchant?'<a href="./merchant-register.html?mode=signup" class="qm-header-cta">免費建立店家</a>':'')+
  '<details class="qm-public-mobile"><summary>選單 <span aria-hidden="true">⌄</span></summary><div class="qm-public-menu"><button type="button" class="qm-public-close">關閉 ×</button><nav aria-label="'+headerRole+'手機選單">'+link(menuItems)+'</nav></div></details>'+
 '</div></header>';
 const menu=mount.querySelector(".qm-public-mobile");
 menu.querySelector(".qm-public-close").addEventListener("click",()=>{menu.open=false;menu.querySelector("summary").focus()});
 menu.querySelectorAll("a").forEach(a=>a.addEventListener("click",()=>{menu.open=false}));
 document.addEventListener("keydown",e=>{if(e.key==="Escape"&&menu.open){menu.open=false;menu.querySelector("summary").focus()}});
 document.addEventListener("pointerdown",e=>{if(menu.open&&!menu.contains(e.target))menu.open=false});
})();
