#!/usr/bin/env node
// Resend SMTP for MonsterPort's independent Supabase Auth projects.
// --check read only. --prepare registers a Resend domain and prints public DNS.
// --apply refuses unverified domains, and preserves existing templates + redirects.
const PROJECTS=[
  {name:'Monster Arena',ref:'fanffwnhkxpfhttylntw'},
  {name:'Queue Monster',ref:'unapiwajmgqqtdkixaab'},
];
const DOMAIN='auth.monsterport.com';
const EMAIL='no-reply@auth.monsterport.com';
const SENDER='MonsterPort';
const mode=process.argv[2]||'--check';
if(!['--check','--prepare','--apply'].includes(mode))throw Error('Usage: --check|--prepare|--apply');
const mgmt=process.env.SUPABASE_ACCESS_TOKEN||'';
const resend=process.env.RESEND_API_KEY||'';
async function request(url,token,method='GET',data){
  const response=await fetch(url,{method,
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    ...(data?{body:JSON.stringify(data)}:{}),
    signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error(new URL(url).hostname+' '+method+' HTTP '+response.status);
  return response.json();
}
const auth=(ref,method='GET',data)=>request('https://api.supabase.com/v1/projects/'+ref+'/config/auth',mgmt,method,data);
const resendAPI=(route,method='GET',data)=>request('https://api.resend.com'+route,resend,method,data);
async function safeRead(){
  if(!mgmt)throw Error('Missing SUPABASE_ACCESS_TOKEN in existing GitHub Secret');
  const states=[];
  for(const project of PROJECTS){
    const config=await auth(project.ref);
    states.push({...project,config});
    console.log(project.name+': custom SMTP '+(config.smtp_host?'present':'absent')+
      ', MonsterPort sender '+(config.smtp_sender_name===SENDER));
  }
  return states;
}
async function findDomain(){
  if(!resend)throw Error('Missing RESEND_API_KEY in GitHub Secret');
  const list=await resendAPI('/domains?limit=100');
  return(list.data||[]).find(d=>d.name===DOMAIN)||null;
}
if(mode==='--check'){
  await safeRead();
  console.log('READ ONLY: no config changed');
}else if(mode==='--prepare'){
  let domain=await findDomain();
  if(!domain){
    domain=await resendAPI('/domains','POST',{name:DOMAIN});
    console.log('Created Resend authentication domain');
  }else console.log('Reusing existing Resend domain');
  if(!domain.id)throw Error('No Resend domain id');
  const details=await resendAPI('/domains/'+encodeURIComponent(domain.id));
  console.log('Domain status:',details.status,'sending:',details.capabilities?.sending);
  const records=(details.records||[]).map(r=>({
    type:r.type,name:r.name,value:r.value,priority:r.priority??null,status:r.status??null
  }));
  console.log('Public DNS records:',JSON.stringify(records));
  console.log('Do not activate SMTP until Resend reports sending verified');
}else{
  const existing=await safeRead();
  const domain=await findDomain();
  if(!domain)throw Error('Resend domain absent; run --prepare');
  const verified=await resendAPI('/domains/'+encodeURIComponent(domain.id));
  if(verified.status!=='verified' ||
      (verified.capabilities?.sending && verified.capabilities.sending!=='enabled'))
    throw Error('Resend sending domain is not verified; preserving old SMTP');
  if(existing.some(p=>p.config.hook_send_email_enabled))
    throw Error('Send Email Hook present; cannot override');
  for(const project of existing){
    const prev=project.config;
    if(prev.smtp_host && (prev.smtp_host!=='smtp.resend.com' ||
      prev.smtp_admin_email?.toLowerCase()!==EMAIL))
      throw Error(project.name+': another SMTP provider already configured');
  }
  const patch={smtp_admin_email:EMAIL,smtp_sender_name:SENDER,
    smtp_host:'smtp.resend.com',smtp_port:465,smtp_user:'resend',smtp_pass:resend};
  const unchanged=['site_url','uri_allow_list','mailer_subjects_recovery',
    'mailer_templates_recovery_content','mailer_subjects_confirmation',
    'mailer_templates_confirmation_content','mailer_autoconfirm',
    'external_email_enabled','mailer_secure_email_change_enabled'];
  for(const project of existing){
    const before=project.config;
    await auth(project.ref,'PATCH',patch);
    const after=await auth(project.ref);
    for(const key of ['smtp_admin_email','smtp_sender_name','smtp_host','smtp_port','smtp_user'])
      if(String(after[key])!==String(patch[key]))
        throw Error(project.name+': SMTP read-back mismatch '+key);
    for(const key of unchanged)
      if(after[key]!==before[key])
        throw Error(project.name+': unrelated Auth setting changed: '+key);
    console.log('PASS:',project.name,'MonsterPort SMTP set without altering templates');
  }
  console.log('Both configurations verified. Next: send and inspect real reset email');
}
