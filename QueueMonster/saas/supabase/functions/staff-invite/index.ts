import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";

// Server-side only: never embed SUPABASE_SERVICE_ROLE_KEY in GitHub Pages.
const ORIGIN="https://hub-google.github.io";
const cors={
 "Access-Control-Allow-Origin":ORIGIN,
 "Access-Control-Allow-Methods":"POST, OPTIONS",
 "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
 "Vary":"Origin"
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
 status,headers:{...cors,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}
});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return json({error:"僅支援送出邀請"},405);
 if(req.headers.get("origin")!==ORIGIN)return json({error:"不允許的來源"},403);
 const url=Deno.env.get("SUPABASE_URL");
 const anonKey=Deno.env.get("SUPABASE_ANON_KEY");
 const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!anonKey||!serviceKey)return json({error:"邀請服務尚未完成設定"},503);
 const bearer=req.headers.get("authorization")||"";
 const token=/^Bearer\s+(.+)$/i.exec(bearer)?.[1]||"";
 if(!token)return json({error:"請先登入企業管理者帳號"},401);
 let input:{slug?:unknown;email?:unknown;role?:unknown};
 try{input=await req.json()}catch{return json({error:"資料格式不正確"},400)}
 const slug=typeof input.slug==="string"?input.slug.trim():"";
 const email=typeof input.email==="string"?input.email.trim().toLowerCase():"";
 const role=typeof input.role==="string"?input.role.trim():"";
 if(!/^[a-z0-9][a-z0-9-]{2,80}$/.test(slug)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||
   !["STAFF","MANAGER","OWNER"].includes(role))return json({error:"企業、信箱或員工角色無效"},400);
 const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:userError}=await admin.auth.getUser(token);
 if(userError||!user||!user.email_confirmed_at)return json({error:"請先完成電子信箱驗證並登入"},401);
 const caller=createClient(url,anonKey,{
  global:{headers:{"Authorization":"Bearer "+token}},
  auth:{persistSession:false,autoRefreshToken:false}
 });
 const {data:context,error:contextError}=await caller.rpc("so_my_context");
 if(contextError||!context)return json({error:"無法確認企業管理權限"},403);
 const member=Array.isArray(context.memberships)?context.memberships.find((m:{slug:string})=>m.slug===slug):null;
 const privileged=context.platform_admin===true;
 if(!privileged&&!["OWNER","MANAGER"].includes(member?.role))return json({error:"只有企業管理者可以邀請員工"},403);
 if(role==="OWNER"&&!privileged&&member?.role!=="OWNER")return json({error:"只有企業負責人可邀請另一位負責人"},403);
 const {data:invite,error:inviteError}=await caller.rpc("so_invite_staff",{
  p_slug:slug,p_email:email,p_role:role
 });
 if(inviteError||!invite?.invite_id)return json({error:"無法儲存邀請，請確認企業與角色權限"},400);
 const redirect=new URL("https://hub-google.github.io/LINE/booking/merchant-register.html");
 redirect.searchParams.set("mode","login");
 redirect.searchParams.set("staff_invite",invite.invite_id);
 let sendError:unknown=null;
 let emailSent=false;
 const {error:newUserError}=await admin.auth.admin.inviteUserByEmail(email,{
  redirectTo:redirect.href,
  data:{app:"queue-monster"}
 });
 if(!newUserError)emailSent=true;
 else{
  // Auth's admin invitation endpoint rejects already-registered users.
  // For them, send an ordinary sign-in email instead; membership is still
  // granted only by so_accept_invite for the verified, matching address.
  const mailer=createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {error:existingUserError}=await mailer.auth.signInWithOtp({
   email,options:{shouldCreateUser:false,emailRedirectTo:redirect.href}
  });
  if(!existingUserError)emailSent=true;
  else sendError=existingUserError;
 }
 // "email_sent" means the Auth mailer accepted the request, not inbox delivery.
 if(!emailSent)console.warn("staff-invite: mailer rejected request",String((sendError as Error)?.message||newUserError?.message||"unknown").slice(0,140));
 return json({saved:true,email_sent:emailSent,invite_id:invite.invite_id});
});