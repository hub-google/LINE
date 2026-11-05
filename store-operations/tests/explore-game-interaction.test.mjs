import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
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
const demo=[
 {slug:"demo-clinic",name:"澄心健康服務中心（測試門市）",demo:true,
  category:"醫療／診所",modules:{reservation:true},reserve_href:"./?view=customer&merchant=demo-clinic&tab=reserve",
  board_href:"./board.html?merchant=demo-clinic"},
 {slug:"greenfield-salon",name:"青禾風格美髮（測試門市）",demo:true,
  category:"美髮",modules:{reservation:true,queue:true,calling:true},reserve_href:"./?view=customer&merchant=greenfield-salon&tab=reserve",
  queue_href:"./?view=customer&merchant=greenfield-salon&tab=queue",
  board_href:"./board.html?merchant=greenfield-salon"}
];
test("game mode shows only real data with explicit test neighborhood and actionable doors",()=>{
 const x=setup();
 const api=x.window.LineExploreGame;
 assert.ok(api);
 api.setData({shops:[],demoShops:demo});
 assert.match(x.element("arcade-regions").innerHTML,/測試商圈/);
 assert.match(x.element("arcade-regions").innerHTML,/2 家/);
 assert.match(x.element("arcade-region-count").textContent,/0 家公開店家/);
 const regionButton={dataset:{region:"測試商圈"}};
 x.element("arcade-regions").handlers.click({target:{closest(){return regionButton}}});
 assert.equal(x.element("explore-world").hidden,true);
 assert.equal(x.element("explore-street").hidden,false);
 const street=x.element("arcade-shopline").innerHTML;
 assert.match(street,/demo-clinic|澄心健康服務中心/);
 assert.match(street,/青禾風格美髮/);
 assert.match(x.element("arcade-shop-info").innerHTML,/立即預約/);
 assert.match(x.element("arcade-shop-info").innerHTML,/示範門市/);
 assert.match(x.element("arcade-open-shop").dataset.href,/demo-clinic/);
 x.element("arcade-next").handlers.click();
 assert.match(x.element("arcade-open-shop").dataset.href,/greenfield-salon/);
 x.element("arcade-open-shop").handlers.click();
 assert.match(x.location.assigned,/greenfield-salon/);
 x.element("arcade-back").handlers.click();
 assert.equal(x.element("explore-world").hidden,false);
});
test("view switch retains working list navigation and filters game categories",()=>{
 const x=setup("?mode=search");
 const api=x.window.LineExploreGame;
 api.setData({shops:[],demoShops:demo});
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
