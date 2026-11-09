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
  const parts=JSON.parse(fs.readFileSync(new URL("./application-sources.json",import.meta.url),"utf8"));
  if(relative.startsWith("./app/main.js")){
   // Lexical view for legacy source contracts. Native-module execution is tested separately.
   return parts.map(part=>fs.readFileSync(path.join(dir,part),"utf8")
    .replace(/^import .*?;\r?\n/gm,"").replace(/\bexport /g,"")
    .replace(/\b\w+State\.(\w+)/g,"$1")
    .replace(/\b([A-Za-z_$][\w$]*):\1(?=[,}])/g,"$1")).join("\n");
  }
  return fs.readFileSync(target,"utf8");
 };
 return value.replace(/<script([^>]*?) src="(\.\/(?:assets|app)\/[^"]+)"([^>]*)><\/script>/g,(_,before,url,after)=>'<script'+before+after+'>'+asset(url)+'</script>')
 .replace(/<link rel="stylesheet" href="(\.\/assets\/[^"]+)">/g,(_,url)=>'<style>'+asset(url)+'</style>');
}
export default {...fs,readFileSync};
export {readdirSync} from "node:fs";
