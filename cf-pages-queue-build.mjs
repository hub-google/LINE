// Build Queue Monster's Cloudflare Pages static origin from the existing released snapshot.
// This file lives in the gh-pages root. GitHub Actions only replaces queue-prod/, so it persists.
// No Pages Functions, Workers or server-side runtime is used.
import fs from 'node:fs';
import path from 'node:path';

const source = process.cwd();
if (path.basename(source) !== 'queue-prod') {
  throw new Error('Build must run inside queue-prod/');
}
const output = path.join(source, 'dist');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

const SITE = 'https://queue.monsterport.com';
const legacyBases = [
  'https://hub-google.github.io/LINE/queue-prod',
  'https://hub-google.github.io/LINE/booking',
  'https://hub-google.github.io/LINE/saas',
];
const textExtensions = new Set(['.html', '.js', '.mjs', '.css', '.json', '.webmanifest', '.xml', '.svg', '.txt']);
function rewrite(text) {
  for (const base of legacyBases) {
    text = text.replaceAll(base + '/home.html', SITE + '/');
    text = text.replaceAll(base + '/', SITE + '/');
    text = text.replaceAll(base, SITE);
  }
  return text;
}
function copy(src, dest) {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (src === source && entry.name === 'dist') continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      copy(from, to);
    } else if (entry.isFile()) {
      if (textExtensions.has(path.extname(entry.name))) {
        let text = rewrite(fs.readFileSync(from, 'utf8'));
        if (entry.name.endsWith('.html')) {
          text = text.replaceAll('href="./home.html"', 'href="/"');
          text = text.replaceAll("href='./home.html'", "href='/'");
        }
        fs.writeFileSync(to, text, 'utf8');
      } else {
        fs.copyFileSync(from, to);
      }
    }
  }
}
copy(source, output);

const app = path.join(output, 'index.html');
const home = path.join(output, 'home.html');
if (!fs.existsSync(app) || !fs.existsSync(home)) {
  throw new Error('Missing production index.html or home.html');
}
const applicationHTML = fs.readFileSync(app, 'utf8');
const marketingHTML = fs.readFileSync(home, 'utf8');

// Previously, a Cloudflare reverse-proxy Worker chose home.html for the bare root
// and index.html for /?view=... . Pages is static, so the browser does this selection.
// Query-route visitors get the application document; history restores their canonical URL.
const routeKeys = [
  'view', 'merchant', 'tab', 'site_login', 'site_return', 'liff.state',
  'code', 'state', 'access_token', 'ticket', 'manage', 'recover', 'kind',
  'item', 'mode', 'entry', 'staff_invite'
];
const routeGuard = '<script id="queue-pages-router">(function(){' +
  'var p=new URLSearchParams(location.search);' +
  'var keys=' + JSON.stringify(routeKeys) + ';' +
  'var useApp=Array.from(p.keys()).some(function(k){return keys.includes(k)||k.indexOf("liff.")===0;});' +
  'if(useApp){location.replace("/app.html"+location.search+location.hash);}' +
  '})();</script>';
const restoreUrl = '<script id="queue-pages-restore-url">(function(){' +
  'if(location.pathname==="/app.html" && location.search){' +
  'history.replaceState(history.state,"","/"+location.search+location.hash);}' +
  '})();</script>';
if (!/<head[^>]*>/i.test(marketingHTML) || !/<head[^>]*>/i.test(applicationHTML)) {
  throw new Error('Cannot locate HTML head for static routing');
}
fs.writeFileSync(app, marketingHTML.replace(/<head([^>]*)>/i, '<head$1>' + routeGuard));
fs.writeFileSync(path.join(output, 'app.html'),
  applicationHTML.replace(/<head([^>]*)>/i, '<head$1>' + restoreUrl));

// Previously issued PWA cache names must not survive a new hosting strategy.
const sw = path.join(output, 'pwa-sw.js');
if (fs.existsSync(sw)) {
  let content = fs.readFileSync(sw, 'utf8');
  content = content.replace(/(const CACHE_NAME=CACHE_PREFIX\+)"([^"]+)"/,
    '$1"$2-cf-pages-v1"');
  fs.writeFileSync(sw, content);
}
// The former Worker redirected this old homepage URL back to the canonical root.
fs.writeFileSync(path.join(output, '_redirects'), [
  '/home.html / 302',
  '/feedback /feedback.html 200',
  '/line-group /feedback 302',
  '',
].join('\n'));
fs.writeFileSync(path.join(output, '_headers'),
  '/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n' +
  '/*.html\n  Cache-Control: no-cache\n' +
  '/release.json\n  Cache-Control: no-store\n' +
  '/pwa-sw.js\n  Cache-Control: no-cache\n' +
  '/\n  Cache-Control: no-cache\n');
for (const p of ['index.html', 'app.html', 'release.json', 'site-auth.js', 'pwa-sw.js', 'assets']) {
  if (!fs.existsSync(path.join(output, p))) throw new Error('Missing expected Pages asset ' + p);
}
console.log('Cloudflare Pages static origin ready: ' + output +
  '; no Worker; root=marketing; query root=application.');
