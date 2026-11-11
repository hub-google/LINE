// Shared, side-effect-free customer entry URL and public logo validation.
// Individual entrypoints pass their existing routing context and session policy.
export function customerEntryUrl(slug,{
  surface="merchant",tab="",oaMode="PLATFORM",liffId="",currentSlug="",origin="",bookingPath=""
}={}){
 const query="?view=customer&merchant="+encodeURIComponent(slug)+
   (surface==="directory"?"&tab="+encodeURIComponent(tab):"");
 if(surface==="directory"){
  if(oaMode==="PLATFORM"||!liffId)return "./"+query;
  return "https://liff.line.me/"+encodeURIComponent(liffId)+"/"+query;
 }
 const canonical=origin+bookingPath+query;
 if(slug!==currentSlug||!liffId)return canonical;
 return "https://liff.line.me/"+encodeURIComponent(liffId)+"/"+query;
}

// The directory originally accepts any absolute HTTPS URL, while merchant
// editing and TV boards enforce a 490-character limit. Retain those policies.
export function safeMerchantLogoUrl(url,{directory=false}={}){
 const value=String(url||"").trim();
 if(directory){
  try{
   const parsed=new URL(value);
   return parsed.protocol==="https:"?parsed.href:"";
  }catch(_){return ""}
 }
 return /^https:\/\/[^\s<>"']{1,490}$/i.test(value)?value:"";
}
