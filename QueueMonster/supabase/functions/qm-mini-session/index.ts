import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Only the LINE MINI App uses this endpoint. Original LINE/OA endpoints are untouched.
const miniIds: Record<string,string> = {
  developing:"2012649101-EFX2gymX",
  review:"2012649102-rNb39YpL",
  published:"2012649103-s6KPdX4H",
};
const permittedOrigins = new Set(["https://hub-google.github.io"]);
const allowedActions = new Set(["link","link-platform","resume","resume-platform"]);
function cors(origin:string|null) {
  return {
    "content-type":"application/json",
    "access-control-allow-methods":"GET, POST, OPTIONS",
    "access-control-allow-headers":"authorization, apikey, content-type",
    "vary":"Origin",
    ...(origin&&permittedOrigins.has(origin)?{"access-control-allow-origin":origin}:{})
  };
}
function result(status:number,body:Record<string,unknown>,origin:string|null) {
  return new Response(JSON.stringify(body),{status,headers:cors(origin)});
}
function serviceRoleKey() {
  const legacy=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(legacy)return legacy;
  const map=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}");
  const key=map.default||Object.values(map)[0];
  if(typeof key!=="string")throw Error("SUPABASE_ADMIN_NOT_CONFIGURED");
  return key;
}
function admin() {
  const url=Deno.env.get("SUPABASE_URL")||"";
  if(!url)throw Error("SUPABASE_ADMIN_NOT_CONFIGURED");
  return createClient(url,serviceRoleKey(),{auth:{persistSession:false,autoRefreshToken:false}});
}
type Identity={sub:string;name:string};
async function verifyLineIdentity(idToken:string,accessToken:string,clientId:string):Promise<Identity>{
  let sub="",name="",idError="INVALID_LINE_ID_TOKEN";
  if(idToken){
    const response=await fetch("https://api.line.me/oauth2/v2.1/verify",{
      method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({id_token:idToken,client_id:clientId})
    });
    if(response.ok){
      const payload=await response.json();
      if(payload.aud!==clientId||!/^U[0-9a-f]{32}$/i.test(payload.sub||""))throw Error("INVALID_LINE_IDENTITY");
      sub=payload.sub;
      name=typeof payload.name==="string"?payload.name.trim():"";
    }else{idError="INVALID_LINE_ID_TOKEN";}
  }
  if(accessToken){
    const verifyUrl=new URL("https://api.line.me/oauth2/v2.1/verify");
    verifyUrl.searchParams.set("access_token",accessToken);
    const checked=await fetch(verifyUrl);
    if(checked.ok){
      const token=await checked.json();
      if(token.client_id!==clientId)throw Error("LINE_CHANNEL_MISMATCH");
      if(!Number.isFinite(Number(token.expires_in))||Number(token.expires_in)<=0)throw Error("LINE_TOKEN_EXPIRED");
      if(String(token.scope||"").split(/\s+/).includes("profile")){
        const profileResult=await fetch("https://api.line.me/v2/profile",{headers:{authorization:"Bearer "+accessToken}});
        if(profileResult.ok){
          const profile=await profileResult.json();
          if(!/^U[0-9a-f]{32}$/i.test(profile.userId||""))throw Error("INVALID_LINE_IDENTITY");
          if(sub&&sub!==profile.userId)throw Error("LINE_IDENTITY_MISMATCH");
          sub=profile.userId;
          name=String(profile.displayName||"").trim();
        }
      }
    }else if(!sub)throw Error("LINE_TOKEN_EXPIRED");
  }
  if(!sub)throw Error(idError);
  if(!name||name.length>60)throw Error("LINE_PROFILE_SCOPE_REQUIRED");
  return {sub,name};
}
async function ensureMiniShopLink(
  db:ReturnType<typeof admin>,uid:string,slug:string,sub:string,name:string,clientId:string,
){
  if(!/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug))throw Error("BAD_MERCHANT");
  const {data:tenant,error:te}=await db.from("qm_tenants").select("id")
    .eq("slug",slug).eq("status","ACTIVE").maybeSingle();
  if(te)throw te;
  if(!tenant)throw Error("TENANT_NOT_FOUND");
  const linkQuery=()=>db.from("qm_line_links").select("line_sub,login_channel_id")
    .eq("tenant_id",tenant.id).eq("user_id",uid).maybeSingle();
  const {data:previous,error:pe}=await linkQuery();
  if(pe)throw pe;
  if(previous){
    if(previous.line_sub!==sub)throw Error("LINE_ACCOUNT_CHANGED");
    // Preserve original web channel ID when the same Supabase user ID already
    // has a legacy LINE link. MINI uses its own auth storage key anyway.
    return;
  }
  const {error:insertError}=await db.from("qm_line_links").insert({
    tenant_id:tenant.id,user_id:uid,line_sub:sub,display_name:name,
    login_channel_id:clientId,updated_at:new Date().toISOString(),
    is_following:null,friendship_updated_at:null
  });
  if(insertError){
    if(insertError.code!=="23505")throw insertError;
    const {data:race,error:raceError}=await linkQuery();
    if(raceError)throw raceError;
    if(race?.line_sub!==sub)throw Error("LINE_ACCOUNT_CHANGED");
  }
}
Deno.serve(async req=>{
  const origin=req.headers.get("origin");
  if(origin&&!permittedOrigins.has(origin))return result(403,{error:"ORIGIN_DENIED"},origin);
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(origin)});
  const url=new URL(req.url);
  if(req.method==="GET"){
    const env=url.searchParams.get("env")||"developing";
    if(!Object.hasOwn(miniIds,env))return result(400,{error:"INVALID_ENV"},origin);
    return result(200,{liffId:miniIds[env],loginReady:true,messagingReady:false,miniApp:true,environment:env},origin);
  }
  if(req.method!=="POST")return result(405,{error:"METHOD_NOT_ALLOWED"},origin);
  try{
    const header=req.headers.get("authorization")||"";
    if(!/^Bearer \S+$/i.test(header))return result(401,{error:"LOGIN_REQUIRED"},origin);
    const body=await req.json();
    const action=String(body.action||""),env=String(body.env||"");
    if(!allowedActions.has(action)||!Object.hasOwn(miniIds,env))return result(400,{error:"BAD_REQUEST"},origin);
    const clientId=miniIds[env].split("-")[0];
    const db=admin();
    const {data,error}=await db.auth.getUser(header.replace(/^Bearer\s+/i,""));
    if(error||!data.user)return result(401,{error:"INVALID_SUPABASE_SESSION"},origin);
    const uid=data.user.id;
    if(action==="resume"||action==="resume-platform"){
      const {data:identity,error:readError}=await db.from("qm_mini_line_identities")
        .select("line_sub,display_name,login_channel_id,updated_at").eq("user_id",uid).maybeSingle();
      if(readError)throw readError;
      const age=Date.now()-Date.parse(identity?.updated_at||"");
      if(!identity||identity.login_channel_id!==clientId||!Number.isFinite(age)||age< -60000||age>30*86400000)
        return result(401,{error:"LINE_REAUTH_REQUIRED"},origin);
      if(action==="resume")await ensureMiniShopLink(db,uid,String(body.slug||""),
        identity.line_sub,identity.display_name,clientId);
      return result(200,{ok:true,linked:true,displayName:identity.display_name,
        isFollowing:null,recipientReachability:"UNKNOWN",friendCheckStatus:"MINI_VERIFIED"},origin);
    }
    const idToken=String(body.idToken||"");
    const accessToken=String(body.accessToken||"");
    if(idToken.length>10000||accessToken.length>10000||(!idToken&&!accessToken))
      return result(400,{error:"LINE_LOGIN_TOKEN_REQUIRED"},origin);
    const profile=await verifyLineIdentity(idToken,accessToken,clientId);
    const [existing,legacy,storeLinks]=await Promise.all([
      db.from("qm_mini_line_identities").select("line_sub").eq("user_id",uid).maybeSingle(),
      db.from("qm_platform_line_identities").select("line_sub").eq("user_id",uid).maybeSingle(),
      db.from("qm_line_links").select("line_sub").eq("user_id",uid).limit(100),
    ]);
    if(existing.error||legacy.error||storeLinks.error)throw existing.error||legacy.error||storeLinks.error;
    if([existing.data?.line_sub,legacy.data?.line_sub,...(storeLinks.data||[]).map(x=>x.line_sub)]
       .some(x=>x&&x!==profile.sub))
      return result(409,{error:"LINE_ACCOUNT_CHANGED"},origin);
    if(action==="link")await ensureMiniShopLink(db,uid,String(body.slug||""),
      profile.sub,profile.name,clientId);
    const {error:saveError}=await db.from("qm_mini_line_identities").upsert({
      user_id:uid,line_sub:profile.sub,display_name:profile.name,login_channel_id:clientId,
      updated_at:new Date().toISOString()
    },{onConflict:"user_id"});
    if(saveError)throw saveError;
    return result(200,{ok:true,linked:true,displayName:profile.name,isFollowing:null,
      recipientReachability:"UNKNOWN",friendCheckStatus:"MINI_VERIFIED"},origin);
  }catch(error){
    const msg=error instanceof Error?error.message:"UNKNOWN_ERROR";
    const denied=["INVALID_LINE_ID_TOKEN","LINE_CHANNEL_MISMATCH","LINE_TOKEN_EXPIRED","LINE_IDENTITY_MISMATCH",
      "INVALID_LINE_IDENTITY","LINE_PROFILE_SCOPE_REQUIRED"].includes(msg);
    if(!denied)console.error("MINI auth error",msg);
    const status=denied?401:msg==="LINE_ACCOUNT_CHANGED"?409:
      msg==="TENANT_NOT_FOUND"?404:msg==="BAD_MERCHANT"?400:503;
    return result(status,{error:status===503?"MINI_AUTH_UNAVAILABLE":msg},origin);
  }
});
