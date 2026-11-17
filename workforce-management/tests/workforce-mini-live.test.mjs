import test from 'node:test';
import assert from 'node:assert/strict';

// Public-only health verification. Never submits real employee data or credentials.
// This test runs in GitHub Actions, where outbound HTTPS is available.
const URL='https://unapiwajmgqqtdkixaab.supabase.co/functions/v1/wm-line';
const ORIGIN='https://hub-google.github.io';
const expected={
  developing:'2012649404-nz3TBQdG',
  review:'2012649405-ADWLM7h9',
  published:'2012649406-KzlLEZT6',
};
const headers={Origin:ORIGIN};

test('Deployed WF LINE gateway advertises all three MINI channels, without exposing secrets',async()=>{
 const response=await fetch(URL,{headers,signal:AbortSignal.timeout(15000)});
 assert.equal(response.status,200,'Gateway GET should be available to the static MINI App');
 assert.equal(response.headers.get('access-control-allow-origin'),ORIGIN);
 const data=await response.json();
 assert.equal(data.miniConfigured,true);
 for(const [environment,liffId] of Object.entries(expected)){
  assert.equal(data.miniEnvironments?.[environment]?.configured,true,environment);
  assert.equal(data.miniEnvironments?.[environment]?.liffId,liffId,environment);
 }
 assert.ok(!('token' in data)&&!('channelSecret' in data),'Public configuration must not disclose secrets');
});

test('Gateway rejects anonymous attempts to bind an employee LINE account',async()=>{
 const response=await fetch(URL,{
  method:'POST',
  headers:{...headers,'Content-Type':'application/json'},
  body:JSON.stringify({action:'bind',tenant_id:'00000000-0000-0000-0000-000000000000',
   channel_type:'mini',channel_env:'developing',id_token:'fake'}),
  signal:AbortSignal.timeout(15000),
 });
 assert.equal(response.status,401,'Employee bindings require a Supabase JWT');
 const result=await response.json();
 assert.equal(result.error,'AUTH_REQUIRED');
});
