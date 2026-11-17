import assert from "node:assert/strict";
// Read-only live health checks for the separately deployed MINI Edge Function.
// No account credentials, no production reservations, no data mutations.
const url="https://unapiwajmgqqtdkixaab.supabase.co/functions/v1/qm-mini-session";
const envs={
  developing:"2012649101-EFX2gymX",
  review:"2012649102-rNb39YpL",
  published:"2012649103-s6KPdX4H",
};
for(const [env,liffId] of Object.entries(envs)){
  const r=await fetch(url+"?env="+env,{
    headers:{origin:"https://hub-google.github.io"},
    signal:AbortSignal.timeout(12000)
  });
  assert.equal(r.status,200,env+" config endpoint");
  assert.equal(r.headers.get("access-control-allow-origin"),"https://hub-google.github.io");
  const body=await r.json();
  assert.equal(body.liffId,liffId,env+" LIFF ID");
  assert.equal(body.loginReady,true);
  console.log(env+" backend config correct");
}
const untrusted=await fetch(url+"?env=developing",{
  headers:{origin:"https://untrusted.example"},signal:AbortSignal.timeout(12000)
});
assert.equal(untrusted.status,403,"untrusted browser Origin must be rejected");
const noAuth=await fetch(url,{method:"POST",
 headers:{"content-type":"application/json",origin:"https://hub-google.github.io"},
 body:JSON.stringify({action:"link-platform",env:"developing",idToken:"invalid"}),
 signal:AbortSignal.timeout(12000)});
assert.equal(noAuth.status,401,"anonymous API caller must be rejected");
console.log("LIVE MINI Edge Function status, origin and auth checks passed");
