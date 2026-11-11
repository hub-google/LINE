import {createStoreLiveSync} from "../../store-live-sync.js";
import {safeMerchantLogoUrl} from "../../shared-customer-links.js";
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from "../../public-config.js";
import {createClient} from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const $=id=>document.getElementById(id);
const slug=new URLSearchParams(location.search).get("merchant")||"";
const valid=/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug);
const client=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
 auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
});
let lastSuccess=null,lastError=false;
const clock=()=>new Intl.DateTimeFormat("zh-TW",{timeZone:"Asia/Taipei",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date());
$("clock").textContent=clock();setInterval(()=>$("clock").textContent=clock(),1000);
const renderList=(node,orders,empty)=>{
 node.replaceChildren();
 if(!orders?.length){const el=document.createElement("p");el.className="empty";el.textContent=empty;node.append(el);return;}
 for(const x of orders){
   const c=document.createElement("div");c.className="num";
   const number=document.createElement("strong");number.textContent=String(x.number||"—");
   const time=document.createElement("small");time.textContent="約定取餐："+String(x.pickup_time||"—");
   c.append(number,time);node.append(c);
 }
};
async function refresh(){
 if(!valid){$("health").textContent="門市網址無效";return;}
 const {data,error}=await client.rpc("so_pickup_public_board",{p_slug:slug});
 if(error){lastError=true;$("health").textContent="資料無法同步，請確認網路連線："+String(error.message||"").slice(0,80);return;}
 lastError=false;lastSuccess=new Date();
 $("shop").textContent=String(data?.store?.name||"門市取餐進度");
 const accent=String(data?.store?.accent||"");
 if(/^#[0-9a-f]{6}$/i.test(accent))document.documentElement.style.setProperty("--accent",accent);
 const logo=safeMerchantLogoUrl(data?.store?.logo_url);
 if(logo){$("logo").src=logo;$("logo").hidden=false}else $("logo").hidden=true;
 renderList($("ready"),data?.ready,"目前沒有可取餐的訂單");
 renderList($("preparing"),data?.preparing,"目前沒有製作中的訂單");
 $("pending").textContent=Number(data?.pending_count||0)>0?"另有 "+Number(data.pending_count)+" 筆待接單，請查看自己的取餐進度":"";
 $("health").textContent="已同步："+clock()+"。本看板不顯示姓名、電話與餐點內容。";
}
let sync=null;
function modeLabel(mode){$("sync-mode").textContent=mode==="realtime"?"訂單變動即時更新":"每 10 秒備援同步";}
if(valid){
 void refresh();
 sync=createStoreLiveSync({client,slug,refresh,onModeChange:modeLabel,fallbackMs:10000,reconcileMs:60000});
 sync.start();
}else {$("shop").textContent="門市網址無效";$("health").textContent="請確認網址中的 merchant 參數";}
$("fullscreen").addEventListener("click",()=>{
 if(document.fullscreenElement)void document.exitFullscreen?.();else void document.documentElement.requestFullscreen?.();
});
