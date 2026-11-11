import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "./helpers/source-fs.mjs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {spawnSync} from "node:child_process";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=file=>readFileSync(path.join(root,file),"utf8");
const board=read("saas/board.html");
const publicSql=read("supabase/migrations/20261105132500_public_queue_board_without_login.sql");
const build=read("../.github/scripts/build-line-saas.mjs");
const deploy=read("../.github/workflows/line-saas-pages.yml");

test("TV board browser module parses and supports automatic deployment versioning",()=>{
  assert.match(board,/<meta name="line-saas-build" content="__LINE_SAAS_BUILD__">/);
  assert.match(board,/version-watch\.js\?build=__LINE_SAAS_BUILD__/);
  const scripts=[...board.matchAll(/<script\b[^>]*type=["']module["'][^>]*>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,1);
  const syntax=spawnSync(process.execPath,["--input-type=module","--check"],{input:scripts[0][1],encoding:"utf8"});
  assert.equal(syntax.status,0,syntax.stderr);
  assert.match(build,/"board\.html"/);
  assert.match(deploy,/for product in booking saas/);
  assert.match(deploy,/for f in [^\n]*index\.html[^\n]*home\.html[^\n]*board\.html/);
});

test("TV board reads privacy-safe store numbers publicly without LINE/Supabase sign-in",()=>{
  assert.match(board,/rpc\("so_public_board",\{p_slug:slug,p_limit:5\}\)/);
  assert.match(board,/data\.current/);
  assert.doesNotMatch(board,/\.padStart\(/);
  assert.doesNotMatch(board,/\.innerHTML\s*=/);
  assert.doesNotMatch(board,/service_role|supabase_service_role|customer_name|line_sub/i);
  assert.match(board,/textContent/);
  assert.match(board,/persistSession:false/);
  assert.doesNotMatch(board,/auth\.getSession|signInAnonymously/);
  assert.match(publicSql,/grant execute on function public\.so_public_board\(text,integer\) to anon,authenticated/);
  assert.match(publicSql,/p_slug text,p_limit integer default 5/);
  assert.doesNotMatch(publicSql,/auth\.uid\(\)|customer_name|customer_phone|line_sub/i);
});

test("public board and merchant/customer pages use one privacy-safe live-sync implementation",()=>{
  const migration=read("supabase/migrations/20261111133000_queue_board_realtime_broadcast.sql");
  const bookingMigration=read("supabase/migrations/20261111144500_shared_customer_merchant_booking_realtime.sql");
  const sync=read("saas/store-live-sync.js");
  const boardJs=read("saas/assets/board/main.js");
  const app=read("saas/app/startup.js");
  assert.match(publicSql,/so_queue_displays/);
  assert.match(board,/so_public_board/);
  assert.match(boardJs,/createStoreLiveSync/);
  assert.match(app,/createStoreLiveSync/);
  assert.match(app,/routeState.view==="customer"/);
  assert.match(app,/routeState.view==="staff"/);
  assert.match(sync,/client.channel\("queue-board:"\+slug/);
  assert.match(sync,/\.on\("broadcast",\{event:"invalidate"\}/);
  assert.match(sync,/if\(status==="SUBSCRIBED"\)/);
  assert.match(sync,/\["CHANNEL_ERROR","TIMED_OUT","CLOSED"\]/);
  assert.match(sync,/too_many_connections/);
  assert.match(sync,/tenant_events/);
  assert.match(sync,/setInterval\(tick,fallbackMs\)/);
  assert.match(sync,/fallbackMs=10000,reconcileMs=60000/);
  assert.match(board,/每 10 秒更新一次叫號/);
  assert.match(board,/叫號變動即時更新/);
  assert.match(board,/id="board-update-mode"/);
  assert.doesNotMatch(board,/id="refresh"|12 秒自動核對/);
  assert.match(board,/staleFromFailure/);
  assert.match(board,/lastSuccess/);
  assert.match(board,/requestFullscreen/);
  assert.match(board,/prefers-reduced-motion/);
  assert.match(sync,/document.addEventListener\("visibilitychange"/);
  assert.match(migration,/private.so_notify_queue_board_realtime\(\)/);
  assert.match(migration,/realtime.send\(/);
  assert.match(migration,/jsonb_build_object\('changed',true\)/);
  assert.match(bookingMigration,/after insert or update or delete on public.so_reservations/);
  assert.match(bookingMigration,/jsonb_build_object\('changed',true,'kind','reservation'\)/);
  assert.match(bookingMigration,/'queue-board:' \|\| v_slug/);
  assert.doesNotMatch(bookingMigration,/to_jsonb\(new\)|realtime.broadcast_changes/);
});

test("public board links bypass LINE login on the homepage, directory and merchant customer portal",()=>{
  const home=read("saas/home.html"),directory=read("saas/directory.html"),customer=read("saas/app/customer-booking.js");
  assert.match(home,/公開叫號看板/);
  assert.match(home,/directory\.html\?mode=queue/);
  assert.match(directory,/公開叫號看板/);
  assert.match(directory,/board\.html\?merchant=/);
  assert.match(directory,/original\.searchParams\.get\("view"\)!=="customer"\)return/);
  assert.match(customer,/if\(lineState\.lineLinkStatus!=="linked"\)/);
  assert.match(customer,/brandHeader/);
  assert.match(customer,/customer-entry-card/);
  assert.match(customer,/customer-public-board-link/);
  assert.match(customer,/\.\/board\.html\?merchant=/);
  assert.ok(customer.indexOf("customer-entry-card")<customer.indexOf("customer-public-board-link"));
  assert.doesNotMatch(customer,/box\("門市公開即時叫號"/);
});

test("inactive merchant board shows a stable unavailable state without repeated failing polls",()=>{
 assert.match(board,/if\(\/找不到商家\/\.test\(/);
 assert.match(board,/disabled=true;lastData=null;lastSuccess=null/);
 assert.match(board,/門市目前未開放叫號/);
 assert.doesNotMatch(board,/id="refresh"/);
 assert.match(read("saas/assets/board/main.js"),/isActive:\(\)=>!disabled/);
 assert.match(read("saas/store-live-sync.js"),/fallbackMs=10000/);
});


test("public board displays the saved merchant logo, brand color and platform attribution",()=>{
 const script=read("saas/assets/board/main.js");
 const theme=read("saas/monster-world.css");
 const migration=read("supabase/migrations/20261111103000_public_board_branding.sql");
 assert.match(board,/id="shop-logo"/);
 assert.match(board,/由排隊怪獸提供服務/);
 assert.match(script,/renderBoardBrand\(units\)/);
 assert.match(script,/--merchant-board-accent/);
 assert.match(theme,/Shop-powered queue board/);
 assert.match(migration,/'logo_url',t\.logo_url/);
 assert.match(migration,/'accent',t\.accent/);
});


test("guest sees merchant identity before LINE authentication without exposing customer records",()=>{
 const customer=read("saas/index.html");
 const front=read("saas/app/customer-booking.js");
 assert.match(customer,/so_unit_public_board/);
 assert.match(front,/publicBrand/);
 assert.match(front,/由排隊怪獸提供預約與取號服務/);
 assert.match(front,/customer-shop-avatar/);
});


test("merchant color overrides the old high-specificity purple board theme",()=>{
 const theme=read("saas/monster-world.css");
 const legacy="body:has(#single-board)>header";
 const override='body[data-monster-page="board"]:has(#single-board)>header';
 assert.ok(theme.includes(legacy),"legacy CSS regression check cannot locate the old rule");
 assert.ok(theme.includes(override),"merchant header must match the old ID specificity");
 assert.ok(theme.indexOf(override)>theme.indexOf(legacy),"merchant-specific override must come after the platform rule");
 assert.match(theme,/body\[data-monster-page="board"\]:has\(#single-board\)>header :is\(h1,#clock\)/);
 assert.match(theme,/body\[data-monster-page="board"\]:has\(#single-board\) \.panel\.current/);
 assert.match(theme,/body\[data-monster-page="board"\]:has\(#single-board\) #upcoming li:not\(\.empty\)/);
 assert.match(theme,/--merchant-board-contrast/);
});

test("board always fits the viewport using one measured-container layout",()=>{
 const css=read("saas/assets/board/page.css");
 const script=read("saas/assets/board/main.js");
 const fit=read("saas/assets/board/fullscreen-fit.js");
 assert.match(board,/<html lang="zh-Hant" class="board-fit">/);
 assert.match(css,/html\.board-fit body\s*\{/);
 assert.match(css,/grid-template-rows:auto auto minmax\(0,1fr\) auto/);
 assert.match(css,/html\.board-fit #single-board\[data-board-layout="side"\]/);
 assert.match(css,/html\.board-fit #single-board\[data-board-layout="stack"\]/);
 assert.match(css,/--board-queue-columns/);
 assert.match(css,/--board-queue-rows/);
 assert.match(css,/--board-current-font/);
 assert.match(css,/--board-next-font/);
 assert.match(css,/--board-unit-columns/);
 assert.match(css,/--board-unit-rows/);
 assert.match(css,/data-board-hidden/);
 assert.match(board,/id="board-page-indicator"/);
 assert.match(script,/installBoardFullscreenFit\(\)/);
 assert.match(script,/boardFit\.schedule\(\)/);
 assert.match(fit,/new ResizeObserver/);
 assert.match(fit,/getBoundingClientRect\(\)/);
 assert.match(fit,/bestGrid\(/);
 assert.match(fit,/area\.w\/area\.h/);
 assert.match(fit,/textFit\(/);
 assert.match(fit,/setInterval\(/);
 assert.doesNotMatch(fit,/screenWidth\s*[<>]=?\s*\d+/);
 assert.doesNotMatch(fit,/window\.innerWidth\s*[<>]=?\s*\d+/);
 assert.doesNotMatch(fit,/body\.style\.zoom\s*=/);
 assert.doesNotMatch(fit,/if\(!document\.fullscreenElement\)/);
 assert.match(fit,/document\.addEventListener\("fullscreenchange",schedule\)/);
 assert.match(fit,/\bschedule\(\);\s*return \{schedule\}/);
 const js=spawnSync(process.execPath,["--input-type=module","--check"],{input:fit,encoding:"utf8"});
 assert.equal(js.status,0,js.stderr);
});
