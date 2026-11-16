const ORIGIN="https://hub-google.github.io"; const PREFIX="/LINE/booking"; const PUBLIC_BASE=ORIGIN+PREFIX+"/";
export default {
 async fetch(request) {
  if(request.method!=="GET" && request.method!=="HEAD") return new Response("Method Not Allowed",{status:405,headers:{Allow:"GET, HEAD"}});
  const incoming=new URL(request.url);
  const target=new URL(PREFIX+incoming.pathname+incoming.search,ORIGIN);
  if(!target.pathname.startsWith(PREFIX+"/")) return new Response("Invalid path",{status:400});
  let upstream;
  try{upstream=await fetch(target.toString(),{method:request.method,redirect:"manual",headers:{Accept:request.headers.get("Accept")||"*/*"}})}
  catch(e){return new Response("Upstream temporarily unavailable",{status:502,headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store"}})}
  const headers=new Headers(upstream.headers);
  for(const name of ["set-cookie","content-length","content-encoding","transfer-encoding","content-security-policy-report-only"])headers.delete(name);
  headers.set("X-MonsterPort-Bridge","github-pages-origin");
  const loc=headers.get("location");
  if(loc){try{const absolute=new URL(loc,target);if(absolute.origin===ORIGIN&&absolute.pathname.startsWith(PREFIX+"/")){absolute.pathname=absolute.pathname.slice(PREFIX.length);headers.set("location",incoming.origin+absolute.pathname+absolute.search+absolute.hash)}}catch{}}
  if(request.method==="HEAD"||!upstream.body)return new Response(null,{status:upstream.status,headers});
  const type=(headers.get("content-type")||"").toLowerCase();
  if(/text\/html|javascript|text\/css|application\/json|manifest|text\/xml|application\/xml/.test(type)){
   const text=await upstream.text();
   const base=incoming.origin+"/";
   const transformed=text.replaceAll(PUBLIC_BASE,base).replaceAll(ORIGIN+PREFIX, incoming.origin);
   if(type.includes("text/html")||incoming.pathname.endsWith("release.json"))headers.set("Cache-Control","no-store");
   return new Response(transformed,{status:upstream.status,headers});
  }
  return new Response(upstream.body,{status:upstream.status,headers});
 }
};
