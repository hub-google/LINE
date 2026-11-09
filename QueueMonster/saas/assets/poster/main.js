
const SUPABASE_URL="https://unapiwajmgqqtdkixaab.supabase.co";
const SUPABASE_ANON_KEY="sb_publishable_L09XC4Tekm6cZaPTTczm3g_Aap-SOSy";
const params=new URLSearchParams(location.search),slug=params.get("merchant")||"";
const validSlug=/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug);
const $=id=>document.getElementById(id);
let client,qrFactory,qrMatrix,shopName="",liffId="",target="",ready=false,merchantUsesPlatformOa=true;
let modules={queue:false,reservation:false};
function setStatus(message,error=false){$("status").textContent=message;$("status").dataset.error=String(error);}
function currentMode(){return $("mode").value==="reserve"?"reserve":"queue";}
function targetUrl(mode){
 const qp=new URLSearchParams({view:"customer",merchant:slug,tab:mode});
 // For shared platform OA shops, the QR always points to the shop's
 // HTTPS site; LINE verification runs inside the website when needed.
 if(!merchantUsesPlatformOa&&liffId)return "https://liff.line.me/"+encodeURIComponent(liffId)+"/?"+qp;
 const fallback=new URL("./",location.href);
 fallback.search=qp.toString();
 return fallback.href;
}
function makeQr(url){
 const qr=qrFactory(0,"M");qr.addData(url);qr.make();
 return qr;
}
function qrCanvas(qr,cellSize,quiet=4){
 const n=qr.getModuleCount(),size=(n+2*quiet)*cellSize;
 const canvas=document.createElement("canvas");canvas.width=size;canvas.height=size;
 const ctx=canvas.getContext("2d");
 if(!ctx)throw Error("瀏覽器不支援 QR Code 繪製");
 ctx.fillStyle="#ffffff";ctx.fillRect(0,0,size,size);
 ctx.fillStyle="#000000";
 for(let row=0;row<n;row++){
  for(let col=0;col<n;col++){
   if(qr.isDark(row,col))ctx.fillRect((col+quiet)*cellSize,(row+quiet)*cellSize,cellSize,cellSize);
  }
 }
 return canvas;
}
function updatePoster(){
 if(!ready)return;
 const mode=currentMode();
 const enabled=mode==="reserve"?modules.reservation:modules.queue;
 if(!enabled){
  $("print").disabled=true;$("png").disabled=true;$("copy").disabled=true;
  setStatus("此門市未開放所選服務，不可製作 QR 立牌。",true);
  return;
 }
 target=targetUrl(mode);
 qrMatrix=makeQr(target);
 const preview=qrCanvas(qrMatrix,12);
 $("qr").src=preview.toDataURL("image/png");$("qr").hidden=false;
 $("shop").textContent=shopName;
 $("purpose").textContent=mode==="queue"?"現場取號":"線上預約";
 $("instruction").textContent=mode==="queue"?"掃描開啟本店取號網頁":"掃描開啟本店線上預約";
 $("link").textContent=target;
 $("print").disabled=false;$("png").disabled=false;$("copy").disabled=false;
 setStatus("QR 已依正式門市設定產生。");
 $("channel").textContent=merchantUsesPlatformOa?
 "此門市共用平台 LINE OA：QR 直接開啟門市網頁，首次預約或取號前才要求 LINE 身分驗證。":
 (liffId?"此門市已連接自己的 LINE 官方帳號。":"掃描後將開啟門市的預約或取號網頁。");
}
function splitText(ctx,value,x,y,maxWidth,lineHeight,maxLines){
 const tokens=Array.from(value),lines=[];let current="";
 for(const token of tokens){
  if(ctx.measureText(current+token).width>maxWidth&&current){lines.push(current);current=token;}
  else current+=token;
 }
 if(current)lines.push(current);
 for(const line of lines.slice(0,maxLines)){ctx.fillText(line,x,y);y+=lineHeight;}
 return y;
}
function drawPosterPng(){
 if(!qrMatrix)throw Error("沒有可下載的 QR 立牌");
 const w=2480,h=3508,c=document.createElement("canvas");c.width=w;c.height=h;
 const ctx=c.getContext("2d");if(!ctx)throw Error("瀏覽器無法產生 PNG");
 const center=w/2;
 ctx.fillStyle="#fff";ctx.fillRect(0,0,w,h);
 ctx.textAlign="center";ctx.textBaseline="top";
 ctx.fillStyle="#462B52";ctx.font='bold 82px "Noto Sans TC",sans-serif';ctx.fillText("排隊怪獸",center,320);
 ctx.fillStyle="#462B52";ctx.font='bold 138px "Noto Sans TC",sans-serif';
 let y=splitText(ctx,shopName,center,490,2180,170,3);
 y=Math.max(y,880);
 ctx.font='bold 160px "Noto Sans TC",sans-serif';ctx.fillStyle="#693C8B";
 ctx.fillText(currentMode()==="queue"?"現場取號":"線上預約",center,y+40);
 ctx.font='normal 66px "Noto Sans TC",sans-serif';ctx.fillStyle="#462B52";
 ctx.fillText("掃碼進入本店網頁，驗證 LINE 身分後即可使用",center,y+270);
 const n=qrMatrix.getModuleCount(),px=Math.floor(1550/(n+8));
 const qrSize=(n+8)*px,x=Math.round((w-qrSize)/2),top=Math.max(1260,y+400);
 ctx.fillStyle="#fff";ctx.fillRect(x,top,qrSize,qrSize);
 ctx.fillStyle="#000";
 for(let row=0;row<n;row++)for(let col=0;col<n;col++)
  if(qrMatrix.isDark(row,col))ctx.fillRect(x+(col+4)*px,top+(row+4)*px,px,px);
 ctx.fillStyle="#462B52";ctx.font='bold 82px "Noto Sans TC",sans-serif';
 ctx.fillText(currentMode()==="queue"?"掃描立即取號，查看候位進度":"掃描選擇日期與時間，完成預約",center,top+qrSize+90);
 ctx.font='normal 38px sans-serif';ctx.fillStyle="#785F84";
 splitText(ctx,target,center,top+qrSize+225,2180,48,4);
 ctx.font='normal 47px "Noto Sans TC",sans-serif';
 ctx.fillText("請確認掃描後為正確門市，再進行預約或取號。",center,h-240);
 return c;
}
async function downloadPng(){
 try{
  const canvas=drawPosterPng();
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));
  if(!blob)throw Error("圖片輸出失敗");
  const objectUrl=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=objectUrl;a.download="LINE-"+slug+"-"+currentMode()+"-A4.png";
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
 }catch(error){setStatus("PNG 產生失敗："+String(error?.message||error),true);}
}
async function init(){
 if(!validSlug){setStatus("網址缺少正確的 merchant 門市代碼。",true);$("shop").textContent="未指定門市";return;}
 try{
  const [{createClient},{default:qrcode}]=await Promise.all([
   import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"),
   import("https://cdn.jsdelivr.net/npm/qrcode-generator@2.0.4/dist/qrcode.mjs")
  ]);
  qrFactory=qrcode;
  client=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{
   persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:"line-saas-poster-session-v1"
  }});
  const session=await client.auth.getSession();
  if(session.error)throw session.error;
  if(!session.data.session){const result=await client.auth.signInAnonymously();if(result.error)throw result.error;}
  const {data,error}=await client.rpc("so_public_state",{p_slug:slug});
  if(error)throw error;
  if(!data?.tenant)throw Error("找不到正式門市資訊");
  shopName=String(data.tenant.name||slug);
  modules={queue:!!data.tenant.modules?.queue,reservation:!!data.tenant.modules?.reservation};
  $("shop").textContent=shopName;
  const response=await fetch(SUPABASE_URL+"/functions/v1/line-bridge?action=config&merchant="+encodeURIComponent(slug),{cache:"no-store"}).catch(()=>null);
  if(response?.ok){
   const config=await response.json();
   if(/^\d{8,}-[A-Za-z0-9]+$/.test(String(config?.liffId||"")))liffId=String(config.liffId);
   merchantUsesPlatformOa=config?.merchantOaConnected!==true;
  }
  const desired=params.get("type")==="reserve"?"reserve":"queue";
  $("mode").value=(desired==="queue"&&!modules.queue&&modules.reservation)?"reserve":
     (desired==="reserve"&&!modules.reservation&&modules.queue)?"queue":desired;
  $("mode").disabled=false;
  ready=true;
  updatePoster();
 }catch(error){setStatus("目前無法製作立牌："+String(error?.message||error),true);$("shop").textContent="門市資料讀取失敗";}
}
$("mode").addEventListener("change",updatePoster);
$("print").addEventListener("click",()=>{if(ready&&qrMatrix)window.print();});
$("png").addEventListener("click",()=>{if(ready&&qrMatrix)void downloadPng();});
$("copy").addEventListener("click",async()=>{
 try{await navigator.clipboard.writeText(target);setStatus("已複製目前 QR 對應的連結。");}
 catch(_error){setStatus("無法自動複製，請長按或選取立牌底部網址。",true);}
});
if(validSlug)$("back").href="./?view=staff&merchant="+encodeURIComponent(slug);
void init();
