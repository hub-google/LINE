import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "./helpers/source-fs.mjs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import vm from "node:vm";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const script=readFileSync(path.join(root,"saas/explore-game.js"),"utf8");
const published=[
 {slug:"sunny-diner",name:"晨光餐廳",address:"台北市大安區仁愛路",category:"餐飲",
  modules:{reservation:true,pickup:true},reserve_href:"./?view=customer&merchant=sunny-diner&tab=reserve",
  order_href:"./?view=customer&merchant=sunny-diner&tab=order"},
 {slug:"golden-studio",name:"金禾工作室",address:"台北市松山區敦化北路",category:"美髮",
  modules:{reservation:true,queue:true,calling:true},reserve_href:"./?view=customer&merchant=golden-studio&tab=reserve",
  queue_href:"./?view=customer&merchant=golden-studio&tab=queue",
  board_href:"./board.html?merchant=golden-studio"}
];
function setup(search="?mode=game"){
 const nodes=new Map(),listeners={};
 function element(id){
  if(nodes.has(id))return nodes.get(id);
  const n={id,hidden:false,value:id==="arcade-game-categories"?"全部":"",innerHTML:"",
   textContent:"",dataset:{},style:{},disabled:false,handlers:{},
   clientWidth:1200,clientHeight:700,classList:{toggle(){},add(){},remove(){}},
   addEventListener(name,fn){this.handlers[name]=fn},
   setAttribute(name,v){this[name]=v},focus(){},remove(){nodes.delete(id)},
   getBoundingClientRect(){return {width:1200,height:700,left:0,top:0}},
   setPointerCapture(){},appendChild(child){nodes.set(child.id,child)}
  };nodes.set(id,n);return n;
 }
 for(const id of ["explore-game","explore-world","explore-street","explore-list",
  "explore-switch-list","explore-switch-game","explore-filters","arcade-region-count",
  "arcade-map-layer","arcade-city-svg","arcade-map-pins","arcade-map-cars",
  "arcade-map-message","arcade-game-categories","arcade-room-art","arcade-room-avatar",
  "arcade-room-view","arcade-street-name","arcade-street-meta","arcade-shop-info",
  "arcade-back","arcade-zoom-in","arcade-zoom-out","arcade-zoom-reset"])element(id);
 const document={body:{dataset:{},style:{}},getElementById(id){return nodes.get(id)||null},
  createElement(){return {id:"",className:"",textContent:"",remove(){}}},
  addEventListener(name,fn){listeners[name]=fn}};
 const window={addEventListener(){},requestAnimationFrame(fn){fn()}};
 const location={search,pathname:"/LINE/booking/directory.html"};
 const history={replaceState(_a,_b,url){this.last=url}};
 vm.runInNewContext(script,{document,window,location,history,URLSearchParams,
  setTimeout,clearTimeout,Math,String,Array,Number,Set,Map},{filename:"explore-game.js",timeout:3000});
 return {nodes,window,document,history,listeners,element};
}

test("game mode shows real public shop pins immediately, without region selection",()=>{
 const x=setup(),api=x.window.LineExploreGame;
 assert.ok(api);
 api.setData({shops:published});
 const pins=x.element("arcade-map-pins").innerHTML;
 assert.match(pins,/晨光餐廳/);
 assert.match(pins,/金禾工作室/);
 assert.doesNotMatch(pins,/線上商圈|data-region|qa-hidden/);
 assert.match(x.element("arcade-region-count").textContent,/2 家公開店家/);
 assert.equal(x.element("explore-world").hidden,false);
 assert.equal(x.element("explore-street").hidden,true);
 assert.match(x.element("arcade-city-svg").innerHTML,/qm-road/);
});
test("clicking a live shop enters its animated themed room with actual service links",()=>{
 const x=setup();x.window.LineExploreGame.setData({shops:published});
 x.element("arcade-map-pins").handlers.click({target:{closest:()=>({dataset:{shopSlug:"sunny-diner"}})}});
 assert.equal(x.element("explore-world").hidden,true);
 assert.equal(x.element("explore-street").hidden,false);
 assert.match(x.element("arcade-room-art").innerHTML,/點餐櫃台/);
 assert.match(x.element("arcade-shop-info").innerHTML,/立即預約/);
 assert.match(x.element("arcade-shop-info").innerHTML,/線上點餐/);
 assert.match(x.element("arcade-shop-info").innerHTML,/sunny-diner/);
 const before=x.element("arcade-room-avatar").style.left;
 x.listeners.keydown({key:"ArrowRight",target:{closest:()=>null},preventDefault(){}});
 assert.notEqual(x.element("arcade-room-avatar").style.left,before);
 x.element("arcade-back").handlers.click();
 assert.equal(x.element("explore-world").hidden,false);
});
test("category filter only changes actual shop pins; list mode remains available",()=>{
 const x=setup("?mode=search"),api=x.window.LineExploreGame;
 api.setData({shops:published});
 assert.equal(x.element("explore-game").hidden,true);
 x.element("explore-switch-game").handlers.click();
 assert.equal(x.element("explore-game").hidden,false);
 assert.equal(x.element("explore-list").hidden,true);
 x.element("arcade-game-categories").value="美髮";
 x.element("arcade-game-categories").handlers.change({target:{value:"美髮"}});
 assert.doesNotMatch(x.element("arcade-map-pins").innerHTML,/晨光餐廳/);
 assert.match(x.element("arcade-map-pins").innerHTML,/金禾工作室/);
 x.element("explore-switch-list").handlers.click();
 assert.equal(x.element("explore-list").hidden,false);
 assert.match(x.history.last,/mode=search/);
});
test("only passed public store data appear; merchant names are HTML-escaped",()=>{
 const x=setup(),api=x.window.LineExploreGame;
 api.setData({shops:[],demoShops:published});
 assert.doesNotMatch(x.element("arcade-map-pins").innerHTML,/晨光餐廳/);
 api.setData({shops:[{...published[0],name:"<script>"}]});
 assert.match(x.element("arcade-map-pins").innerHTML,/&lt;script&gt;/);
 assert.doesNotMatch(x.element("arcade-map-pins").innerHTML,/<script>/);
});