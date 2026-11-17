// Shared pickup helpers. No second catalogue, pricing source or network service.
export const pickupEntries=cart=>Object.values(cart||{}).filter(x=>x&&Number(x.qty)>0);
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
