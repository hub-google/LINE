import {authState} from "./state/authState.js";
import {lineState} from "./state/lineState.js";
import {merchantBrandState} from "./state/merchantBrandState.js";
import {routeState} from "./state/routeState.js";



import {authReady,esc,field,showActionFeedback} from "./shared-ui.js";
import {val} from "./data-loading.js";

export function merchantSafeLogoUrl(url){
 const text=String(url||"").trim();
 return /^https:\/\/[^\s<>"']{1,490}$/i.test(text)?text:"";
}


function logoDraftKey(prefix){
 return prefix==="set"?"set:"+String(routeState.slug||""):prefix;
}

function currentLogoDraft(prefix){
 return merchantBrandState.logoDrafts?.get(logoDraftKey(prefix))||null;
}

function setLogoDraft(prefix,kind,file=null){
 const key=logoDraftKey(prefix),old=currentLogoDraft(prefix);
 if(old?.previewUrl)URL.revokeObjectURL(old.previewUrl);
 const draft=kind==="file"?{kind,file,previewUrl:URL.createObjectURL(file)}:{kind:"clear"};
 merchantBrandState.logoDrafts.set(key,draft);
 document.documentElement.dataset.unsavedMerchantLogo="true";
 return draft;
}

export function merchantLogoSaved(prefix){
 const key=logoDraftKey(prefix),old=currentLogoDraft(prefix);
 if(old?.previewUrl)URL.revokeObjectURL(old.previewUrl);
 merchantBrandState.logoDrafts?.delete(key);
 document.documentElement.dataset.unsavedMerchantLogo=merchantBrandState.logoDrafts?.size?"true":"false";
}

export function merchantAccent(hex){
 return /^#[0-9a-f]{6}$/i.test(String(hex||""))?String(hex).toUpperCase():"#523B70";
}

export function merchantBrandContrast(hex){
 const channels=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255)
  .map(n=>n<=.04045?n/12.92:Math.pow((n+.055)/1.055,2.4));
 const luminance=channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
 return luminance>.179?"#000000":"#FFFFFF";
}

export function merchantColorControl(prefix,color){
 const accent=merchantAccent(color);
 return '<div class="merchant-color-editor"><label for="'+prefix+'-accent-picker">品牌顏色</label>'+
  '<div class="merchant-color-row"><input class="merchant-color-picker" type="color" id="'+prefix+'-accent-picker" data-color-picker="'+prefix+'" value="'+accent+'" aria-label="點選調色盤選擇品牌色">'+
  '<span class="merchant-color-hint">點擊色塊開啟調色盤，或直接選下方推薦配色</span></div>'+
  '<div class="merchant-colors" role="group" aria-label="推薦品牌配色">'+merchantBrandState.MERCHANT_PALETTE.map(c=>
   '<button type="button" class="merchant-color-swatch'+(c.toUpperCase()===accent?' selected':'')+'" data-color-preset="'+c+'" data-color-for="'+prefix+'" style="background:'+c+'" aria-label="選擇品牌色 '+c+'" aria-pressed="'+(c.toUpperCase()===accent)+'"></button>').join("")+'</div>'+
  '<input type="hidden" id="'+prefix+'-accent" value="'+accent+'">'+
  '<div class="merchant-color-preview" id="'+prefix+'-brand-preview" style="background:'+accent+';color:'+merchantBrandContrast(accent)+'"><span>品牌色預覽</span><strong>預約・取號・叫號</strong></div></div>';
}

export function merchantLogoControl(prefix,logo){
 const draft=currentLogoDraft(prefix);
 const safe=draft?.kind==="clear"?"":merchantSafeLogoUrl(logo);
 const displayUrl=draft?.kind==="file"?draft.previewUrl:safe;
 const status=draft?.kind==="file"?"已選擇："+draft.file.name+"（尚未儲存）":draft?.kind==="clear"?"儲存企業設定後將移除 LOGO":"";
 return '<div class="merchant-logo-editor"><label for="'+prefix+'-logo-file">店家 LOGO</label>'+
  '<div class="merchant-logo-row"><div class="merchant-logo-frame"><img id="'+prefix+'-logo-preview" src="'+esc(displayUrl)+'" alt="店家 LOGO 預覽" '+(displayUrl?'':'hidden')+'>'+
  '<span id="'+prefix+'-logo-placeholder" '+(displayUrl?'hidden':'')+'>尚未上傳</span></div>'+
  '<div class="merchant-logo-actions"><input class="merchant-logo-file" type="file" id="'+prefix+'-logo-file" data-logo-file="'+prefix+'" accept="image/png,image/jpeg,image/webp" aria-describedby="'+prefix+'-logo-hint">'+
  '<p id="'+prefix+'-logo-hint" class="small">選擇 JPG、PNG 或 WebP 圖片，最大 2 MB；選取後立即預覽，按儲存才會正式上傳。</p>'+
  '<p id="'+prefix+'-logo-selection" class="small" '+(status?'':'hidden')+'>'+esc(status)+'</p>'+
  '<button type="button" class="btn outline merchant-clear-logo" data-logo-clear="'+prefix+'">移除 LOGO</button></div></div>'+
  '<input type="hidden" id="'+prefix+'-logo" value="'+esc(safe)+'"></div>';
}

export function merchantProfileFields(prefix,tenant={}){
 const blank=tenant.onboarding_complete===false;
 const value=(key,fallback="")=>blank?"":(tenant[key]??fallback);
 const accent=merchantAccent(value("accent","#523B70"));
 const category=value("directory_category","其他");
 const slot=value("slot_minutes",30);
 const time=(key,fallback="")=>String(value(key,fallback)||"").slice(0,5);
 return '<div class="merchant-profile">'+
  '<div class="merchant-profile-section"><h3>店家識別與品牌</h3>'+
   merchantLogoControl(prefix,value("logo_url"))+
   '<div class="grid"><div>'+field("企業／店家名稱",prefix+"-name",value("name"),"text",'maxlength="100" autocomplete="organization"')+'</div>'+
   '<div><label for="'+prefix+'-directory-category">店家分類</label><select class="field" id="'+prefix+'-directory-category">'+
   merchantBrandState.MERCHANT_CATEGORIES.map(c=>'<option value="'+esc(c)+'" '+(c===category?'selected':'')+'>'+esc(c)+'</option>').join("")+'</select></div></div>'+
   '<label for="'+prefix+'-description">網站簡介</label><textarea class="field merchant-description" id="'+prefix+'-description" maxlength="500" rows="3" placeholder="讓顧客快速了解店家提供的服務">'+esc(value("description"))+'</textarea>'+
   merchantColorControl(prefix,accent)+'</div>'+
  '<div class="merchant-profile-section"><h3>店家聯絡資訊</h3>'+
   '<div class="grid"><div>'+field("聯絡電話",prefix+"-phone",value("phone"),"tel",'maxlength="40" autocomplete="tel"')+'</div>'+
   '<div>'+field("店家地址",prefix+"-address",value("address"),"text",'maxlength="200" autocomplete="street-address"')+'</div></div></div>'+
  '<div class="merchant-profile-section"><h3>營業與預約設定</h3>'+
   '<div class="grid"><div>'+field("每日開始營業時間",prefix+"-open",time("open_time",prefix==="create"?"10:00":""),"time")+'</div>'+
   '<div>'+field("每日結束營業時間",prefix+"-close",time("close_time",prefix==="create"?"20:00":""),"time")+'</div>'+
   '<div>'+field("每時段最多預約人數",prefix+"-capacity",value("slot_capacity",prefix==="create"?3:""),"number",'min="1" max="100"')+'</div>'+
   '<div><label for="'+prefix+'-minutes">預約時段間隔</label><select class="field" id="'+prefix+'-minutes">'+
   (blank?'<option value="">請選擇</option>':"")+
   [15,30,60].map(m=>'<option value="'+m+'" '+(String(slot)===String(m)?'selected':'')+'>'+m+' 分鐘</option>').join("")+'</select></div></div></div>'+
 '</div>';
}

export function merchantProfilePatch(prefix,previous={}){
 const p={
  name:val(prefix+"-name"),phone:val(prefix+"-phone"),address:val(prefix+"-address"),
  description:val(prefix+"-description"),directory_category:val(prefix+"-directory-category")||"其他",
  accent:val(prefix+"-accent"),logo_url:val(prefix+"-logo"),
  open_time:String(val(prefix+"-open")||previous.open_time||"10:00").slice(0,5),
  close_time:String(val(prefix+"-close")||previous.close_time||"20:00").slice(0,5),
  slot_capacity:Number(val(prefix+"-capacity")||previous.slot_capacity||3),
  slot_minutes:Number(val(prefix+"-minutes")||previous.slot_minutes||30)
 };
 if(p.name.length<2)throw Error("請輸入至少兩個字的店家名稱");
 if(!/^#[0-9a-f]{6}$/i.test(p.accent))throw Error("請選擇品牌顏色");
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(p.open_time)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(p.close_time)||p.close_time<=p.open_time)
  throw Error("營業時間有誤，結束時間必須晚於開始時間");
 if(!Number.isInteger(p.slot_capacity)||p.slot_capacity<1||p.slot_capacity>100)throw Error("每時段人數必須介於 1～100");
 if(![15,30,60].includes(p.slot_minutes))throw Error("請選擇預約時段間隔");
 return p;
}

export function merchantLogoFile(prefix){
 const draft=currentLogoDraft(prefix);
 const file=routeState.$(prefix+"-logo-file")?.files?.[0]||(draft?.kind==="file"?draft.file:null);
 if(!file)return null;
 if(!["image/png","image/jpeg","image/webp"].includes(file.type))throw Error("LOGO 僅支援 JPG、PNG 或 WebP 格式");
 if(file.size<1||file.size>2097152)throw Error("LOGO 圖片不可超過 2 MB");
 return file;
}

export async function merchantUploadLogo(prefix,existingUrl){
 const file=merchantLogoFile(prefix);
 if(!file)return existingUrl;
 if(!authState.session?.user?.id||!authReady())throw Error("上傳 LOGO 前請先登入");
 const ext={"image/png":"png","image/jpeg":"jpg","image/webp":"webp"}[file.type];
 const objectPath=authState.session.user.id+"/"+crypto.randomUUID()+"."+ext;
 const upload=await lineState.supa.storage.from(merchantBrandState.MERCHANT_LOGO_BUCKET).upload(objectPath,file,{
  contentType:file.type,cacheControl:"3600",upsert:false
 });
 if(upload.error)throw Error("LOGO 上傳失敗："+upload.error.message);
 const url=lineState.supa.storage.from(merchantBrandState.MERCHANT_LOGO_BUCKET).getPublicUrl(upload.data.path).data.publicUrl;
 if(!merchantSafeLogoUrl(url))throw Error("無法取得 LOGO 的安全公開網址");
 return url;
}

export function merchantSetAccent(prefix,hex){
 const color=merchantAccent(hex);
 const hidden=routeState.$(prefix+"-accent"),picker=routeState.$(prefix+"-accent-picker"),preview=routeState.$(prefix+"-brand-preview");
 if(hidden)hidden.value=color;
 if(picker)picker.value=color;
 if(preview){preview.style.backgroundColor=color;preview.style.color=merchantBrandContrast(color);}
 document.querySelectorAll('button[data-color-for="'+prefix+'"]').forEach(button=>{
  const active=button.dataset.colorPreset.toUpperCase()===color;
  button.classList.toggle("selected",active);button.setAttribute("aria-pressed",String(active));
 });
}

export function merchantClearLogo(prefix){
 setLogoDraft(prefix,"clear");
 const file=routeState.$(prefix+"-logo-file"),hidden=routeState.$(prefix+"-logo"),preview=routeState.$(prefix+"-logo-preview"),placeholder=routeState.$(prefix+"-logo-placeholder"),status=routeState.$(prefix+"-logo-selection");
 if(file)file.value="";
 if(hidden)hidden.value="";
 if(preview){preview.removeAttribute("src");preview.hidden=true;}
 if(placeholder)placeholder.hidden=false;
 if(status){status.textContent="儲存企業設定後將移除 LOGO";status.hidden=false;}
}

export function initializeMerchantBrand(){
merchantBrandState.MERCHANT_CATEGORIES=["其他","餐飲","美髮","美甲／美容","醫療／診所","健康／按摩","運動","寵物","教育","生活服務"];
merchantBrandState.MERCHANT_PALETTE=["#523B70","#7A4BBD","#147E68","#2777B4","#E47C72","#DE9C28","#243B53","#C3548C","#FF4545","#FF6B57","#FF8A3D","#FFB020","#FFD43B","#FFF176","#B8E63B","#66D95E","#00C48C","#1DD3B0","#27D9E5","#26B8F3","#4DA3FF","#4361EE","#8A5CFF","#B56BFF","#FF5CC8","#FF78AC","#FF9EA8","#FFCFAB","#F5E06A","#A7F3D0","#91E8FF","#C4B5FD"];
merchantBrandState.MERCHANT_LOGO_BUCKET="so-merchant-logos";
merchantBrandState.logoDrafts=new Map();
document.addEventListener("input",event=>{
 const picker=event.target.closest?.("input[data-color-picker]");
 if(picker)merchantSetAccent(picker.dataset.colorPicker,picker.value);
});
document.addEventListener("change",event=>{
 const picker=event.target.closest?.("input[data-color-picker]");
 if(picker){merchantSetAccent(picker.dataset.colorPicker,picker.value);return;}
 const input=event.target.closest?.("input[data-logo-file]");
 if(!input)return;
 const prefix=input.dataset.logoFile,preview=routeState.$(prefix+"-logo-preview"),placeholder=routeState.$(prefix+"-logo-placeholder"),status=routeState.$(prefix+"-logo-selection");
 try{
  const file=merchantLogoFile(prefix);
  if(!file)return;
  const draft=setLogoDraft(prefix,"file",file);
  if(preview){preview.src=draft.previewUrl;preview.hidden=false;}
  if(placeholder)placeholder.hidden=true;
  if(status){status.textContent="已選擇："+file.name+"（尚未儲存）";status.hidden=false;}


 }catch(error){input.value="";showActionFeedback(error.message,"error");}
});
}
