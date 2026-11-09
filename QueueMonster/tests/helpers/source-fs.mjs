// Existing contracts inspect the composed page, including its extracted assets.
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
export function readFileSync(file, options) {
 const value=fs.readFileSync(file,options);
 const name=file instanceof URL?fileURLToPath(file):String(file);
 if(typeof value!=="string"||!name.endsWith(".html")||!name.includes("saas"))return value;
 const dir=path.dirname(name);
 const asset=relative=>{
  const target=path.resolve(dir,relative.split("?")[0]);
  const manifest=JSON.parse(fs.readFileSync(path.join(dir,"app/manifest.json"),"utf8"));
  const parts=manifest[relative.replace(/^\.\//,"").split("?")[0]];
  return parts?parts.map(part=>fs.readFileSync(path.join(dir,part),"utf8")).join("\n"):fs.readFileSync(target,"utf8");
 };
 return value.replace(/<script([^>]*?) src="(\.\/assets\/[^"]+)"([^>]*)><\/script>/g,(_,before,url,after)=>'<script'+before+after+'>'+asset(url)+'</script>')
 .replace(/<link rel="stylesheet" href="(\.\/assets\/[^"]+)">/g,(_,url)=>'<style>'+asset(url)+'</style>');
}
export default {...fs,readFileSync};
export {readdirSync} from "node:fs";
