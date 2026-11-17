// Shared pickup helpers. No second catalogue, pricing source or network service.
export const pickupEntries=cart=>Object.values(cart||{}).filter(x=>x&&Number(x.qty)>0);
// Immediate pickup consumes today\x27s inventory, regardless of a previously selected reservation date.
export const pickupCatalogDate=(method,scheduledDay,today)=>method==="immediate"?today:scheduledDay;
export function pickupCartKey(id,options=[]){
  return String(id)+"|"+(options||[]).slice().sort((a,b)=>a.group-b.group||a.choice-b.choice)
    .map(x=>Number(x.group)+":"+Number(x.choice)).join(",");
}
export function pickupChosen(item,options=[]){
  return (options||[]).map(x=>{
    const group=item?.pickup_options?.[Number(x.group)];
    const choice=group?.choices?.[Number(x.choice)];
    return choice?{group:Number(x.group),choice:Number(x.choice),group_name:group.name,choice_name:choice.name,price:Number(choice.price||0)}:null;
  }).filter(Boolean);
}
export function pickupUnitPrice(item,options=[]){
  return Number(item?.price||0)+pickupChosen(item,options).reduce((s,x)=>s+Number(x.price||0),0);
}
export function pickupCartAmount(cart,items=[]){
  const byId=new Map(items.map(x=>[x.id,x]));
  return pickupEntries(cart).reduce((sum,x)=>sum+pickupUnitPrice(byId.get(x.id),x.options)*Number(x.qty),0);
}
export function pickupCartCount(cart){return pickupEntries(cart).reduce((sum,x)=>sum+Number(x.qty),0);}
export function pickupAdd(cart,id,options=[],qty=1){
  const clean=options.map(x=>({group:Number(x.group),choice:Number(x.choice)}))
    .sort((a,b)=>a.group-b.group||a.choice-b.choice);
  const key=pickupCartKey(id,clean);
  const next=Math.min(20,Number(cart[key]?.qty||0)+Number(qty));
  if(next>0)cart[key]={id,qty:next,options:clean};
  return next;
}
export function pickupRemove(cart,id){
  const key=Object.keys(cart||{}).reverse().find(k=>cart[k]?.id===id);
  if(!key)return;
  cart[key].qty-=1;if(cart[key].qty<=0)delete cart[key];
}
export function pickupSpecsLabel(line){
  const names=(line.options||[]).map(o=>o.choice_name||o.name).filter(Boolean);
  return names.length?"（"+names.join("／")+"）":"";
}
// Easy editor format:
// 甜度*：正常=0、半糖=0、無糖=0
// 加料+：珍珠=10、椰果=10
// "*" means required, "+" permits multiple choices.
export function pickupOptionsText(groups=[]){
  return (Array.isArray(groups)?groups:[]).map(g=>{
    return g.name+(g.required?"*":"")+(g.multiple?"+":"")+"："+(g.choices||[])
      .map(c=>c.name+"="+Number(c.price||0)).join("、");
  }).join("\n");
}
export function parsePickupOptions(text){
  const lines=String(text||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(lines.length>10)throw Error("最多可設定 10 組規格");
  return lines.map(line=>{
    const match=line.match(/^(.+?)([*+]{0,2})\s*[：:]\s*(.+)$/);
    if(!match)throw Error("規格格式錯誤，請參考「甜度*：正常=0、半糖=0」");
    const name=match[1].trim();
    const flags=match[2]||"";
    const choices=match[3].split(/[、，,]/).map(part=>{
      const m=part.trim().match(/^(.+?)\s*=\s*(\d+(?:\.\d{1,2})?)$/);
      if(!m)throw Error("選項請寫「名稱=加價」，例如 珍珠=10");
      const price=Number(m[2]);
      if(!m[1].trim()||m[1].trim().length>50||price>10000)throw Error("選項名稱或加價不合法");
      return {name:m[1].trim(),price};
    });
    if(!name||name.length>40||choices.length>20)throw Error("規格名稱太長或選項超過 20 個");
    return {name,required:flags.includes("*"),multiple:flags.includes("+"),choices};
  });
}

// Preserve a group invitation after LINE LIFF returns through ?liff.state=...
// Explicit query values win; do not trust unvalidated invitation identifiers.
export function pickupGroupFromUrl(href){
 const u=new URL(href);
 const direct=u.searchParams.get("group");
 const isUuid=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value||"");
 if(direct!==null)return isUuid(direct)?direct:"";
 const state=u.searchParams.get("liff.state")||"";
 const mark=state.indexOf("?");
 const nested=mark>=0?new URLSearchParams(state.slice(mark+1)).get("group"):"";
 return isUuid(nested)?nested:"";
}
export function pickupGroupShareUrl(href,id){
 const url=new URL(href);
 url.searchParams.set("group",id);
 url.searchParams.set("tab","order");
 return url;
}
export function pickupGroupLeaveUrl(href){
 const url=new URL(href);
 url.searchParams.delete("group");
 const state=url.searchParams.get("liff.state");
 if(state&&state.includes("?")){
  const at=state.indexOf("?");
  const inner=new URLSearchParams(state.slice(at+1));
  inner.delete("group");
  url.searchParams.set("liff.state",state.slice(0,at+1)+inner.toString());
 }
 return url;
}

// Restore only current variants and aggregate available stock across every
// specification of a product. Never silently substitute a renamed choice.
export function pickupRestoreOrder(lines,items=[]){
 const byId=new Map(items.map(x=>[x.id,x]));
 const cart={},used=new Map();
 let skipped=0;
 for(const line of Array.isArray(lines)?lines:[]){
  const item=byId.get(line?.id);
  if(!item){skipped++;continue;}
  const selections=(Array.isArray(line.options)?line.options:[])
    .map(x=>({group:Number(x.group),choice:Number(x.choice)}));
  const resolved=pickupChosen(item,selections);
  const unchanged=resolved.length===selections.length &&
    (line.options||[]).every((x,i)=>!x.group_name&&!x.choice_name||
      ((!x.group_name||x.group_name===resolved[i]?.group_name)&&
       (!x.choice_name||x.choice_name===resolved[i]?.choice_name)));
  const required=(item.pickup_options||[]).every((g,i)=>
    !g.required||selections.some(x=>x.group===i));
  const single=(item.pickup_options||[]).every((g,i)=>g.multiple||
    selections.filter(x=>x.group===i).length<=1);
  const unique=new Set(selections.map(x=>x.group+":"+x.choice)).size===selections.length;
  if(!unchanged||!required||!single||!unique){skipped++;continue;}
  const already=used.get(item.id)||0;
  const available=item.daily_remaining==null?Infinity:
    Math.max(0,Number(item.daily_remaining)-already);
  const requested=Math.max(1,Math.min(20,Number(line.qty)||1));
  const accepted=Math.min(requested,available);
  if(accepted<=0){skipped++;continue;}
  const key=pickupCartKey(item.id,selections);
  const current=cart[key]?.qty||0;
  pickupAdd(cart,item.id,selections,accepted);
  const actual=(cart[key]?.qty||0)-current;
  used.set(item.id,already+actual);
  if(actual<requested)skipped++;
 }
 return {cart,skipped};
}
