/* Shared header for all public overview, guide and demo pages; one list to maintain. */
(()=>{
 const mount=document.getElementById("marketing-header");if(!mount)return;
 const page=location.pathname.split("/").pop();
 const items=[
  ["平台總覽","./home.html#features","home.html"],
  ["店家功能","./for-merchants.html","for-merchants.html"],
  ["顧客功能","./for-customers.html","for-customers.html"],
  ["常見問題","./home.html#faq",""],
  ["免登入功能試用","./demo.html","demo.html"],
  ["搜尋店家","./directory.html?mode=search","directory.html"]
 ];
 const link=arr=>arr.map(([label,url,active])=>'<a href="'+url+'"'+(active===page?' aria-current="page"':'')+'>'+label+'</a>').join("");
 mount.innerHTML='<header class="qm-public-header'+(page==="home.html"?' site-head':'')+'"><div class="qm-public-inner">'+
  '<a href="./home.html" class="qm-public-logo" aria-label="排隊怪獸首頁"><img src="./monster-mascot.svg" alt="" width="60" height="60"><b>排隊怪獸</b></a>'+
  '<nav class="qm-public-nav" aria-label="網站導覽"><span>'+link(items.slice(0,4))+'</span><span class="qm-public-extra">'+link(items.slice(4))+'</span></nav>'+
  '<div id="site-auth-root" class="site-auth-slot qm-public-auth" aria-label="使用者登入狀態"><a class="site-auth-button site-auth-login" href="./directory.html?mode=search">使用 LINE 登入</a></div>'+
  '<details class="qm-public-mobile"><summary>選單 <span aria-hidden="true">⌄</span></summary><div class="qm-public-menu"><button type="button" class="qm-public-close">關閉 ×</button><nav aria-label="手機網站導覽">'+link(items)+'</nav></div></details>'+
 '</div></header>';
 const menu=mount.querySelector(".qm-public-mobile");
 menu.querySelector(".qm-public-close").addEventListener("click",()=>{menu.open=false;menu.querySelector("summary").focus()});
 menu.querySelectorAll("a").forEach(a=>a.addEventListener("click",()=>{menu.open=false}));
 document.addEventListener("keydown",e=>{if(e.key==="Escape"&&menu.open){menu.open=false;menu.querySelector("summary").focus()}});
 document.addEventListener("pointerdown",e=>{if(menu.open&&!menu.contains(e.target))menu.open=false});
})();
