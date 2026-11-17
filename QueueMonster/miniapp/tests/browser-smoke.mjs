import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from '../../../.github/frontend/node_modules/playwright/index.mjs';

// Browser integration against separately bundled MINI files; remote services mocked.
const root=path.resolve(process.argv[2]||'queue-mini-dist');
const server=createServer((req,res)=>{
 const prefix='/LINE/queue-mini/';
 let uri=decodeURIComponent(new URL(req.url,'http://local').pathname);
 if(!uri.startsWith(prefix)){res.writeHead(404).end();return;}
 uri=uri.slice(prefix.length);
 if(uri.endsWith('/'))uri+='index.html';
 const file=path.resolve(root,uri);
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 try{
  const type={'.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml',
   '.html':'text/html','.json':'application/json','.png':'image/png'}[path.extname(file)]||'application/octet-stream';
  res.writeHead(200,{'content-type':type});res.end(fs.readFileSync(file));
 }catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base='http://127.0.0.1:'+server.address().port+'/LINE/queue-mini/';
const mockSupabase=