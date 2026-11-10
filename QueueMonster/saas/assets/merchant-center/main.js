
(function(){
  var tabs=Array.prototype.slice.call(document.querySelectorAll("[data-mode]"));
  function setMode(mode,focus){
    tabs.forEach(function(tab){
      var selected=tab.getAttribute("data-mode")===mode;
      tab.setAttribute("aria-selected",String(selected));
      tab.tabIndex=selected?0:-1;
      if(focus&&selected)tab.focus();
    });
    document.querySelectorAll(".mode-panel").forEach(function(panel){
      panel.hidden=panel.id!=="mode-"+mode;
    });
  }
  tabs.forEach(function(tab,index){
    tab.addEventListener("click",function(){setMode(tab.getAttribute("data-mode"),false)});
    tab.addEventListener("keydown",function(e){
      if(e.key!=="ArrowRight"&&e.key!=="ArrowLeft")return;
      e.preventDefault();
      var n=(index+(e.key==="ArrowRight"?1:tabs.length-1))%tabs.length;
      setMode(tabs[n].getAttribute("data-mode"),true);
    });
  });
  var links=Array.prototype.slice.call(document.querySelectorAll(".side a"));
  if("IntersectionObserver" in window){
    var observer=new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){
          links.forEach(function(a){a.classList.toggle("active",a.getAttribute("href")==="#"+entry.target.id)});
        }
      });
    },{rootMargin:"-20% 0px -65% 0px"});
    document.querySelectorAll(".content-section").forEach(function(section){observer.observe(section)});
  }
  var mobileGuide=document.getElementById("mobile-guide-nav");
  if(mobileGuide){
    mobileGuide.querySelectorAll('a[href^="#"]').forEach(function(link){
      link.addEventListener("click",function(){
        mobileGuide.open=false;
        var label=document.getElementById("mobile-guide-label");
        if(label)label.textContent="操作目錄 · "+link.textContent.trim().replace(/^\\d+\\s*/,"");
      });
    });
    document.addEventListener("keydown",function(event){if(event.key==="Escape"&&mobileGuide.open)mobileGuide.open=false});
  }
  if(location.hash==="#mode-own"){setMode("own",false);document.getElementById("mode").scrollIntoView()}
})();
