import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const ALLOWED_ORIGIN="https://hub-google.github.io";
const headers={
 "Access-Control-Allow-Origin":ALLOWED_ORIGIN,
 "Access-Control-Allow-Headers":"authorization,apikey,x-client-info,content-type",
 "Access-Control-Allow-Methods":"POST,OPTIONS",
 "Vary":"Origin"
};
const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
 status,headers:{...headers,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}
});
Deno.serve(async(request:Request)=>{
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(request.method!=="POST")return respond({error:"不支援此操作"},405);
 if(request.headers.get("origin")!==ALLOWED_ORIGIN)return respond({error:"來源不符"},403);
 const token=(request.headers.get("authorization")||"").match(/^Bearer\s+(.+)$/i)?.[1];
 const url=Deno.env.get("SUPABASE_URL");
 const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 const anon=Deno.env.get("SUPABASE_ANON_KEY");
 if(!url||!service||!anon||!token)return respond({error:"請先登入並完成身分驗證"},401);
 let raw:unknown;
 try{raw=await request.json()}catch{return respond({error:"請輸入密碼"},400)}
 const password=typeof(raw as {password?:unknown})?.password==="string"
  ?(raw as {password:string}).password:"";
 if(password.length<1||password.length>4096)return respond({error:"請輸入有效密碼"},400);
 const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:checkError}=await admin.auth.getUser(token);
 if(checkError||!user||!user.email||!user.email_confirmed_at)return respond({error:"登入資訊無效"},401);
 if(user.user_metadata?.app!=="queue-monster"||!user.invited_at)return respond({error:"此帳號不需要員工首次啟用"},403);
 const verifier=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:verified,error:passwordError}=await verifier.auth.signInWithPassword({email:user.email,password});
 if(passwordError||verified.user?.id!==user.id)return respond({error:"密碼驗證失敗，請重新確認"},403);
 const {error:updateError}=await admin.auth.admin.updateUserById(user.id,{
  app_metadata:{...user.app_metadata,queue_monster_password_ready:true}
 });
 if(updateError)return respond({error:"無法完成帳號啟用，請重新嘗試"},503);
 return respond({ready:true});
});
