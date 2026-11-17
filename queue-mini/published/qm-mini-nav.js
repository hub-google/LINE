// MINI-only chrome, never loaded by the existing website.
(()=>{
 const ids={developing:"2012649101-EFX2gymX",review:"2012649102-rNb39YpL",published:"2012649103-s6KPdX4H"};
 const env=(location.pathname.match(/\/queue-mini\/(developing|review|published)\//)||[])[1]||"developing";
 const page=location.pathname.split("/").pop()||"index.html";
 const query=new URLSearchParams(location.search);
 document.body.classList.add("qm-mini");
 document.body.dataset.miniEnvironment=env;
 const paths=[
   ["找店家","directory.html?mode=search","store",page==="directory.html"&&query.get("mode")!=="queue"],
   ["現場取號","directory.html?mode=queue","ticket",page==="directory.html"&&query.get("mode")==="queue"],
   ["我的紀錄","my-records.html","record",page==="my-records.html"]
 ];
 const make=(tag,klass)=>{const el=document.createElement(tag);if(klass)el.className=klass;return el};
 const header=make("div","qm-mini-header");
 const brand=make("a","qm-brand");brand.href="./directory.html?mode=search";
 const mascot=make("img");mascot.src="./monster-mascot.svg";mascot.alt="";
 const title=make("span");title.textContent="排隊怪獸";brand.append(mascot,title);
 const status=make("span","qm-environment");status.textContent=env==="published"?"LINE MINI App":env.toUpperCase()+" · MINI";
 header.append(brand,status);
 const bottom=make("nav","qm-mini-bottom");
 bottom.setAttribute("aria-label","MINI App 導覽");
 const icons={
  store:'<rect x="3" y="9" width="18" height="12" rx="2"/><path d="M3 9l2-6h14l2 6M8 21v-8h8v8"/>',
  ticket:'<path d="M4 4h16v6a2 2 0 000 4v6H4v-6a2 2 0 000-4V4z"/><path d="M10 5v14" stroke-dasharray="2 3"/>',
  record:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>'
 };
 for(const [label,url,kind,active] of paths){
  const a=make("a");a.href="./"+url;
  if(active)a.setAttribute("aria-current","page");
  const icon=make("span");icon.setAttribute("aria-hidden","true");
  icon.innerHTML='<svg viewBox="0 0 24 24">'+icons[kind]+'</svg>';
  const caption=make("span");caption.textContent=label;
  a.append(icon,caption);bottom.append(a);
 }
 document.body.prepend(header);
 document.body.append(bottom);
 // The directory and history are static documents. Initialize LINE there too,
 // but let app/main.js own LIFF initialization on the customer transaction page.
 if(page!=="index.html"&&page!==""){
  if(window.liff?.init){
   window.liff.init({liffId:ids[env]}).catch(err=>{
     console.warn("MINI LIFF initialization failed",err instanceof Error?err.name:"unknown");
   });
  }
 }
})();
