// LINE Workforce messaging gateway: only existing verified employee identities.
// Separate from store-operations / line-bridge. Never accepts arbitrary LINE user IDs
// as push targets. Requires the employee's Supabase JWT for all writes and sends.
const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const ANON_KEY=Deno.env.get("SUPABASE_ANON_KEY")||"";
const LINE_LOGIN_ID=Deno.env.get("LINE_LOGIN_CHANNEL_ID")||
 (Deno.env.get("LINE_LIFF_ID")||"").split("-")[0];
const LIFF_ID=Deno.env.get("LINE_LIFF_ID")||"";
const PLATFORM_TOKEN=Deno.env.get("LINE_MESSAGING_ACCESS_TOKEN")||"";
const WEBSITE="https://hub-google.github.io";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function respond(status:number,data:unknown,origin:string|null=null){
 const h:Record<string,string>={"Content-Type":"application/json","Cache-Control":"no-store",
   "Vary":"Origin","Access-Control-Allow-Headers":"authorization, apikey, content-type",
   "Access-Control-Allow-Methods":"GET, POST, OPTIONS"};
 if(origin===WEBSITE)h["Access-Control-Allow-Origin"]=WEBSITE;
 return new Response(JSON.stringify(data),{status,headers:h});
}
function message(e:unknown){return e instanceof Error?e.message:"UNKNOWN";}
async function db(path:string,method="GET",body?:unknown){
 if(!SUPABASE_URL||!SERVICE_KEY)throw new Error("SUPABASE_BACKEND_NOT_CONFIGURED");
 const response=await fetch(SUPABASE_URL+"/rest/v1/"+path,{
  method,headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,
   "Content-Type":"application/json",Prefer:path.startsWith("wm_line_links?on_conflict=")?"resolution=merge-duplicates,return=representation":"return=representation"},
  body:body===undefined?undefined:JSON.stringify(body)});
 const out=await response.json().catch(()=>null);
 if(!response.ok)throw new Error("SUPABASE_"+response.status+"_"+(out?.code||"ERROR"));
 return out;
}
async function getUser(req:Request){
 const auth=req.headers.get("authorization")||"";
 if(!auth.startsWith("Bearer ")||!ANON_KEY)throw new Error("AUTH_REQUIRED");
 const result=await fetch(SUPABASE_URL+"/auth/v1/user",{
   headers:{apikey:ANON_KEY,Authorization:auth}});
 if(!result.ok)throw new Error("LOGIN_EXPIRED");
 const data=await result.json();
 if(!uuid.test(data?.id||""))throw new Error("INVALID_USER");
 return data.id as string;
}
async function member(tenant:string,userId:string){
 if(!uuid.test(tenant))throw new Error("INVALID_TENANT");
 const rows=await db("wm_members?select=id,tenant_id,user_id,role,status&tenant_id=eq."+
   encodeURIComponent(tenant)+"&user_id=eq."+encodeURIComponent(userId)+"&limit=1");
 const m=rows?.[0];
 if(!m||m.status!=="active")throw new Error("NO_ACTIVE_MEMBERSHIP");
 const ts=await db("wm_tenants?select=is_demo&id=eq."+encodeURIComponent(tenant)+"&limit=1");
 if(!ts?.length||ts[0].is_demo)throw new Error("DEMO_NOT_ELIGIBLE_FOR_LINE");
 return m;
}
async function lineValidate(token:string){
 if(!LINE_LOGIN_ID||!/^[0-9]{8,}$/.test(LINE_LOGIN_ID))throw new Error("LINE_LOGIN_CHANNEL_NOT_CONFIGURED");
 if(!token||token.length>5000)throw new Error("MISSING_LINE_ID_TOKEN");
 const result=await fetch("https://api.line.me/oauth2/v2.1/verify",{
  method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
  body:new URLSearchParams({id_token:token,client_id:LINE_LOGIN_ID})});
 if(!result.ok)throw new Error("LINE_ID_TOKEN_INVALID");
 const line=await result.json();
 if(line.aud!==LINE_LOGIN_ID||!/^U[0-9a-f]{32}$/i.test(line.sub||"")
   ||Number(line.exp||0)*1000<=Date.now())throw new Error("LINE_IDENTITY_INVALID");
 return String(line.sub);
}
Deno.serve(async req=>{
 const origin=req.headers.get("origin");
 if(origin&&origin!==WEBSITE)return respond(403,{error:"ORIGIN_DENIED"});
 if(req.method==="OPTIONS")return respond(200,{},origin);
 if(req.method==="GET")return respond(200,{
  liffId:LIFF_ID||null,loginConfigured:!!LINE_LOGIN_ID,
  messagingConfigured:!!PLATFORM_TOKEN,mode:"platform"},origin);
 if(req.method!=="POST")return respond(405,{error:"METHOD_NOT_ALLOWED"},origin);
 try{
  const actor=await getUser(req);
  const input=await req.json();
  const action=String(input?.action||"");
  const tenant=String(input?.tenant_id||"");
  const m=await member(tenant,actor);
  if(action==="status"){
   const rows=await db("wm_line_links?select=id,verified_at,mode&tenant_id=eq."+
    encodeURIComponent(tenant)+"&member_id=eq."+encodeURIComponent(m.id)+
    "&revoked_at=is.null&limit=1");
   return respond(200,{linked:!!rows?.length,verifiedAt:rows?.[0]?.verified_at||null,
    mode:rows?.[0]?.mode||"platform",messagingConfigured:!!PLATFORM_TOKEN,
    liffId:LIFF_ID||null},origin);
  }
  if(action==="bind"){
   const sub=await lineValidate(String(input.id_token||""));
   // The Supabase user must first authenticate and be an existing, active member.
   await db("wm_line_links?on_conflict=tenant_id,member_id","POST",[
    {tenant_id:tenant,member_id:m.id,user_id:actor,line_sub:sub,
      login_channel_id:LINE_LOGIN_ID,mode:"platform",revoked_at:null,
      verified_at:new Date().toISOString()}]);
   return respond(200,{linked:true,mode:"platform"},origin);
  }
  if(action==="unbind"){
   await db("wm_line_links?tenant_id=eq."+encodeURIComponent(tenant)+
    "&member_id=eq."+encodeURIComponent(m.id),"PATCH",{revoked_at:new Date().toISOString()});
   return respond(200,{linked:false},origin);
  }
  if(action==="flush"){
   if(!["owner","hr"].includes(m.role))throw new Error("MANAGER_PERMISSION_REQUIRED");
   if(!PLATFORM_TOKEN)return respond(503,{error:"LINE_MESSAGING_NOT_CONFIGURED"},origin);
   const claimed=await db("rpc/wm_line_claim","POST",{p_tenant:tenant,p_limit:Math.min(10,Math.max(1,Number(input.limit)||5))});
   const results:Record<string,unknown>[]=[];
   for(const job of claimed||[]){
    let ok=false,reason="";
    try{
     const out=await fetch("https://api.line.me/v2/bot/message/push",{
      method:"POST",headers:{"Content-Type":"application/json",
       Authorization:"Bearer "+PLATFORM_TOKEN,"X-Line-Retry-Key":job.id},
      body:JSON.stringify({to:job.line_sub,messages:[{type:"text",
       text:(String(job.title)+"\n"+String(job.body||"")).slice(0,4500)}]})});
     ok=out.ok;reason=ok?"":("LINE_HTTP_"+out.status);
    }catch{reason="LINE_NETWORK_ERROR";}
    // Always record the outcome, and only retry non-successful events (3 attempts max).
    await db("rpc/wm_line_ack","POST",{p_id:job.id,p_ok:ok,p_code:reason});
    results.push({delivery_id:job.id,ok,reason});
   }
   return respond(200,{processed:results.length,sent:results.filter(x=>x.ok).length,
    failed:results.filter(x=>!x.ok).length},origin);
  }
  return respond(400,{error:"UNKNOWN_ACTION"},origin);
 }catch(e){
  const reason=message(e);
  const status=reason.includes("AUTH")||reason.includes("LOGIN_EXPIRED")?401:
   reason.includes("PERMISSION")||reason.includes("NO_ACTIVE")?403:400;
  return respond(status,{error:reason},origin);
 }
});
