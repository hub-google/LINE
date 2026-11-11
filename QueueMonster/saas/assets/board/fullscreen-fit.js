// Fullscreen is a display mode, not merely a requestFullscreen() call.
// First use compact viewport-constrained CSS; then shrink the entire board
// uniformly only when the viewport cannot show every queue card.
export function installBoardFullscreenFit(){
  let frame=0;
  const body=document.body;
  const main=()=>!document.getElementById("unit-board")?.hidden
    ?document.getElementById("unit-board"):document.getElementById("single-board");

  function clearFit(){
    body.style.removeProperty("zoom");
    body.style.removeProperty("height");
    body.style.removeProperty("width");
    document.documentElement.style.removeProperty("overflow");
  }
  function overflowRatio(){
    const root=document.documentElement;
    const viewportW=window.innerWidth,viewportH=window.innerHeight;
    const area=main();
    let ratio=1;
    const fit=(actual,allowed)=>{
      if(actual>allowed+1&&allowed>0)ratio=Math.min(ratio,allowed/actual);
    };
    fit(root.scrollHeight,viewportH);
    fit(root.scrollWidth,viewportW);
    fit(body.scrollHeight,body.clientHeight);
    fit(body.scrollWidth,body.clientWidth);
    if(area&&!area.hidden){
      fit(area.scrollHeight,area.clientHeight);
      fit(area.scrollWidth,area.clientWidth);
      const areaRect=area.getBoundingClientRect();
      const children=area.querySelectorAll(
        ".panel, .unit-card, .unit-card h2, .unit-card .group, .unit-card .unit-now, "+
        ".unit-card .unit-next, .unit-card .unit-open, #current, #upcoming, #upcoming li"
      );
      for(const child of children){
        if(!child.getClientRects().length)continue;
        const rect=child.getBoundingClientRect();
        if(rect.bottom>areaRect.bottom+1&&rect.height>0)
          ratio=Math.min(ratio,Math.max(.1,(areaRect.bottom-rect.top)/rect.height));
        if(rect.right>areaRect.right+1&&rect.width>0)
          ratio=Math.min(ratio,Math.max(.1,(areaRect.right-rect.left)/rect.width));
        fit(child.scrollHeight,child.clientHeight);
        fit(child.scrollWidth,child.clientWidth);
      }
    }
    // The status/footer and shop name must stay visible as well.
    for(const el of document.querySelectorAll("body > header, body > footer, #board-session-nav:not([hidden])")){
      const box=el.getBoundingClientRect();
      if(box.bottom>viewportH+1&&box.height)
        ratio=Math.min(ratio,Math.max(.1,(viewportH-box.top)/box.height));
      if(box.right>viewportW+1&&box.width)
        ratio=Math.min(ratio,Math.max(.1,(viewportW-box.left)/box.width));
    }
    return ratio;
  }
  function fitNow(){
    frame=0;
    if(!document.fullscreenElement){clearFit();return;}
    // A fullscreen request can be made while the user was scrolled to the footer.
    // Always start the kiosk display at its top, with no hidden content.
    document.documentElement.scrollTop=0;
    body.scrollTop=0;
    const viewportHeight=window.innerHeight;
    let scale=1;
    for(let i=0;i<22;i++){
      body.style.zoom=String(scale);
      body.style.width="100%";
      body.style.height=(viewportHeight/scale)+"px";
      // Force synchronous layout, including the 5-number grid or all unit cards.
      const ratio=overflowRatio();
      if(ratio>=.997)break;
      scale=Math.max(.2,Math.round(scale*Math.min(.94,ratio*.985)*1000)/1000);
      if(scale<=.2)break;
    }
  }
  function schedule(){
    if(frame)cancelAnimationFrame(frame);
    frame=requestAnimationFrame(fitNow);
  }
  document.addEventListener("fullscreenchange",()=>{
    if(document.fullscreenElement)schedule();
    else{if(frame)cancelAnimationFrame(frame);frame=0;clearFit();}
  });
  window.addEventListener("resize",()=>{if(document.fullscreenElement)schedule();});
  window.addEventListener("orientationchange",()=>{if(document.fullscreenElement)schedule();});
  return {schedule};
}
