// Fullscreen kiosk mode fits the layout, never the whole page. Zooming <body>
// shrank numbers to unreadable sizes while leaving most of the screen empty.
export function installBoardFullscreenFit(){
  const queue=document.getElementById("upcoming");
  const units=document.getElementById("unit-board");
  const body=document.body;
  let frame=0;
  function reset(){
    body.style.removeProperty("zoom");
    body.style.removeProperty("height");
    body.style.removeProperty("width");
    body.classList.remove("board-compact");
    queue?.style.removeProperty("--board-queue-count");
    units?.style.removeProperty("--board-unit-columns");
    units?.style.removeProperty("--board-unit-rows");
  }
  function arrange(){
    frame=0;
    // Remove any stale inline zoom from older builds before measuring.
    body.style.removeProperty("zoom");
    body.style.removeProperty("height");
    body.style.removeProperty("width");
    if(!document.fullscreenElement){reset();return;}
    document.documentElement.scrollTop=0;
    body.scrollTop=0;
    const screenWidth=window.innerWidth;
    const screenHeight=window.innerHeight;
    // No phantom five-row grid: if only two people are waiting, both cards
    // should use the space rather than leaving three empty rows.
    const waiting=Math.max(1,queue?.children.length||0);
    queue?.style.setProperty("--board-queue-count",String(waiting));
    const count=units?.hidden?0:units?.querySelectorAll(".unit-card").length||0;
    if(count){
      const cols=screenWidth>=1250
        ?Math.min(6,Math.max(2,Math.ceil(Math.sqrt(count*screenWidth/screenHeight*.7))))
        :screenWidth>=780?Math.min(4,Math.max(2,Math.ceil(Math.sqrt(count))))
        :screenWidth>=460?Math.min(3,Math.max(1,Math.ceil(Math.sqrt(count/3))))
        :Math.min(2,count);
      units.style.setProperty("--board-unit-columns",String(cols));
      units.style.setProperty("--board-unit-rows",String(Math.ceil(count/cols)));
    }
    body.classList.toggle("board-compact",screenHeight<620||(count>=10&&screenHeight<800));
  }
  function schedule(){
    if(!document.fullscreenElement)return;
    if(frame)cancelAnimationFrame(frame);
    frame=requestAnimationFrame(arrange);
  }
  document.addEventListener("fullscreenchange",()=>{
    if(document.fullscreenElement)schedule();
    else{if(frame)cancelAnimationFrame(frame);frame=0;reset();}
  });
  window.addEventListener("resize",schedule);
  window.addEventListener("orientationchange",schedule);
  return {schedule};
}
