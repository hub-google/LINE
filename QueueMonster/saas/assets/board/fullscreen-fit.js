// A single content-aware board layout engine for landscape, portrait,
// ultra-wide and unusual displays. No device names or resolution breakpoints.
// Responsive layout ALWAYS uses the ACTUAL size of each content container.
// The Fullscreen API only hides browser chrome; it does not switch layout mode.
export function installBoardFullscreenFit(){
  const el=id=>document.getElementById(id);
  const body=document.body;
  const queue=el("upcoming"), units=el("unit-board"), single=el("single-board");
  const indicator=el("board-page-indicator");
  let frame=0, page=0, pageCount=1, visiblePerPage=0;
  const gap=8;
  const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
  const size=element=>{
    const r=element?.getBoundingClientRect();
    return {w:Math.max(1,r?.width||1),h:Math.max(1,r?.height||1)};
  };
  const textLength=text=>Math.max(1,Array.from(String(text||"")).length);
  const textFit=(text,w,h,weight=900)=>{
    const canvas=textFit.canvas||(textFit.canvas=document.createElement("canvas"));
    const ctx=canvas.getContext("2d");
    ctx.font=weight+" 100px system-ui, sans-serif";
    const measured=Math.max(1,ctx.measureText(String(text||" ")).width);
    return Math.max(1,Math.floor(Math.min(100*w/measured,h/.99)));
  };
  // A multi-line placeholder (e.g. 尚未 / 叫號) must fit its ENTIRE
  // rendered line stack, not merely the width of the concatenated text.
  function unitNowFont(now,w,h){
    const lines=String(now?.textContent||"").split(/\r?\n/);
    const availableH=Math.max(1,h-8);
    const availableW=Math.max(1,w*.84);
    if(now?.classList?.contains("is-empty")){
      // Never allow the two-line 尚未/叫號 placeholder to balloon to the
      // size of a called number. Leave room for both text lines and padding.
      return Math.max(16,Math.floor(Math.min(
        42,availableW*.12,availableH/(Math.max(1,lines.length)*1.4)
      )));
    }
    const widthFit=Math.min(...lines.map(line=>textFit(line,availableW,availableH,950)));
    return Math.max(18,Math.floor(Math.min(widthFit,availableH*.70)));
  }
  // Compare grids by the legibility their actual card dimensions support.
  // Narrow text cards favour rows; wide text cards can use more columns.
  function bestGrid(count,w,h,kind,texts=[]){
    count=Math.max(1,count);
    const minW=kind==="unit"?205:100;
    const minH=kind==="unit"?190:65;
    const maxCols=Math.min(count,Math.max(1,Math.floor((w+gap)/(minW+gap))));
    const maxRows=Math.max(1,Math.floor((h+gap)/(minH+gap)));
    const longest=Math.max(1,...texts.map(textLength));
    let best=null;
    for(let cols=1;cols<=maxCols;cols++){
      const maxPage=cols*maxRows;
      const shown=Math.min(count,maxPage);
      const rows=Math.ceil(shown/cols);
      const cellW=(w-gap*(cols-1))/cols;
      const cellH=(h-gap*(rows-1))/rows;
      if(cellW<=0||cellH<=0)continue;
      const numeric=kind==="unit"
        ?Math.min(cellH*.38,cellW*.25)
        :Math.min(cellH*.58,cellW/(longest*.65));
      const pages=Math.ceil(count/maxPage);
      const density=shown/(cols*rows);
      // Slightly favour complete, well-balanced grids over tiny multipage cells.
      const score=numeric*(.8+.2*density)/(1+.27*(pages-1));
      if(!best||score>best.score)best={cols,rows,capacity:maxPage,pages,score};
    }
    return best||{cols:1,rows:count,capacity:count,pages:1,score:0};
  }
  function layoutQueue(){
    const area=size(single);
    // Compare AVAILABLE content area rather than classifying the device.
    const layout=area.w/area.h>=1.05?"side":"stack";
    single.dataset.boardLayout=layout;
    const current=el("current"), panel=single.querySelector(".panel.current");
    const currentSize=size(panel);
    const text=current?.textContent||"—";
    const targetW=currentSize.w*.88,targetH=currentSize.h*.58;
    const numberFont=Math.min(textFit(text,targetW,targetH,950),currentSize.h*.57);
    single.style.setProperty("--board-current-font",Math.floor(numberFont)+"px");
    single.style.setProperty("--board-current-label-font",
      Math.floor(Math.min(44,Math.max(12,currentSize.h*.085)))+"px");
    const upcomingSize=size(queue);
    const numbers=Array.from(queue?.children||[]).map(x=>x.textContent||"");
    // The waiting list is always chronological from TOP to BOTTOM.
    // Never apply the multi-column grid fitter to queue numbers: it makes
    // the reading order ambiguous on wide or short screens.
    const rows=Math.max(1,numbers.length);
    single.style.setProperty("--board-queue-columns","1");
    single.style.setProperty("--board-queue-rows",String(rows));
    // Fit the text inside a single full-width row without changing order.
    const cellW=upcomingSize.w;
    const cellH=(upcomingSize.h-gap*(rows-1))/rows;
    const maxFont=Math.max(12,Math.min(cellH*.61,cellW*.60));
    const nextFont=Math.floor(Math.min(maxFont,...numbers.map(t=>textFit(t,cellW*.87,cellH*.61,900))));
    single.style.setProperty("--board-next-font",Math.max(10,nextFont)+"px");
    // Queue numbers are capped at five in the public API; all fit on one page.
    pageCount=1;visiblePerPage=numbers.length;
    if(indicator)indicator.hidden=true;
  }
  function layoutUnits(){
    const cards=[...units.querySelectorAll(".unit-card")];
    // Reset visibility before measuring and repaginate on each live-data update.
    const area=size(units);
    const grid=bestGrid(cards.length,area.w,area.h,"unit");
    pageCount=grid.pages;
    visiblePerPage=grid.capacity;
    page%=pageCount;
    units.style.setProperty("--board-unit-columns",grid.cols);
    const start=page*visiblePerPage,end=start+visiblePerPage;
    const countOnPage=Math.max(1,Math.min(cards.length-start,visiblePerPage));
    const rows=Math.ceil(countOnPage/grid.cols);
    units.style.setProperty("--board-unit-rows",rows);
    cards.forEach((card,i)=>card.toggleAttribute("data-board-hidden",i<start||i>=end));
    for(const card of cards.slice(start,end)){
      const {w,h}=size(card);
      const now=card.querySelector(".unit-now");
      const group=card.querySelector(".group");
      const heading=card.querySelector("h2");
      const next=card.querySelector(".unit-next");
      if(heading)heading.style.fontSize=Math.floor(Math.min(30,textFit(heading.textContent,w*.92,h*.11)))+"px";
      if(group)group.style.fontSize=Math.floor(Math.min(19,textFit(group.textContent,w*.92,h*.08)))+"px";
      if(next)next.style.fontSize=Math.floor(Math.min(19,textFit(next.textContent,w*.92,h*.09)))+"px";
      // Flex gives the numeric line the height LEFT after title, next, and actions.
      // Size against that actual box, not against the whole card.
      const numericHeight=Math.max(1,size(now).h);
      if(now)now.style.fontSize=unitNowFont(now,w,numericHeight)+"px";
    }
    if(indicator){
      indicator.hidden=pageCount<=1;
      indicator.textContent=pageCount>1
        ?("場次 "+(start+1)+"–"+Math.min(end,cards.length)+" / "+cards.length+"　｜　第 "+(page+1)+"/"+pageCount+" 頁")
        :"";
    }
  }
  function arrange(){
    frame=0;
    body.style.removeProperty("zoom");
    document.documentElement.scrollTop=0;
    body.scrollTop=0;
    if(units&&!units.hidden)layoutUnits();
    else if(single&&!single.hidden)layoutQueue();
  }
  function schedule(){
    if(frame)cancelAnimationFrame(frame);
    frame=requestAnimationFrame(arrange);
  }
  document.addEventListener("fullscreenchange",schedule);
  window.addEventListener("resize",schedule);
  window.addEventListener("orientationchange",schedule);
  if(typeof ResizeObserver!=="undefined"){
    const observer=new ResizeObserver(()=>schedule());
    for(const target of [single,units,queue])if(target)observer.observe(target);
  }
  // When there are more unit cards than can stay readable, use familiar
  // digital-signage rotation. Every page fits; no card disappears permanently.
  setInterval(()=>{
    if(document.hidden||pageCount<=1||units?.hidden)return;
    page=(page+1)%pageCount;schedule();
  },9000);
  schedule();
  return {schedule};
}
