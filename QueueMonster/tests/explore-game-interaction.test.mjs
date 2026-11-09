import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "./helpers/source-fs.mjs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import vm from "node:vm";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const script=readFileSync(path.join(root,"saas/explore-game.js"),"utf8");

function setup(search="?mode=game"){
 const nodes=new Map(),listeners={};
 function element(id){
  if(nodes.has(id))return nodes.get(id);
  const e={id,hidden:false,value:id==="arcade-game-categories"?"全部":"",innerHTML:"",textContent:"",
   dataset:{},style:{},disabled:false,handlers:{},classList:{toggle(){},add(){},remove(){}},
   addEventListener(name,fn){this.handlers[name]=fn},
   setAttribute(name,value){this[name]=value},
   scrollIntoView(){},
   querySelectorAll(selector){
    if(id==="arcade-shopline"&&selector==="[data-shop-index]"){
     return Array.from(this.innerHTML.matchAll(/data-shop-index="(\d+)"/g),(m,i)=>({
      dataset:{shopIndex:m[1],selected:"false"},offsetLeft:i*184,offsetWidth:166,
      scrollIntoView(){} 
     }));
    }
    return [];
   }
  };
  nodes.set(id,e);return e;
 }
 for(const id of ["explore-game","explore-world","explore-street","explore-list","explore-switch-list",
  "explore-switch-game","explore-filters","explore-game-note","arcade-region-count","arcade-regions",
  "arcade-shopline","arcade-avatar","arcade-street-name","arcade-street-meta","arcade-shop-info",
  "arcade-previous","arcade-next","arcade-open-shop","arcade-back","arcade-game-categories"])element(id);
 const document={getElementById:element,addEventListener(k,fn){listeners[k]=fn}};
 const window={};
 const location={search,pathname:"/LINE/booking/directory.html",assigned:null,assign(url){this.assigned=url}};
 const history={replaceState(_a,_b,url){this.last=url}};
 vm.runInNewContext(script,{document,window,location,history,URLSearchParams,String,Math,Array,Number,Set},{
  filename:"explore-game.js",timeout:1500
 });
 return {nodes,document,window,location,history,element};
}
const published=[
 {slug:"sunny-diner",name:"晨光餐廳",address:"台北市大安區仁愛路",category:"餐飲",
  modules:{reservation:true},reserve_href:"./?view=customer&merchant=sunny-diner&tab=reserve",
  board_href:"./board.html?merchant=sunny-diner"},
 {slug:"golden-studio",name:"金禾工作室",address:"台北市松山區敦化北路",category:"美髮",
  modules:{reservation:true,queue:true,calling:true},reserve_href:"./?view=customer&merchant=golden-studio&tab=reserve",
  queue_href:"./?view=customer&merchant=golden-studio&tab=queue",
  board_href:"./board.html?merchant=golden-studio"}
];
test("game mode shows only published merchants and keeps all shops actionable",()=>{
 const x=setup();
 const api=x.window.LineExploreGame;
 assert.ok(api);
 api.setData({shops:published,demoShops:[{slug:"qa-hidden",name:"內部門市",demo:true}]});
 assert.match(x.element("arcade-regions").innerHTML,/台北市/);
 assert.match(x.element("arcade-regions").innerHTML,/2 家/);
 assert.match(x.element("arcade-region-count").textContent,/2 家公開店家/);
 assert.doesNotMatch(x.element("arcade-regions").innerHTML,/驗證商圈|qa-hidden/);
 const regionButton={dataset:{region:"台北市"}};
 x.element("arcade-regions").handlers.click({target:{closest(){return regionButton}}});
 assert.equal(x.element("explore-world").hidden,true);
 assert.equal(x.element("explore-street").hidden,false);
 const street=x.element("arcade-shopline").innerHTML;
 assert.match(street,/晨光餐廳/);
 assert.match(street,/金禾工作室/);
 assert.match(x.element("arcade-shop-info").innerHTML,/立即預約/);
 assert.doesNotMatch(x.element("arcade-shop-info").innerHTML,/示範門市/);
 assert.match(x.element("arcade-open-shop").dataset.href,/sunny-diner/);
 x.element("arcade-next").handlers.click();
 assert.match(x.element("arcade-open-shop").dataset.href,/golden-studio/);
 x.element("arcade-open-shop").handlers.click();
 assert.match(x.location.assigned,/golden-studio/);
 x.element("arcade-back").handlers.click();
 assert.equal(x.element("explore-world").hidden,false);
 api.setData({shops:[],demoShops:published});
 assert.equal(x.element("arcade-regions").innerHTML.includes("台北市"),false,"old sample fallback must stay disabled");
});
test("view switch retains working list navigation and filters game categories",()=>{
 const x=setup("?mode=search");
 const api=x.window.LineExploreGame;
 api.setData({shops:published});
 assert.equal(x.element("explore-game").hidden,true);
 x.element("explore-switch-game").handlers.click();
 assert.equal(x.element("explore-game").hidden,false);
 assert.equal(x.element("explore-list").hidden,true);
 x.element("arcade-game-categories").value="美髮";
 x.element("arcade-game-categories").handlers.change({target:{value:"美髮"}});
 assert.match(x.element("arcade-regions").innerHTML,/1 家/);
 x.element("explore-switch-list").handlers.click();
 assert.equal(x.element("explore-list").hidden,false);
 assert.match(x.history.last,/mode=search/);
});
