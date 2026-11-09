import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {build} from '../frontend/node_modules/esbuild/lib/main.js';

// Build actual ES module dependencies, rather than concatenating source fragments.
export async function buildFrontend(src,dest,pages){
 const htmlByPage=new Map();const entries=new Map();
 for(const name of pages){
  const html=await readFile(path.join(src,name),'utf8');htmlByPage.set(name,html);
  for(const match of html.matchAll(/<(script|link)\b([^>]*?)\b(?:src|href)="(\.\/(?:assets\/|app\/)[^"?]+)(?:\?[^\"]*)?"[^>]*>/g)){
   const file=path.resolve(src,match[3]);
   entries.set(file,{in:file,out:'assets/'+path.relative(src,file).replaceAll(path.sep,'/').replace(/^assets\//,'').replace(/\.(js|css)$/,''),module:match[1]==='link'||/type="module"/.test(match[2])});
  }
 }
 const replacements=new Map();
 for(const module of [true,false]){
  const group=[...entries.values()].filter(x=>x.module===module);if(!group.length)continue;
  const result=await build({entryPoints:group.map(({in:input,out})=>({in:input,out})),outdir:dest,
   bundle:true,format:module?'esm':'iife',platform:'browser',target:['es2022'],minify:true,
   sourcemap:false,metafile:true,entryNames:'[dir]/[name]-[hash]',external:['https://*'],logLevel:'warning'});
  for(const [output,meta] of Object.entries(result.metafile.outputs))if(meta.entryPoint){
   replacements.set(path.resolve(meta.entryPoint), './'+path.relative(dest,path.resolve(output)).replaceAll(path.sep,'/'));
  }
 }
 for(const [name,html]of htmlByPage)htmlByPage.set(name,html.replace(/((?:src|href)=")(\.\/(?:assets\/|app\/)[^"?]+)(\?[^\"]*)?(".*?)/g,(all,prefix,url,query='',tail)=>{
  const replacement=replacements.get(path.resolve(src,url));if(!replacement)throw Error('Unbuilt frontend asset: '+url);
  return prefix+replacement+query+tail;
 }));
 return htmlByPage;
}
