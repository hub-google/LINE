(function(){
'use strict';
const C=window.CHANCE_APP;
if(!C){document.body.textContent='Configuration missing';return;}
const q=id=>document.getElementById(id),nf=new Intl.NumberFormat('zh-TW',{maximumFractionDigits:2}),today=()=>new Date().toISOString().slice(0,10);
const num=(r,k)=>{const v=Number(r[k]);return Number.isFinite(v)?v:0},money=n=>'NT$ '+nf.format(Math.round(n)),digits=n=>nf.format(Math.round(n*100)/100);
const days=date=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return NaN;const t=new Date(date+'T12:00:00');const now=new Date();now.setHours(12,0,0,0);return Math.round((t-now)/86400000)};
const addDays=(d,n)=>{const v=new Date(d+'T12:00:00');if(!Number.isFinite(v.getTime()))return '';v.setDate(v.getDate()+n);return v.getFullYear()+'-'+String(v.getMonth()+1).padStart(2,'0')+'-'+String(v.getDate()).padStart(2,'0')};
const flat=(v)=>String(v??''),text=(tag,content,cls)=>{const el=document.createElement(tag);el.textContent=flat(content);if(cls)el.className=cls;return el};
const fieldOf=k=>C.fields.find(f=>f[0]===k);
function compute(r,all){
 let a=0,b=0,flag='good',label='正常',detail='';
 const red=(name)=>{flag='bad';label=name};
 const yellow=name=>{if(flag!=='bad'){flag='warn';label=name}};
 const due=(date,warningDays=7)=>{let d=days(date);if(Number.isFinite(d)){if(d<0)red('已逾期');else if(d<=warningDays)yellow('即將到期')}};
 switch(C.kind){
 case 'invoice': a=Math.max(0,num(r,'amount')-num(r,'paid'));b=num(r,'amount');detail='未收 '+money(a);if(a>0&&r.status!=='已取消')due(r.due);if(a===0)label='已收齊';if(r.status==='已取消'){label='已取消';flag='warn'}break;
 case 'orders': a=Math.max(0,num(r,'total')-num(r,'paid'));b=num(r,'total');detail='待收 '+money(a);if(a===0&&r.approved==='是'){label='可交付'}else{label='暫不可交付';flag='warn';if(a>0)due(r.due)}break;
 case 'inventory': {const available=num(r,'stock')-num(r,'reserved'),per=num(r,'perCase');a=available;b=num(r,'stock');detail='可售整箱 '+(per>0?Math.floor(Math.max(0,available)/per):'—')+' 箱';if(per<=0||available<0)red('換算異常');else if(available<=num(r,'threshold'))yellow('低庫存');break;}
 case 'saas': {const waste=Math.max(0,num(r,'seats')-num(r,'active'))*num(r,'price');a=waste;b=num(r,'seats')*num(r,'price');detail='閒置月費 '+money(waste);if(num(r,'active')>num(r,'seats'))red('席次錯誤');else if(waste>0)yellow('閒置席次');due(r.renew,num(r,'notice'));break;}
 case 'filter':{const next=addDays(r.last,num(r,'interval'));a=Number.isFinite(days(next))?days(next):0;b=1;detail='下次保養 '+(next||'未設定');if(num(r,'interval')<=0)red('週期錯誤');else due(next);break;}
 case 'chargeback':{const keys=['invoice','delivery','communication','policy'];const done=keys.filter(k=>r[k]==='已整理').length;a=done/4*100;b=num(r,'amount');detail='已整理 '+done+'/4 項 ('+digits(a)+'%)';if(done===4)label='材料齊備（待覆核）';else yellow('證據未齊');due(r.due);break;}
 case 'contract':{const subset=all.filter(x=>flat(x.contract)===flat(r.contract));const cap=Math.max(0,...subset.map(x=>num(x,'cap'))),used=subset.reduce((sum,x)=>sum+num(x,'spent')+num(x,'pending'),0);a=cap-used;b=cap;detail='合約剩餘 '+money(a);if(a<0)red('超出額度');else if(cap>0&&a/cap<=.1)yellow('額度不足');if(r.status!=='已完成')due(r.due);break;}
 case 'shortstay': {const gross=num(r,'nights')*num(r,'rate')+num(r,'cleanCharge');const fee=Math.min(100,Math.max(0,num(r,'fee')));a=gross*(1-fee/100)-num(r,'cleanCost')-num(r,'other');b=gross;detail='每晚淨收益 '+money(num(r,'nights')>0?a/num(r,'nights'):0);if(a<0)red('虧損');else if(num(r,'nights')<=0)red('晚數錯誤');break;}
 case 'parking': {const revenue=num(r,'spots')*num(r,'rate')*num(r,'hours')*(num(r,'occupancy')/100)*30;a=revenue-num(r,'rent')-num(r,'ops')-num(r,'royalty')/12;b=num(r,'invest')>0?a*12/num(r,'invest')*100:0;detail='年化投資報酬 '+digits(b)+'%（假設）';if(num(r,'occupancy')>100||num(r,'hours')>24)red('輸入異常');else if(a<0)red('月虧損');break;}
 case 'laundry': {const revenue=num(r,'washCount')*num(r,'washPrice')+num(r,'dryCount')*num(r,'dryPrice');a=revenue-num(r,'rent')-num(r,'utility')-num(r,'repair');b=a>0?num(r,'buy')/a:0;const depreciation=num(r,'life')>0?num(r,'buy')/(num(r,'life')*12):0;detail='回本 '+(a>0?digits(b)+' 個月':'無法回本')+'；折舊後月利 '+money(a-depreciation);if(a<=0)red('現金流為負');break;}
 }
 return{a,b,flag,label,detail};
}
const key='chance-products:'+C.slug+':v1';let rows=[];try{const got=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(got))rows=got.filter(x=>x&&typeof x==='object').slice(0,5000)}catch(e){}
let activeId=null,term='';
function persist(){try{localStorage.setItem(key,JSON.stringify(rows));return true}catch(e){toast('無法儲存，請確認瀏覽器容量或隱私模式');return false}}
function toast(msg){q('toast').textContent=msg;q('toast').classList.add('visible');setTimeout(()=>q('toast').classList.remove('visible'),4000)}
function recalc(){const c=rows.map(r=>compute(r,rows));const total=c.reduce((s,v)=>s+v.a,0),danger=c.filter(v=>v.flag!=='good').length;
[['metric-count',nf.format(rows.length)],['metric-primary',C.kind==='chargeback'?digits(rows.length?total/rows.length:0)+'%':C.kind==='filter'?nf.format(c.filter(v=>v.flag==='bad').length)+' 台':C.kind==='inventory'?nf.format(total)+' 包':(C.kind==='parking'?'NT$ ':C.kind==='laundry'?'NT$ ':'NT$ ')+nf.format(Math.round(total))],['metric-alert',nf.format(danger)],['metric-storage','本機瀏覽器']].forEach(([id,value])=>q(id).textContent=value);
q('primary-caption').textContent=C.kind==='chargeback'?'平均證據完成率':C.kind==='filter'?'逾期設備數':C.kind==='inventory'?'可售單包合計':C.kind==='saas'?'每月閒置成本':C.kind==='orders'?'未收尾款合計':C.kind==='invoice'?'待收款合計':C.kind==='contract'?'各派工重複計算的剩餘額度＊':C.kind==='parking'?'各標的月淨利總計':C.kind==='laundry'?'各標的月現金流合計':'訂單淨收益合計';
 if(C.kind==='contract'){const by=new Map();rows.forEach(r=>{if(!by.has(r.contract))by.set(r.contract,1)});const totalContract=[...by.keys()].reduce((sum,contract)=>{const arr=rows.filter(r=>r.contract===contract);return sum+Math.max(0,...arr.map(r=>num(r,'cap')))-arr.reduce((s,r)=>s+num(r,'spent')+num(r,'pending'),0)},0);q('metric-primary').textContent=money(totalContract);q('primary-caption').textContent='全部契約剩餘額合計';}
 const wrap=q('records');wrap.replaceChildren();const show=rows.filter(r=>C.fields.some(f=>flat(r[f[0]]).toLowerCase().includes(term)));q('result-count').textContent='顯示 '+show.length+' / '+rows.length+' 筆';
 if(!show.length){wrap.append(text('div',rows.length?'找不到符合條件的資料':'尚無資料。點擊「新增紀錄」開始使用。','empty'));return}
 const table=document.createElement('table'),thead=document.createElement('thead'),head=document.createElement('tr');
 [...C.fields.slice(0,3).map(f=>f[1]),'計算結果','狀態','操作'].forEach(h=>head.append(text('th',h)));thead.append(head);table.append(thead);
 const tb=document.createElement('tbody');
 show.forEach(r=>{const result=compute(r,rows),tr=document.createElement('tr');
 C.fields.slice(0,3).forEach(f=>tr.append(text('td',f[2]==='number'?nf.format(num(r,f[0])):r[f[0]])));
 tr.append(text('td',result.detail));const state=document.createElement('td');state.append(text('span',result.label,'pill '+result.flag));tr.append(state);
 const ops=document.createElement('td');ops.className='actions';
 [['編輯','edit'],['刪除','delete']].forEach(([label,action])=>{const btn=text('button',label,'btn'+(action==='delete'?' danger':''));btn.type='button';btn.dataset.id=r._id;btn.dataset.action=action;ops.append(btn)});tr.append(ops);tb.append(tr)});
 table.append(tb);wrap.append(table);
}
function openEditor(id){const r=rows.find(v=>v._id===id)||{};activeId=id||null;q('form-title').textContent=id?'編輯紀錄':'新增紀錄';const body=q('fields');body.replaceChildren();
 C.fields.forEach(([k,label,kind,options])=>{const wrap=document.createElement('div');wrap.className='field';const lab=text('label',label);lab.htmlFor='field-'+k;wrap.append(lab);let control;if(kind==='select'){control=document.createElement('select');(options||'').split('|').forEach(o=>{let op=document.createElement('option');op.textContent=o;op.value=o;control.append(op)})}else{control=document.createElement('input');control.type=kind==='number'?'number':kind==='date'?'date':'text';if(kind==='number'){control.step='any';control.min='0'}else if(kind==='text'){control.maxLength=140}}
 control.id='field-'+k;control.name=k;control.required=true;control.value=r[k]??(kind==='number'?'0':kind==='select'?(options||'').split('|')[0]:'');wrap.append(control);body.append(wrap)});
 q('dialog').showModal();const first=body.querySelector('input,select');if(first)first.focus();
}
function clean(raw){const out={};C.fields.forEach(([k,,kind,opts])=>{let v=raw[k];if(kind==='number'){v=Number(v);v=Number.isFinite(v)?Math.max(0,Math.min(v,1e12)):0}else if(kind==='select'){v=(opts||'').split('|').includes(v)?v:(opts||'').split('|')[0]}else if(kind==='date'){v=/^\d{4}-\d{2}-\d{2}$/.test(v||'')?v:''}else{v=flat(v).trim().slice(0,140)}out[k]=v});return out}
q('record-form').addEventListener('submit',e=>{e.preventDefault();const raw=Object.fromEntries(new FormData(e.target).entries());const cleaned=clean(raw);if(!cleaned[C.fields[0][0]]){toast('請填寫第一欄');return}
 if(activeId){const i=rows.findIndex(r=>r._id===activeId);if(i>=0)rows[i]={...rows[i],...cleaned,_updated:new Date().toISOString()}}else{rows.unshift({_id:(globalThis.crypto&&crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random()),_updated:new Date().toISOString(),...cleaned})}
 persist();q('dialog').close();recalc();toast('已儲存');});
q('records').addEventListener('click',e=>{const btn=e.target.closest('button[data-action]');if(!btn)return;if(btn.dataset.action==='edit')openEditor(btn.dataset.id);else if(confirm('確定刪除這筆資料？刪除後需使用備份才能復原。')){rows=rows.filter(r=>r._id!==btn.dataset.id);persist();recalc()}});
q('add').addEventListener('click',()=>openEditor(null));q('cancel').addEventListener('click',()=>q('dialog').close());q('search').addEventListener('input',e=>{term=e.target.value.trim().toLowerCase();recalc()});
function download(filename,str,type){const url=URL.createObjectURL(new Blob([str],{type}));const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000)}
function csvCell(v){const s=flat(v);return '"'+s.replace(/"/g,'""')+'"'}
q('export-csv').addEventListener('click',()=>{const header=[...C.fields.map(f=>f[1]),'計算結果','狀態'];const data=rows.map(r=>{const calc=compute(r,rows);return[...C.fields.map(f=>r[f[0]]),calc.detail,calc.label]});download(C.slug+'-'+today()+'.csv','\ufeff'+[header,...data].map(arr=>arr.map(csvCell).join(',')).join('\r\n'),'text/csv;charset=utf-8');});
q('backup').addEventListener('click',()=>download(C.slug+'-backup-'+today()+'.json',JSON.stringify({schema:1,app:C.slug,exportedAt:new Date().toISOString(),records:rows},null,2),'application/json'));
q('restore').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>5e6)throw Error('檔案太大');const obj=JSON.parse(await file.text());if(obj.app!==C.slug||!Array.isArray(obj.records)||obj.records.length>5000)throw Error('備份格式或產品不符');if(!confirm('匯入將取代本產品目前的 '+rows.length+' 筆紀錄，確定嗎？'))return;rows=obj.records.map((x,i)=>({...clean(x),_id:flat(x._id||i),_updated:flat(x._updated||new Date().toISOString())}));persist();recalc();toast('已還原 '+rows.length+' 筆紀錄')}catch(err){toast('匯入失敗：'+err.message)}finally{e.target.value=''}});
q('print').addEventListener('click',()=>window.print());
q('app-title').textContent=C.name;document.title=C.name+'｜Chance';q('app-lead').textContent=C.pain;q('app-source').textContent='來源編號 '+C.id+'｜建議售價 '+C.price+'，並非實際收費';q('app-description').textContent=C.scope;
window.ChanceLocal=Object.freeze({
  slug:C.slug,
  read:()=>JSON.parse(JSON.stringify(rows)),
  count:()=>rows.length,
  replace:incoming=>{
    if(!Array.isArray(incoming)||incoming.length>5000)return false;
    const updated=incoming.map((x,i)=>({...clean(x),_id:flat(x._id||('import-'+i)).slice(0,150),_updated:flat(x._updated||new Date().toISOString()).slice(0,60)}));
    const prior=rows;rows=updated;
    if(!persist()){rows=prior;return false}
    recalc();return true;
  }
});
const cloudScript=document.createElement('script');cloudScript.src='../assets/cloud.js';cloudScript.defer=true;document.head.append(cloudScript);
recalc();
})();