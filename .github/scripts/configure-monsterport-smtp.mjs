#!/usr/bin/env node
// Apply a single verified MonsterPort SMTP provider to the two independent Supabase Auth projects.
// Does NOT touch any app email templates, URL allow lists, security controls or production deployments.
// No credentials may be printed, written to git, or passed on the CLI.
const projects = [
  {name: 'Queue Monster', ref: 'unapiwajmgqqtdkixaab'},
  {name: 'Monster Arena', ref: 'fanffwnhkxpfhttylntw'},
];
const env = process.env;
const token = env.SUPABASE_ACCESS_TOKEN;
const mode = process.argv[2] || '--check';
if (!['--check', '--apply'].includes(mode)) throw new Error('Use --check or --apply');
if (!token) throw new Error('Missing SUPABASE_ACCESS_TOKEN (must remain a GitHub Secret)');
const request = async (ref, method, payload) => {
  const response = await fetch('https://api.supabase.com/v1/projects/' + ref + '/config/auth', {
    method,
    headers: {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'},
    ...(payload ? {body: JSON.stringify(payload)} : {}),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(ref + ' Management Auth ' + method + ' HTTP ' + response.status);
  return response.json();
};
// Read and preflight BOTH projects before any write.
const before = await Promise.all(projects.map(async p => ({...p, config: await request(p.ref, 'GET')})));
for (const p of before) {
  const c = p.config;
  if (c.hook_send_email_enabled) throw new Error(p.name + ': Send Email Hook is enabled; refusing unexpected SMTP takeover');
  console.log(p.name + ': existing custom SMTP ' + (c.smtp_host ? 'present' : 'absent') +
    ', sender already MonsterPort ' + (c.smtp_sender_name === 'MonsterPort'));
}
if (mode === '--check') {
  console.log('CHECK ONLY: No settings changed');
  process.exit(0);
}
const names = ['MONSTERPORT_SMTP_HOST', 'MONSTERPORT_SMTP_PORT', 'MONSTERPORT_SMTP_USER',
  'MONSTERPORT_SMTP_PASS', 'MONSTERPORT_SMTP_FROM'];
for (const n of names) if (!env[n]?.trim()) throw new Error('Missing secure SMTP setting: ' + n);
if (env.MONSTERPORT_SMTP_DOMAIN_VERIFIED !== 'true')
  throw new Error('SMTP provider must verify the sending domain; set MONSTERPORT_SMTP_DOMAIN_VERIFIED=true only after provider confirms');
const from = env.MONSTERPORT_SMTP_FROM.trim().toLowerCase();
if (!/^[a-z0-9._%+-]+@(?:[a-z0-9-]+\.)*monsterport\.com$/.test(from))
  throw new Error('From address must be a verified monsterport.com address');
const host = env.MONSTERPORT_SMTP_HOST.trim().toLowerCase();
if (!/^[a-z0-9.-]+$/.test(host) || !host.includes('.')) throw new Error('Invalid SMTP host');
const port = Number(env.MONSTERPORT_SMTP_PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SMTP port');
const user = env.MONSTERPORT_SMTP_USER.trim();
for (const p of before) {
  if (p.config.smtp_host && (p.config.smtp_host !== host || p.config.smtp_admin_email?.toLowerCase() !== from))
    throw new Error(p.name + ' already uses another SMTP service; refusing overwrite');
}
const payload = {
  smtp_admin_email: from, smtp_host: host, smtp_port: String(port),
  smtp_user: user, smtp_pass: env.MONSTERPORT_SMTP_PASS,
  smtp_sender_name: 'MonsterPort',
};
for (const p of before) {
  await request(p.ref, 'PATCH', payload);
  const c = await request(p.ref, 'GET');
  if (c.smtp_host !== host || String(c.smtp_port) !== String(port) ||
      c.smtp_user !== user || c.smtp_admin_email?.toLowerCase() !== from ||
      c.smtp_sender_name !== 'MonsterPort')
    throw new Error(p.name + ': SMTP read-back mismatch; do NOT consider setup complete');
  // Auth services are shared across apps; never overwrite their templates or security rules.
  for (const key of ['site_url', 'uri_allow_list',
    'mailer_subjects_recovery', 'mailer_templates_recovery_content',
    'mailer_subjects_confirmation', 'mailer_templates_confirmation_content',
    'external_email_enabled', 'mailer_autoconfirm']) {
    if (c[key] !== p.config[key])
      throw new Error(p.name + ': unrelated Auth setting unexpectedly changed: ' + key);
  }
  console.log('PASS: ' + p.name + ' SMTP from display name MonsterPort, existing templates and Auth settings preserved');
}
console.log('CONFIG VERIFIED. Next: real non-team-recipient delivery test and Gmail From header inspection.');
