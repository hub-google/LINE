import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const sql=readFileSync(new URL("../supabase/migrations/20261104_store_announcements_fr110.sql",import.meta.url),"utf8");
const ui=readFileSync(new URL("../saas/index.html",import.meta.url),"utf8");

test("FR-110/C39: announcements are tenant scoped with server-only writes",()=>{
 assert.match(sql,/create table if not exists public\.so_store_announcements/);
 assert.match(sql,/tenant_id uuid not null references public\.so_tenants/);
 assert.match(sql,/alter table public\.so_store_announcements enable row level security/);
 assert.match(sql,/revoke all on public\.so_store_announcements from public,anon,authenticated/);
 assert.match(sql,/public\.so_public_announcements\(p_slug text\)/);
 assert.match(sql,/where tenant_id=v_tenant and active=true/);
 assert.match(sql,/public\.so_save_announcement/);
 assert.match(sql,/public\.so_set_announcement_active/);
 assert.match(sql,/private\.so_role\(v_tenant\) not in\('OWNER','MANAGER'\)/);
 assert.match(sql,/where id=p_id and tenant_id=v_tenant/);
 assert.match(sql,/store_announcement_saved/);
 assert.match(sql,/store_announcement_visibility/);
 assert.doesNotMatch(sql,/\btruncate\b|\bdelete from public\.so_(?:tickets|reservations)\b/i);
});

test("FR-110/C39: eight-image HTTPS-only gallery with visibility controls",()=>{
 assert.match(sql,/cardinality\(image_urls\)<=8/);
 assert.match(sql,/cardinality\(coalesce\(p_images,'\{\}'::text\[\]\)\)>8/);
 assert.match(sql,/v_url !~ '\^https:\/\//);
 assert.match(ui,/so_public_announcements/);
 assert.match(ui,/so_staff_announcements/);
 assert.match(ui,/so_save_announcement/);
 assert.match(ui,/so_set_announcement_active/);
 assert.match(ui,/announcement-gallery/);
 assert.match(ui,/scroll-snap-type:x mandatory/);
 assert.match(ui,/announcement-edit/);
 assert.match(ui,/announcement-toggle/);
 assert.match(ui,/announcement-images/);
});

test("FR-110/C39: current inline booking script is valid JS",()=>{
 const scripts=[...ui.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,1);
 const source=scripts[0][1].replace(/^import\s+\{createClient\}[^;]+;/m,"const createClient=()=>{};");
 assert.doesNotThrow(()=>new vm.Script(source));
});
