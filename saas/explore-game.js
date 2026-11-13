/* Queue Monster pixel city: direct-to-store map and animated, accessible interiors.
   Uses ONLY the existing public directory feed and existing customer service URLs. */
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const panel=$("explore-game"),world=$("explore-world"),interior=$("explore-street");
const list=$("explore-list"),listSwitch=$("explore-switch-list"),gameSwitch=$("explore-switch-game");
if(!panel||!world||!interior||!listSwitch||!gameSwitch)return;
const map=$("arcade-map-layer"),canvas=$("arcade-city-svg"),pins=$("arcade-map-pins");
const SIZE={w:2400,h:1500};
const camera={x:0,y:0,z:1};
let shops=[],category="全部",activeView=false,current=null,initialized=false,dragged=false;
let roomPosition={x:470,y:450},avatarTimer=null,resizeQueued=false;
const pointers=new Map();
const escapeHtml=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const hash=value=>{let n=2166136261;for(const ch of String(value)){n^=ch.charCodeAt(0);n=Math.imul(n,16777619)}return n>>>0};
const pick=(list,n)=>list[Math.abs(n)%list.length];
const mod=(shop,kind)=>!!shop.modules?.[kind];
const colorFor=shop=>pick(["#f65d94","#46b9e8","#ffbd42","#5ab48d","#af85d7","#ee8b68","#7c91f1"],hash(shop.category||shop.slug));
const shopCategory=shop=>String(shop.category||"其他").trim()||"其他";
const gameList=()=>shops.filter(s=>category==="全部"||shopCategory(s)===category);
function destination(shop){
 if(shop.modules?.reservation)return shop.reserve_href;
 if(shop.modules?.queue)return shop.queue_href;
 if(shop.modules?.pickup)return shop.order_href;
 return shop.board_href||"";
}
function shopSummary(shop){
 const a=[shopCategory(shop)];
 if(mod(shop,"reservation"))a.push("線上預約");
 if(mod(shop,"queue"))a.push("現場取號");
 if(mod(shop,"pickup"))a.push("線上點餐");
 if(mod(shop,"queue")&&mod(shop,"calling"))a.push("即時叫號");
 return a.join(" · ");
}
function rand(x,y,z=0){return hash(x+":"+y+":"+z)%997/997}
function rect(x,y,w,h,c,more=""){return '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" fill="'+c+'" '+more+'/>'}
function tree(x,y,s=1){
 const size=13*s,base='<ellipse cx="'+(x+4)+'" cy="'+(y+10)+'" rx="'+(size+4)+'" ry="'+(size*.8)+'" fill="#163a3580"/>';
 return '<g>'+base+rect(x-3*s,y-5*s,6*s,23*s,"#6d5444")+
  '<circle cx="'+x+'" cy="'+(y-10*s)+'" r="'+size+'" fill="#316b47" stroke="#244936" stroke-width="3"/>'+
  '<circle cx="'+(x-5*s)+'" cy="'+(y-14*s)+'" r="'+(8*s)+'" fill="#4c9c5d"/>'+
  '<circle cx="'+(x+6*s)+'" cy="'+(y-11*s)+'" r="'+(6*s)+'" fill="#71b675"/></g>';
}
function house(x,y,w,h,k){
 const roofs=["#bb6d56","#8c797c","#d39469","#5f83a0","#bd986a"];
 const walls=["#f3dbb8","#c7dddb","#e8c0b8","#d9dae8","#d4d0a3"];
 const roof=pick(roofs,k),wall=pick(walls,k+2);
 let s='<g>'+rect(x+5,y+7,w,h,"#23443b70")+rect(x,y,w,h,wall,'stroke="#495454" stroke-width="3"');
 s+=rect(x-3,y-6,w+6,21,roof,'stroke="#554b4d" stroke-width="3"');
 for(let i=0;i<3;i++)s+=rect(x+7+i*(w-14)/3,y-2,(w-26)/3,3,"#ffe4bf5c");
 s+=rect(x+9,y+34,Math.max(12,w*.22),Math.min(22,h-44),"#81b6c5",'stroke="#52696c" stroke-width="3"');
 s+=rect(x+w-29,y+34,19,Math.min(22,h-44),"#81b6c5",'stroke="#52696c" stroke-width="3"');
 s+=rect(x+w/2-9,y+h-29,18,29,"#85674f",'stroke="#5e4d40" stroke-width="2"');
 s+=rect(x+w/2+4,y+h-17,3,4,"#e2c891");
 return s+'</g>';
}
function tower(x,y,w,h,k){
 const fill=pick(["#c9ccbc","#c7d3d7","#d1bdaf","#afc3c5"],k),glass=pick(["#6996a1","#94bfca","#6e96ad"],k+2);
 let s='<g>'+rect(x+8,y+10,w,h,"#2c393b65")+rect(x,y,w,h,fill,'stroke="#596469" stroke-width="4"')+
 rect(x+8,y+8,w-16,h-16,glass,'stroke="#526a72" stroke-width="2"');
 for(let row=0;row<Math.floor((h-20)/18);row++)for(let col=0;col<Math.floor((w-20)/18);col++)
  s+=rect(x+12+18*col,y+12+18*row,12,11,(row+col)%3===0?"#cce6df":"#7cabb5",'stroke="#637d83" stroke-width="1"');
 s+=rect(x+14,y-7,w-28,8,"#9ca7a7")+'</g>';return s;
}
function park(x,y,w,h,k){
 let s='<g>'+rect(x,y,w,h,"#80af78",'stroke="#436d49" stroke-width="4"');
 s+='<path d="M '+(x+10)+' '+(y+h/2)+' H '+(x+w-10)+' M '+(x+w/2)+' '+(y+10)+' V '+(y+h-10)+'" stroke="#ddcfad" stroke-width="13"/>';
 for(let i=0;i<10;i++){const a=rand(k,i,1);const b=rand(k,i,2);const tx=x+20+a*(w-40),ty=y+15+b*(h-30);if(Math.abs(tx-(x+w/2))>18&&Math.abs(ty-(y+h/2))>18)s+=tree(Math.floor(tx),Math.floor(ty),.7+rand(k,i,3)*.4)}
 s+='<circle cx="'+(x+w/2)+'" cy="'+(y+h/2)+'" r="25" fill="#b8d7d0" stroke="#ddd9bc" stroke-width="6"/>'+
 '<circle class="arcade-water" cx="'+(x+w/2)+'" cy="'+(y+h/2)+'" r="12" fill="#67bcd0"/>';
 return s+'</g>';
}
function citySvg(){
 let s='<defs><pattern id="qm-grass" width="28" height="28" patternUnits="userSpaceOnUse">'+
 rect(0,0,28,28,"#79a873")+rect(5,8,3,3,"#92c18a")+rect(20,22,2,2,"#60955e")+'</pattern>'+
 '<pattern id="qm-road" width="48" height="48" patternUnits="userSpaceOnUse">'+rect(0,0,48,48,"#556164")+rect(6,6,2,2,"#647175")+'</pattern></defs>'+
 rect(0,0,SIZE.w,SIZE.h,'url(#qm-grass)');
 // A winding river, banks and bridges; this is a fictional game map, not an address map.
 const river="M -130 370 C 260 325 475 485 805 410 S 1350 270 1630 365 S 2070 465 2530 335";
 s+='<path d="'+river+'" fill="none" stroke="#47785a" stroke-width="175"/>'+
 '<path d="'+river+'" fill="none" stroke="#bbcc9f" stroke-width="157"/>'+
 '<path d="'+river+'" fill="none" stroke="#315e6f" stroke-width="147"/>'+
 '<path d="'+river+'" fill="none" stroke="#34788a" stroke-width="133"/>'+
 '<path class="arcade-water" d="'+river+'" fill="none" stroke="#5a9aa8" stroke-width="14" stroke-dasharray="50 85" opacity=".55"/>';
 // Road and sidewalk grid.
 for(let x=0;x<=SIZE.w;x+=300){
  s+=rect(x-37,0,88,SIZE.h,"#a7aca3")+rect(x-28,0,70,SIZE.h,'url(#qm-road)');
  for(let y=10;y<SIZE.h;y+=62)s+=rect(x+4,y,4,28,"#bbc3b4");
 }
 for(let y=0;y<=SIZE.h;y+=300){
  s+=rect(0,y-38,SIZE.w,89,"#adb1a8")+rect(0,y-28,SIZE.w,70,'url(#qm-road)');
  for(let x=12;x<SIZE.w;x+=60)s+=rect(x,y+4,28,4,"#c3c6b1");
 }
 // Crosswalks with sidewalks on intersection corners.
 for(let y=0;y<=SIZE.h;y+=300)for(let x=0;x<=SIZE.w;x+=300){
  for(let n=0;n<4;n++)s+=rect(x+48+n*7,y+52,4,20,"#dde0d2")+rect(x+46+n*7,y-67,4,20,"#dde0d2");
 }
 // Tile art: hundreds of independently detailed buildings, parks and trees.
 for(let row=0;row<5;row++)for(let col=0;col<8;col++){
  const x=col*300+62,y=row*300+62,k=col*19+row*37;
  if((k%11)===0){s+=park(x,y,201,200,k);continue}
  if(k%7===0){s+=tower(x+9,y+13,84,163,k)+tower(x+115,y+43,75,128,k+1);continue}
  for(let a=0;a<3;a++)for(let b=0;b<2;b++){
   const xx=x+a*70+4,yy=y+b*106+5;
   const wave=370-15*Math.sin(xx/125)+25*Math.sin(xx/300);
   if(Math.abs(yy+35-wave)<94)continue;
   const w=52+(k+a)%2*6,h=68+(k+b)%3*5;
   s+=house(xx,yy,w,h,k+a+b*13);
  }
  for(let t=0;t<5;t++){const tx=x+15+rand(k,t,11)*181,ty=y+12+rand(k,t,12)*184;
   const wave=370-15*Math.sin(tx/125)+25*Math.sin(tx/300);
   if(Math.abs(ty-wave)>110)s+=tree(Math.floor(tx),Math.floor(ty),.5);
  }
 }
 // Landmark roundabout with fountain.
 s+='<circle cx="1990" cy="1045" r="128" fill="#526267" stroke="#afb2a5" stroke-width="12"/>'+
 '<circle cx="1990" cy="1045" r="88" fill="#6c9f69" stroke="#d6ccb6" stroke-width="9"/>'+
 '<circle cx="1990" cy="1045" r="36" fill="#5ea4bd" stroke="#b0cfc6" stroke-width="10"/>'+
 '<circle class="arcade-water" cx="1990" cy="1045" r="17" fill="#bbeced"/>';
 for(let a=0;a<9;a++){const theta=a*Math.PI*2/9;s+=tree(Math.round(1990+72*Math.cos(theta)),Math.round(1045+72*Math.sin(theta)),.7)}
 // Lamp posts, moving-looking pedestrians and street furniture.
 for(let i=0;i<24;i++){
  const x=130+(i*227)%2150,y=130+(i*173)%1280;
  s+='<g class="arcade-pedestrian">'+rect(x,y,9,12,i%3===0?"#e9b36e":"#547eac")+
   '<circle cx="'+(x+4)+'" cy="'+(y-5)+'" r="5" fill="#eac39b"/>'+rect(x+1,y+12,3,6,"#485159")+rect(x+6,y+12,3,6,"#485159")+'</g>';
 }
 return s;
}
const slots=[[480,670],[980,790],[1420,685],[1875,760],[730,1160],[1180,1070],[1580,1230],[2090,1240],[250,1040],[440,1320],[1190,160],[1700,205],[2145,245],[430,165],[820,950],[1760,995],[2150,645],[1380,1325],[1040,440],[2250,1170]];
function locationFor(index){
 if(index<slots.length)return slots[index];
 const i=index-slots.length;return [190+(i*167)%2080,180+(i*251)%1180];
}
function renderPins(){
 if(!initialized)return;
 const shown=gameList();
 const positions=shown.map(shop=>shops.findIndex(s=>s.slug===shop.slug));
 pins.innerHTML=shown.map((shop,i)=>{
  const index=positions[i],pos=locationFor(index);
  return '<button type="button" class="arcade-pin" data-shop-slug="'+escapeHtml(shop.slug)+'" style="left:'+pos[0]+'px;top:'+pos[1]+'px;--pin-color:'+colorFor(shop)+'" aria-label="進入'+escapeHtml(shop.name)+'">'+
   '<strong>'+escapeHtml(shop.name)+'</strong><small>'+escapeHtml(shopCategory(shop))+' · 走進店家</small></button>';
 }).join("");
 $("arcade-region-count").textContent=shown.length+" 家公開店家";
 const existing=$("arcade-map-message");
 if(!shown.length){
  if(!existing){const message=document.createElement("div");message.id="arcade-map-message";message.className="arcade-map-message";world.appendChild(message)}
  $("arcade-map-message").textContent=shops.length?"這個類別目前沒有已公開店家，請選擇其他分類。":"目前尚無公開店家，店家開放公開搜尋後會出現在這座城市。";
 }else existing?.remove();
}
function initialize(){
 if(initialized)return;initialized=true;
 canvas.innerHTML=citySvg();
 $("arcade-map-cars").innerHTML='<i class="arcade-car a"></i><i class="arcade-car b"></i><i class="arcade-car c"></i><i class="arcade-car d"></i>';
 fitMap();
}
function renderCamera(){map.style.transform='translate3d('+Math.round(camera.x)+'px,'+Math.round(camera.y)+'px,0) scale('+camera.z.toFixed(4)+')'}
function clampCamera(){
 const w=world.clientWidth||1200,h=world.clientHeight||650;
 const scaledW=SIZE.w*camera.z,scaledH=SIZE.h*camera.z;
 camera.x=scaledW<=w?(w-scaledW)/2:Math.min(0,Math.max(w-scaledW,camera.x));
 camera.y=scaledH<=h?(h-scaledH)/2:Math.min(0,Math.max(h-scaledH,camera.y));
}
function fitMap(){
 if(!initialized)return;
 const w=world.clientWidth||1200,h=world.clientHeight||650;
 camera.z=Math.max(.42,Math.min(1.12,w/1720,h/1040));
 const target=shops.length<3?[900,780]:[1200,760];
 camera.x=w/2-target[0]*camera.z;camera.y=h/2-target[1]*camera.z;
 clampCamera();renderCamera();
}
function zoomAt(next,px,py){
 const box=world.getBoundingClientRect(),x=px??box.width/2,y=py??box.height/2;
 const z=Math.min(2.15,Math.max(.42,next));
 camera.x=x-(x-camera.x)*z/camera.z;
 camera.y=y-(y-camera.y)*z/camera.z;camera.z=z;
 clampCamera();renderCamera();
}
function pan(dx,dy){camera.x+=dx;camera.y+=dy;clampCamera();renderCamera()}
function showWorld(){initialize();interior.hidden=true;world.hidden=false;current=null;renderPins();document.body.style.overflow=""}
function setView(view){
 activeView=view==="game";
 list.hidden=activeView;panel.hidden=!activeView;
 document.body.dataset.exploreView=activeView?"game":"list";
 listSwitch.setAttribute("aria-pressed",String(!activeView));
 gameSwitch.setAttribute("aria-pressed",String(activeView));
 $("explore-filters")?.classList.toggle("hidden",activeView);
 const params=new URLSearchParams(location.search);
 if(!["mine","queue"].includes(params.get("mode"))){
  if(activeView)params.set("mode","game");
  else if(params.get("mode")==="game")params.set("mode","search");
  history.replaceState(null,"",location.pathname+"?"+params.toString());
 }
 if(activeView){showWorld();fitMap()}else{interior.hidden=true;document.body.style.overflow=""}
}
function plant(x,y){
 return '<g>'+rect(x-16,y+4,32,22,"#ad7460",'stroke="#624b43" stroke-width="4"')+
 '<circle cx="'+x+'" cy="'+(y-12)+'" r="23" fill="#397e51" stroke="#275c42" stroke-width="4"/>'+
 '<circle cx="'+(x-7)+'" cy="'+(y-18)+'" r="12" fill="#62b46e"/></g>';
}
function person(x,y,k){
 const colors=["#eca76a","#87a3d5","#de8fa8","#9dc18a"];
 return '<g class="arcade-pedestrian">'+rect(x+5,y,25,27,"#4d3d39")+rect(x+8,y+14,21,24,"#edbc95")+
 rect(x,y+38,38,26,pick(colors,k))+rect(x+4,y+64,12,15,"#4c5262")+rect(x+22,y+64,12,15,"#4c5262")+
 rect(x+12,y+22,4,4,"#2c3235")+rect(x+23,y+22,4,4,"#2c3235")+'</g>';
}
function roomSvg(shop){
 const kind=shopCategory(shop),food=/餐|飲|咖啡|食|烘焙|早餐/.test(kind),
  health=/診|醫|牙|健康|藥/.test(kind),beauty=/髮|美|甲|按摩|SPA|美容/.test(kind);
 const accent=colorFor(shop),wall=health?"#d1e1dc":beauty?"#f1d1d9":food?"#edd7ab":"#d5d8e9";
 let s='<defs><pattern id="qm-floor" patternUnits="userSpaceOnUse" width="52" height="52">'+
 rect(0,0,52,52,"#bb976f")+rect(0,0,50,50,"#d3b185")+rect(2,3,45,3,"#ead1a660")+'</pattern></defs>'+
 rect(0,0,960,570,"#2d3938")+rect(20,20,920,224,wall,'stroke="#3b5551" stroke-width="9"')+
 rect(20,240,920,310,'url(#qm-floor)','stroke="#3d4141" stroke-width="8"');
 // Wood beams, windows and shop sign.
 s+=rect(35,52,890,18,"#8f7167")+rect(40,177,880,17,"#9c7d72")+
 rect(98,82,164,90,"#608d94",'stroke="#7b5657" stroke-width="12"')+
 rect(108,91,140,71,"#a2ced2")+rect(176,88,7,82,"#785c59")+
 rect(693,82,160,90,"#608d94",'stroke="#7b5657" stroke-width="12"')+
 rect(702,91,142,70,"#b1d6d9")+rect(772,88,7,82,"#785c59")+
 rect(305,48,340,92,"#fff5d4",'stroke="#654d41" stroke-width="10"')+
 rect(316,57,318,8,accent);
 const name=escapeHtml(String(shop.name||"店家").slice(0,18));
 s+='<text x="475" y="109" text-anchor="middle" fill="#3c4e44" font-size="32" font-weight="900" font-family="sans-serif">'+name+'</text>';
 // Floor carpet and main counter.
 s+=rect(285,355,390,135,"#a27460",'stroke="#705a51" stroke-width="7"')+
 rect(300,365,360,112,"#d7a986")+rect(321,380,315,70,"#e6c39f")+
 rect(326,195,305,128,"#9a7560",'stroke="#5a514b" stroke-width="7"')+
 rect(337,205,283,48,"#f8e2af")+
 rect(337,260,283,43,"#c4976f")+
 rect(398,280,45,20,"#7d5e50")+rect(511,280,60,17,"#7d5e50");
 if(food){
  for(const [x,y] of [[120,375],[745,370],[760,490],[110,495]]){
   s+=rect(x-35,y-16,95,64,"#aa784d",'stroke="#6e513c" stroke-width="6"')+
    '<ellipse cx="'+(x+14)+'" cy="'+(y+15)+'" rx="25" ry="18" fill="#f8efdb"/>'+
    '<circle cx="'+(x+14)+'" cy="'+(y+15)+'" r="11" fill="#df985f"/>';
  }
  s+=rect(365,211,56,34,"#5b5c61")+rect(489,211,56,34,"#5b5c61")+
  '<text x="477" y="315" text-anchor="middle" font-size="18" fill="#f8ede2">點餐櫃台</text>';
 }else if(health){
  for(const x of [100,765])for(const y of [357,444])s+=rect(x,y,88,65,"#7ca8b0",'stroke="#4f7778" stroke-width="8"')+rect(x+12,y+12,60,32,"#e3f2ee");
  s+=rect(442,208,42,33,"#fff",'stroke="#96b1ac" stroke-width="5"')+rect(459,214,9,21,"#e78783")+rect(451,220,25,9,"#e78783");
 }else if(beauty){
  for(const x of [104,737]){
   s+=rect(x,317,120,132,"#b5a1bd",'stroke="#755f87" stroke-width="8"')+
    rect(x+19,338,82,64,"#d3ebeb",'stroke="#9989a4" stroke-width="5"')+
    rect(x+34,423,55,44,"#8f758d");
  }
  s+=rect(418,220,85,24,"#d4a9c2")+rect(450,210,20,43,"#f5e4be");
 }else{
  for(const x of [85,745]){
   s+=rect(x,335,138,104,"#956f5b",'stroke="#654e43" stroke-width="6"');
   for(let k=0;k<3;k++)s+=rect(x+13+k*41,349,30,53,pick(["#c8dbc6","#ecbea1","#9fc5d6"],k));
  }
 }
 s+=plant(68,282)+plant(879,270)+plant(64,525)+plant(888,525)+person(618,257,2)+person(260,267,1);
 s+='<circle class="arcade-shop-glow" cx="475" cy="172" r="40" fill="#fff2c0" opacity=".16"/>';
 return s;
}
function renderRoomAvatar(){
 const avatar=$("arcade-room-avatar");
 avatar.style.left=roomPosition.x/960*100+"%";
 avatar.style.top=roomPosition.y/570*100+"%";
}
function walk(direction){
 if(interior.hidden)return;
 const d=33;
 roomPosition.x=Math.min(898,Math.max(62,roomPosition.x+(direction==="left"?-d:direction==="right"?d:0)));
 roomPosition.y=Math.min(514,Math.max(345,roomPosition.y+(direction==="up"?-d:direction==="down"?d:0)));
 renderRoomAvatar();
 const avatar=$("arcade-room-avatar");avatar.classList.add("walking");
 if(avatarTimer)clearTimeout(avatarTimer);
 avatarTimer=setTimeout(()=>avatar.classList.remove("walking"),230);
}
function link(href,label,secondary=false){
 if(!href)return "";
 return '<a class="btn'+(secondary?' secondary':'')+'" href="'+escapeHtml(href)+'">'+label+'</a>';
}
function enterShop(shop){
 if(!shop)return;
 current=shop;roomPosition={x:475,y:449};
 world.hidden=true;interior.hidden=false;
 $("arcade-street-name").textContent=shop.name;
 $("arcade-street-meta").textContent=shopSummary(shop);
 $("arcade-room-art").innerHTML=roomSvg(shop);
 renderRoomAvatar();
 const actions=link(mod(shop,"reservation")?shop.reserve_href:"","立即預約")+
  link(mod(shop,"queue")?shop.queue_href:"","現場取號",true)+
  link(mod(shop,"pickup")?shop.order_href:"","線上點餐",true)+
  link(mod(shop,"queue")&&mod(shop,"calling")?shop.board_href:"","即時叫號看板",true);
 $("arcade-shop-info").innerHTML='<div><strong>'+escapeHtml(shop.name)+'</strong><p>'+
  escapeHtml(shopSummary(shop))+(shop.address?" · "+escapeHtml(shop.address):"")+'</p></div>'+
  '<div class="arcade-panel-actions">'+(actions||'<span>店家目前未開放線上服務</span>')+'</div>';
 $("arcade-room-view").focus({preventScroll:true});
}
listSwitch.addEventListener("click",()=>setView("list"));
gameSwitch.addEventListener("click",()=>setView("game"));
$("arcade-game-categories").addEventListener("change",event=>{category=event.target.value;renderPins()});
pins.addEventListener("click",event=>{
 const button=event.target.closest("[data-shop-slug]");
 if(!button||dragged)return;
 const shop=shops.find(s=>s.slug===button.dataset.shopSlug);
 enterShop(shop);
});
$("arcade-back").addEventListener("click",()=>{
 interior.hidden=true;world.hidden=false;current=null;world.focus({preventScroll:true})
});
$("arcade-zoom-in").addEventListener("click",()=>zoomAt(camera.z*1.22));
$("arcade-zoom-out").addEventListener("click",()=>zoomAt(camera.z/1.22));
$("arcade-zoom-reset").addEventListener("click",fitMap);
world.addEventListener("click",event=>{
 const button=event.target.closest("[data-map-pan]");
 if(!button)return;
 const d=button.dataset.mapPan;
 pan(d==="left"?90:d==="right"?-90:0,d==="up"?90:d==="down"?-90:0);
});
interior.addEventListener("click",event=>{
 const button=event.target.closest("[data-walk]");
 if(button)walk(button.dataset.walk);
});
$("arcade-room-view").addEventListener("click",event=>{
 if(event.target.closest("button,a"))return;
 const box=event.currentTarget.getBoundingClientRect();
 roomPosition.x=Math.max(62,Math.min(898,(event.clientX-box.left)/box.width*960));
 roomPosition.y=Math.max(345,Math.min(514,(event.clientY-box.top)/box.height*570));
 renderRoomAvatar();
});
world.addEventListener("wheel",event=>{
 if(!activeView||!interior.hidden)return;
 event.preventDefault();
 const box=world.getBoundingClientRect();
 zoomAt(camera.z*(event.deltaY<0?1.12:.89),event.clientX-box.left,event.clientY-box.top);
},{passive:false});
world.addEventListener("pointerdown",event=>{
 if(event.target.closest("button,a,select"))return;
 pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
 if(pointers.size===1)dragged=false;
 world.setPointerCapture?.(event.pointerId);
});
world.addEventListener("pointermove",event=>{
 if(!pointers.has(event.pointerId))return;
 const previous=pointers.get(event.pointerId);
 pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
 if(pointers.size===1){
  const dx=event.clientX-previous.x,dy=event.clientY-previous.y;
  if(Math.abs(dx)+Math.abs(dy)>2)dragged=true;
  pan(dx,dy);
 }else if(pointers.size===2){
  const vals=[...pointers.values()];
  const first=vals[0]===pointers.get(event.pointerId)?previous:vals[0];
  const second=vals[1]===pointers.get(event.pointerId)?previous:vals[1];
  const before=Math.hypot(first.x-second.x,first.y-second.y);
  const after=Math.hypot(vals[0].x-vals[1].x,vals[0].y-vals[1].y);
  if(before&&after){
   const box=world.getBoundingClientRect();
   zoomAt(camera.z*after/before,(vals[0].x+vals[1].x)/2-box.left,(vals[0].y+vals[1].y)/2-box.top);
  }
  dragged=true;
 }
});
for(const name of ["pointerup","pointercancel","lostpointercapture"])
 world.addEventListener(name,event=>{pointers.delete(event.pointerId);if(!pointers.size)setTimeout(()=>{dragged=false},80)});
document.addEventListener("keydown",event=>{
 if(!activeView||event.altKey||event.metaKey||event.ctrlKey||event.target.closest("input,textarea,select,[contenteditable]"))return;
 const directions={ArrowLeft:"left",ArrowRight:"right",ArrowUp:"up",ArrowDown:"down"};
 if(directions[event.key]){
  event.preventDefault();
  if(!interior.hidden)walk(directions[event.key]);
  else pan(event.key==="ArrowLeft"?90:event.key==="ArrowRight"?-90:0,event.key==="ArrowUp"?90:event.key==="ArrowDown"?-90:0);
 }
 if(interior.hidden&&["=","+"].includes(event.key)){event.preventDefault();zoomAt(camera.z*1.16)}
 if(interior.hidden&&event.key==="-"){event.preventDefault();zoomAt(camera.z/.16/7.25)}
 if(!interior.hidden&&event.key==="Escape"){event.preventDefault();$("arcade-back").click()}
});
window.addEventListener("resize",()=>{
 if(resizeQueued)return;resizeQueued=true;
 window.requestAnimationFrame(()=>{resizeQueued=false;if(activeView&&interior.hidden)fitMap()});
});
window.LineExploreGame={
 setData({shops:publicShops=[]}={}){
  shops=Array.isArray(publicShops)?publicShops.filter(s=>typeof s?.slug==="string"&&s.slug.length>0):[];
  const values=["全部",...new Set(shops.map(shopCategory))].sort((a,b)=>a==="全部"?-1:b==="全部"?1:a.localeCompare(b,"zh-Hant"));
  const previous=$("arcade-game-categories").value||"全部";
  $("arcade-game-categories").innerHTML=values.map(v=>'<option value="'+escapeHtml(v)+'">'+escapeHtml(v==="全部"?"全部類別":v)+'</option>').join("");
  category=values.includes(previous)?previous:"全部";
  $("arcade-game-categories").value=category;
  if(activeView){initialize();renderPins();fitMap()}
 },
 setView
};
setView(new URLSearchParams(location.search).get("mode")==="game"?"game":"list");
})();