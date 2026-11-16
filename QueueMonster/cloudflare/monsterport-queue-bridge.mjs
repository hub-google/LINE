// queue.monsterport.com serves the independently promoted release snapshot.
// Ordinary main/GitHub Pages test updates never change /LINE/queue-prod.
const ORIGIN="https://hub-google.github.io";
const PREFIX="/LINE/queue-prod";
const TEST_PREFIX="/LINE/booking";
const LEGACY_PREFIX="/LINE/saas";
const BASES=[PREFIX,TEST_PREFIX,LEGACY_PREFIX];
const APP_PARAMS=new Set(["view","merchant","tab","site_login","site_return","liff.state","code","state","access_token","ticket","manage","recover","kind","item","mode","entry","staff_invite"]);
function isAppRoute(params){for(const key of params.keys())if(APP_PARAMS.has(key)||key.startsWith("liff."))return true;return false;}
function rewriteOriginLinks(content,domain){
 let text=content;
 // The current public frontend still includes absolute GitHub Pages links.
 for(const base of BASES){
  text=text.replaceAll(ORIGIN+base+"/",domain+"/").replaceAll(ORIGIN+base,domain);
 }
 return text;
}
export default {
 async fetch(request) {
  if(request.method!=="GET"&&request.method!=="HEAD")return new Response("Method Not Allowed",{status:405,headers:{Allow:"GET, HEAD"}});
  const incoming=new URL(request.url);
  const authRoute=isAppRoute(incoming.searchParams);
  // Keep existing external links and OAuth callback/query routing intact.
  if(incoming.pathname==="/home.html"&&!authRoute){
   const canonical=new URL("/",incoming.origin);canonical.search=incoming.search;
   return Response.redirect(canonical.href,302);
  }
  const sourcePath=incoming.pathname==="/"&&!authRoute?"/home.html":incoming.pathname;
  const upstreamURL=new URL(PREFIX+sourcePath+incoming.search,ORIGIN);
  if(!upstreamURL.pathname.startsWith(PREFIX+"/"))return new Response("Invalid path",{status:400});
  let upstream;
  try {
   upstream=await fetch(upstreamURL.href,{method:request.method,redirect:"manual",headers:{Accept:request.headers.get("accept")||"*/*"}});
  } catch {
   return new Response("Upstream temporarily unavailable",{status:502,headers:{"content-type":"text/plain; charset=utf-8","cache-control":"no-store"}});
  }
  const headers=new Headers(upstream.headers);
  for(const name of ["set-cookie","content-length","content-encoding","transfer-encoding","content-security-policy-report-only"])headers.delete(name);
  headers.set("X-MonsterPort-Bridge","independent-release-origin");
  const location=headers.get("location");
  if(location){
   try {
    const dest=new URL(location,upstreamURL);
    if(dest.origin===ORIGIN){
     for(const base of BASES){
      if(dest.pathname.startsWith(base+"/")){
       dest.pathname=dest.pathname.slice(base.length);
       headers.set("location",incoming.origin+dest.pathname+dest.search+dest.hash);
       break;
      }
     }
    }
   }catch{}
  }
  if(request.method==="HEAD"||!upstream.body)return new Response(null,{status:upstream.status,headers});
  const type=(headers.get("content-type")||"").toLowerCase();
  if(/text\/html|javascript|text\/css|application\/json|manifest|text\/xml|application\/xml/.test(type)){
   const source=await upstream.text();
   let transformed=rewriteOriginLinks(source,incoming.origin);
   if(type.includes("text/html")){
    transformed=transformed.replaceAll('href="./home.html"','href="/"');
    transformed=transformed.replaceAll(incoming.origin+"/home.html",incoming.origin+"/");
    headers.set("cache-control","no-store");
   }
   if(incoming.pathname.endsWith("/release.json"))headers.set("cache-control","no-store");
   return new Response(transformed,{status:upstream.status,headers});
  }
  return new Response(upstream.body,{status:upstream.status,headers});
 }
};
