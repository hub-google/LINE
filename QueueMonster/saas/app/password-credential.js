// Supabase-hosted Auth enforces a six-character minimum. Queue Monster accepts
// shorter user-entered passwords by deriving a stable, Auth-compatible credential.
// This is ONLY a compatibility encoding; it does not add password entropy.
// Six-or-more-character existing passwords are left unchanged.
export async function effectivePassword(email,plaintext){
 if(typeof plaintext!=="string"||!plaintext.length)throw Error("請輸入密碼");
 if(plaintext.length>=6)return plaintext;
 const normalized=(email||"").trim().toLowerCase();
 if(!normalized)throw Error("找不到帳號的電子信箱");
 if(!globalThis.crypto?.subtle)throw Error("瀏覽器無法安全處理密碼，請使用新版瀏覽器");
 const bytes=new TextEncoder().encode("queue-monster-short-password-v1\\0"+normalized+"\\0"+plaintext);
 const digest=await crypto.subtle.digest("SHA-256",bytes);
 return "qm1-"+Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,"0")).join("");
}
