import {copyFile, mkdir, readFile, writeFile} from "node:fs/promises";
import path from "node:path";

const sha = (process.env.GITHUB_SHA || "").trim();
if (!/^[0-9a-f]{40}$/i.test(sha)) throw Error("GITHUB_SHA must be the deployment commit SHA");
const src = path.resolve("store-operations/saas");
const dest = path.resolve(process.argv[2] || "line-saas-dist");
const pages = ["index.html", "directory.html", "merchant-register.html", "merchant-center.html", "privacy.html", "terms.html"];
const placeholder = "__LINE_SAAS_BUILD__";

await mkdir(dest, {recursive:true});
for (const name of pages) {
  const html = await readFile(path.join(src, name), "utf8");
  if (!html.includes(placeholder) || !html.includes("version-watch.js")) {
    throw Error(name + " is missing the automatic version update integration");
  }
  await writeFile(path.join(dest, name), html.replaceAll(placeholder, sha), "utf8");
}
await copyFile(path.join(src, "version-watch.js"), path.join(dest, "version-watch.js"));
await writeFile(path.join(dest, "release.json"), JSON.stringify({
  build:sha, deployedAt:new Date().toISOString(), project:"line-booking"
}, null, 2)+"\n", "utf8");
console.log("Built LINE booking release " + sha.slice(0, 12));
