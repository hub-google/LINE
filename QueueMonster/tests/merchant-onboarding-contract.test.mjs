import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "./helpers/source-fs.mjs";
import {spawnSync} from "node:child_process";
import vm from "node:vm";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(path.join(root,p),"utf8");
const reg=read("saas/merchant-register.html");
const headquarters=read("saas/platform-login.html");
const index=read("saas/index.html");
const directory=read("saas/directory.html");
const sql=read("supabase/migrations/20261106102500_merchant_account_onboarding_and_privacy.sql");
const cleanup=read("supabase/migrations/20261106103000_disable_qa_recovery.sql");

test("Google login comes before Email on both signup and login tabs",()=>{
 const logic=read("saas/assets/merchant-register/main.js");
 const styles=read("saas/assets/merchant-register/page.css");
 for(const id of ["tab-login","tab-signup","google-auth","signup-email","login-email","login-pass","verify-email-stage","resend-signup-email","change-signup-email"]){
  assert.match(reg,new RegExp('id="'+id+'"'));
 }
 assert.ok(reg.indexOf('id="google-auth"')<reg.indexOf('id="login-email"'));
 assert.ok(reg.indexOf('id="google-auth"')<reg.indexOf('id="signup-email"'));
 assert.match(styles,/\.google-auth-button/);
 assert.match(logic,/signInWithOAuth\(\{provider:"google"/);
 assert.match(logic,/skipBrowserRedirect:true/);
 assert.match(logic,/returnToLogin\(\)/);
 assert.match(logic,/user_metadata\?\.full_name/);
});
test("only Email accounts can open or save a local password in the merchant portal",()=>{
 const logic=read("saas/assets/merchant-register/main.js");
 assert.match(logic,/hasEmailCredential\(user\)/);
 assert.match(logic,/classList\.toggle\("hidden",!hasEmailCredential\(user\)\)/);
 assert.match(logic,/if\(!hasEmailCredential\(authUser\)\)throw Error/);
});

test("Email registration verifies ownership before password creation",()=>{
 const logic=read("saas/assets/merchant-register/main.js");
 assert.doesNotMatch(reg,/id="signup-pass"|id="signup-confirm"/);
 assert.match(logic,/signupSb\.auth\.signInWithOtp/);
 assert.match(logic,/shouldCreateUser:false,emailRedirectTo:new URL/);
 assert.match(logic,/shouldCreateUser:true,emailRedirectTo:returnToSignup\(\)/);
 assert.match(logic,/queue_monster_password_pending:true/);
 assert.match(logic,/intent==="complete-signup"/);
 assert.match(logic,/auth\.updateUser\(update\)/);
 assert.match(logic,/resetPasswordForEmail/);
 assert.match(logic,/signInWithPassword/);
 assert.doesNotMatch(logic,/signupSb\.auth\.signUp/);
 assert.match(logic,/persistSession:false,autoRefreshToken:false,detectSessionInUrl:false/);
 assert.match(logic,/if\(active==="signup"\)\{showAuth\(null\);return\}/);
 assert.match(logic,/functions\.invoke\("staff-complete-setup"/);
 assert.match(logic,/rpc\("so_start_merchant"\)/);
 assert.match(read("saas/merchant-center.html"),/merchant-register\.html\?mode=signup/);
 assert.match(read("supabase/migrations/20261110143200_queue_monster_email_only_merchant_registration.sql"),/rename column username to internal_code/);
});
test("new stores start private and are published only after settings are saved",()=>{
 assert.match(sql,/onboarding_complete boolean not null default true/);
 assert.match(sql,/directory_enabled,onboarding_complete/);
 assert.match(sql,/false,false/);
 assert.match(sql,/so_complete_merchant_onboarding/);
 assert.match(index,/onboarding_complete===false/);
 const i=index.indexOf('if(a==="update-settings")');
 assert.ok(i>0);
 const settings=index.slice(i,i+2100);
 assert.ok(settings.indexOf('so_update_tenant')>0);
 assert.ok(settings.indexOf('so_complete_merchant_onboarding')>settings.indexOf('so_update_tenant'));
 assert.match(sql,/t\.onboarding_complete = true/);
});
test("retired QA entry points and customer-facing test copy are absent",()=>{
 assert.doesNotMatch(directory,/測試|demo-link|qa-84b3/);
 assert.doesNotMatch(index,/if\(a==="test-login"\)|if\(a==="recover-test-store"\)/);
 for(const name of ["home","directory","merchant-register","platform-login","merchant-center","board","terms","privacy"]){
  assert.doesNotMatch(read("saas/"+name+".html"),/測試/,name);
 }
 assert.match(sql,/revoke all on function public\.so_test_login/);
 assert.match(cleanup,/revoke all on function public\.so_claim_qa_recovery/);
});


test("customer-facing login and registration errors are always shown in Chinese",()=>{
 const source=read("saas/assets/merchant-register/main.js");
 const begin=source.indexOf("function customerFacingError(");
 const end=source.indexOf("\n}",begin)+2;
 assert.ok(begin>=0&&end>begin);
 const method=source.slice(begin,end);
 const sharedFormatter=read("saas/app/auth-errors.js").replace("export function formatAuthError","function formatAuthError");
 const translated=(error,operation="general")=>vm.runInNewContext(sharedFormatter+"\n"+method+"\ncustomerFacingError("+JSON.stringify(error)+","+JSON.stringify(operation)+")");
 assert.equal(translated({message:"Invalid login credentials"}),"電子信箱或密碼不正確，請重新輸入。");
 assert.equal(translated({code:"weak_password"}),"密碼不符合目前登入服務設定，請重新輸入。");
 assert.match(translated({code:"email_not_confirmed",message:"Email not confirmed"}),/電子信箱尚未完成驗證/);
 assert.match(translated({code:"user_already_exists",message:"User already registered"}),/已經註冊/);
 assert.match(translated({message:"Email rate limit exceeded"}),/操作太頻繁/);
 assert.match(translated({message:"NetworkError when attempting to fetch resource."}),/網路連線異常/);
 assert.equal(translated({message:"只有店家負責人可完成開店設定"}),"只有店家負責人可完成開店設定");
 assert.match(translated({message:"Unhandled PostgREST internal error"}, "login"),/登入失敗/);
 assert.doesNotMatch(translated({message:"Unhandled PostgREST internal error"}, "login"),/[a-z]{3,}/i);
 assert.match(source,/catch\(error\)\{msg\(customerFacingError\(error,/);
 assert.doesNotMatch(source,/msg\(error\.message/);
 const shared=read("saas/app/shared-ui.js");
 const app=read("saas/app/data-loading.js");
 const line=read("saas/app/line-session.js");
 assert.ok(shared.includes("export function customerFacingError("));
 assert.match(shared,/formatAuthError\(error,operation\)/);
 assert.ok(app.includes("feedbackState.err=customerFacingError(e)"));
 assert.ok(app.includes("throw Error(customerFacingError(r.error))"));
 assert.ok(line.includes('customerFacingError(e,"line")'));
});

test("published merchant login source does not contain a hardcoded administrator account",()=>{
 const publicScript=read("saas/assets/merchant-register/main.js");
 assert.doesNotMatch(publicScript,/[a-zA-Z0-9._%+-]+@gmail\.com/i);
 assert.doesNotMatch(publicScript,/service_role|sb_secret_|LINE_CHANNEL_SECRET|ADMIN_PASSWORD/i);
 assert.doesNotMatch(publicScript,/so_claim_verified_platform_owner|qm-admin-login|if\(password\.length===1\)/);
 assert.match(publicScript,/rpc\("so_my_context"\)/);
 assert.match(publicScript,/location\.replace\("\.\/platform-login\.html"\)/);
});

test("platform PIN login uses server-side throttle and a real authenticated session",()=>{
 const edge=read("supabase/functions/qm-admin-login/index.ts");
 const migration=read("supabase/migrations/20261106195600_platform_admin_pin_gate.sql");
 assert.ok(headquarters.includes("functions/v1/qm-admin-login"));
 assert.ok(headquarters.includes("sb.auth.setSession("));
 assert.ok(headquarters.includes("so_claim_verified_platform_owner"));
 assert.ok(edge.includes("qm_admin_pin_check"));
 assert.ok(edge.includes("auth.admin.generateLink"));
 assert.ok(edge.includes("verifyOtp"));
 assert.ok(migration.includes("locked_until"));
 assert.ok(migration.includes("to service_role;"));
 assert.ok(!headquarters.includes('pin==="9"'));
 assert.ok(!migration.includes("crypt('9'"));
});

test("headquarters navigation only appears for a verified platform administrator",()=>{
 const shared=read("saas/app/shared-ui.js");
 const view=read("saas/app/platform-view.js");
 assert.ok(shared.includes('view==="platform"?'));
 assert.ok(shared.includes('view==="staff"?'));
 assert.ok(shared.includes('["headquarters","總部管理"]'));
 assert.ok(shared.includes('["merchant","店家工作台"]'));
 assert.doesNotMatch(shared,/\["marketing","網站首頁"\],\["platform","平台管理"\]/);
 assert.match(view,/if\(!authReady\(\)\)return box\("總部管理員登入"/);
 assert.match(view,/href="\.\/platform-login\.html"/);
});
test("headquarters login is an independent branded route and does not expose privileged links to ordinary merchants",()=>{
 const source=read("saas/assets/platform-login/main.js");
 const merchant=read("saas/assets/merchant-register/main.js");
 const styles=read("saas/assets/merchant-register/page.css");
 const page=read("saas/platform-login.html");
 assert.match(page,/總部管理員登入/);
 assert.match(page,/id="hq-login-form"/);
 assert.match(page,/id="hq-password"/);
 assert.match(page,/functions\/v1\/qm-admin-login/);
 assert.doesNotMatch(page,/@gmail\.com|service_role|sb_secret_|qm_admin_pin_check/);
 assert.match(source,/sb\.rpc\("so_my_context"\)/);
 assert.match(source,/so_claim_verified_platform_owner/);
 assert.match(source,/data\?\.platform_admin===true/);
 assert.match(source,/location\.replace\("\.\/\?view=platform"\)/);
 assert.match(source,/if\(!await goToHeadquarters\(\)\)/);
 assert.match(source,/await sb\.auth\.signOut\(\)/);
 assert.doesNotMatch(merchant,/functions\/v1\/qm-admin-login|進入平台總管理後台/);
 assert.match(merchant,/location\.replace\("\.\/platform-login\.html"\)/);
 assert.match(reg,/class="account-actions"/);
 assert.match(reg,/<button class="ghost" type="button" id="logout">登出<\/button>/);
 assert.match(styles,/\.account-actions\{display:grid/);
 assert.match(styles,/\.account-actions>#logout\{position:static/);
 for(const pageName of ["home","directory","merchant-register"]){
  const html=read("saas/"+pageName+".html");
  assert.doesNotMatch(html,/href="\.\/platform-login\.html"/);
 }
});
test("customer, merchant and headquarters views never mix login and navigation links",()=>{
 const homepage=read("saas/home.html");
 const directory=read("saas/directory.html");
 const merchant=read("saas/merchant-register.html");
 const guide=read("saas/merchant-center.html");
 const hq=read("saas/platform-login.html");
 const platform=read("saas/app/platform-view.js");
 const shared=read("saas/app/shared-ui.js");
 for(const html of [homepage,directory]){
  assert.doesNotMatch(html,/href="[^"]*(?:merchant-register|platform-login|view=staff|view=platform)/);
 }
 assert.doesNotMatch(merchant,/href="[^"]*(?:directory\.html|home\.html|platform-login\.html|view=platform)/);
 assert.match(guide,/id="marketing-header"/,"public merchant guide uses shared marketing navigation");
 assert.match(read("saas/assets/marketing/shared-header.js"),/\["搜尋店家","\.\/directory\.html\?mode=search"/);
 assert.doesNotMatch(hq,/href="[^"]*(?:directory\.html|home\.html|merchant-register\.html|view=staff)/);
 assert.doesNotMatch(platform,/class="side-item" href="merchant-register\.html/);
 assert.match(shared,/view==="platform"/);
 assert.match(shared,/view==="staff"/);
 assert.match(shared,/\["browse","搜尋店家"\]/);
 const auth=read("saas/site-auth.js");
 assert.ok(auth.includes('return lineIdentity'));
 assert.ok(auth.includes("return operatorIdentity"));
});
test("merchant can independently enable reservation, queue and pickup via shared service controls",()=>{
 const modes=read("supabase/migrations/20261109093000_merchant_service_mode_switch.sql");
 const guide=read("saas/merchant-center.html");
 assert.ok(index.includes('id="set-service-reservation"'));
 assert.ok(index.includes('id="set-service-queue"'));
 assert.ok(index.includes('if(a==="save-service-modes")'));
 assert.ok(index.includes('rpc("so_set_all_merchant_services"'));
  assert.ok(index.includes('id="set-service-pickup"'));
  assert.ok(index.includes("p_pickup:pickup"));
  const unified=read("supabase/migrations/20261111171500_pickup_atomic_services_and_popular.sql");
  assert.ok(unified.includes("so_set_merchant_services(p_slug,p_reservation,p_queue)"));
  assert.ok(unified.includes("insert into public.so_pickup_settings"));
 assert.ok(index.includes("p_reservation:reservation,p_queue:queue"));
 assert.ok(guide.includes("儲存服務開關"));
 assert.ok(modes.includes("private.so_role(v_t.id)"));
 assert.ok(modes.includes("('OWNER','MANAGER')"));
 assert.ok(modes.includes("coalesce(v_t.modules,'{}'::jsonb)"));
 assert.ok(modes.includes("jsonb_build_object('reservation',p_reservation,'queue',p_queue,'calling',v_calling)"));
 assert.ok(modes.includes("grant execute on function public.so_set_merchant_services"));
 assert.ok(!modes.includes("grant execute on function public.so_set_merchant_services(text,boolean,boolean) to anon"));
});

test("only active services appear in public entry points, preserving older ticket work",()=>{
 assert.ok(index.includes('m.reservation?nav("線上預約"'));
 assert.ok(index.includes('m.queue?nav("現場取號"'));
 assert.ok(index.includes('if(!m.reservation)html=box("未開放預約"'));
 assert.ok(index.includes('if(!m.queue)html=box("尚未開放取號"'));
 assert.ok(directory.includes("primaryHref=services.reservation?reserveHref:services.queue?queueHref:"));
 assert.ok(directory.includes("services.queue&&services.calling"));
 assert.ok(read("supabase/migrations/20261109093000_merchant_service_mode_switch.sql").includes("already issued numbers"));
 const scriptStart=index.indexOf('<script type="module">');
 const scriptEnd=index.indexOf("</script>",scriptStart);
 const module=scriptStart>=0&&scriptEnd>scriptStart?index.slice(scriptStart+'<script type="module">'.length,scriptEnd):"";
 assert.ok(module,"main booking page requires an executable module");
 const checked=spawnSync(process.execPath,["--input-type=module","--check"],{input:module,encoding:"utf8"});
 assert.equal(checked.status,0,checked.stderr);
});

test("platform enterprise settings reuses the merchant backend rather than a second form",()=>{
 assert.ok(index.includes('route("staff",t.slug)+"&tab=settings"'),"settings link opens this tenant's staff settings");
 assert.ok(read("saas/app/route-state.js").includes('["dashboard","bookings","queue","orders","calendar","units","analytics","menu","members","branches","settings","customers"].includes(incomingParam("tab"))'),"deep links select only supported staff tabs");
 assert.ok(index.includes('context?.platform_admin||context?.memberships?.some(m=>m.slug===slug)'),"platform owners can access merchants without membership");
 assert.ok(index.includes('if(a==="toggle-company")'),"platform remains able to suspend and resume companies");
 assert.ok(index.includes('const target=b.dataset.slug'),"suspend action targets the selected row's slug");
 assert.ok(!index.includes('if(a==="company-config")'),"do not render platform-only merchant settings");
 assert.ok(!index.includes('if(a==="save-company")'),"do not keep duplicate settings save handler");
 assert.ok(!index.includes('merchantProfileFields("config"'),"do not render duplicate configuration form");
 assert.ok(index.includes('merchantProfileFields("create"'),"platform can still create companies");
});

test("platform action buttons match and account logout lives only in the shared header",()=>{
 const styles=read("saas/monster-world.css");
 const sharedAuth=read("saas/site-auth.js");
 const start=index.indexOf("function layout("),end=index.indexOf("function head()",start);
 assert.ok(start>0&&end>start);
 const layout=index.slice(start,end);
 assert.ok(!layout.includes('btn("登出","logout"'),"no duplicate logout in toolbar or mobile navigation");
 assert.ok(!layout.includes("identityLabel"),"no duplicate account line inside toolbar");
 assert.ok(index.includes('id="site-auth-root"'),"retain shared account header");
 assert.ok(sharedAuth.includes('const logout=el("button","site-auth-button","登出")'),"header still supports signout");
 assert.ok(index.includes('class="platform-row-actions"'),"group the three actions");
 assert.ok(index.includes('class="btn outline" href='),"both navigation actions are buttons");
 assert.ok(index.includes('btn(t.status==="ACTIVE"?"暫停":"恢復","toggle-company","outline"'),"preserve suspend/resume action");
 assert.ok(styles.includes("grid-template-columns:repeat(3,minmax(0,1fr))"),"each button gets an equal column");
 assert.ok(styles.includes(".platform-row-actions>.btn"),"shared button sizing styles are present");
});

test("production release contains no customer-visible QA or infrastructure copy",()=>{
 const publicPages=["index","home","directory","board","merchant-register","platform-login","merchant-center","privacy","terms","template"];
 for(const name of publicPages){
  const html=read("saas/"+name+".html");
  assert.ok(!html.includes("測試"),name+" must not expose test labels");
  assert.ok(!html.includes("資料庫"),name+" must not describe storage technology to customers");
  assert.ok(!html.includes("LINE BOOKING ·"),name+" must use the Queue Monster brand");
 }
 assert.ok(!index.includes("testMode")&&!index.includes("recoveryMode"),"legacy QA sign-ins have been removed");
 assert.doesNotMatch(read("saas/app/data-loading.js"),/startsWith\("qa-"\)|greenfield-salon|demo-clinic/,"dashboard must not hide stores by identifier");
 assert.doesNotMatch(read("saas/explore-game.js"),/startsWith\("qa-"\)|greenfield-salon|demo-clinic/,"public discovery must use publication settings");
 assert.ok(!directory.includes("testBoardShop")&&!directory.includes("demoShops"),"no sample merchants can be injected into discovery");
 const game=read("saas/explore-game.js");
 assert.ok(!game.includes("qaStore")&&!game.includes("demoShops"),"game mode uses published merchants only");
 assert.ok(!read("saas/privacy.html").includes("Supabase"),"privacy document describes service providers in customer terms");
 assert.ok(!read("saas/merchant-register.html").includes("密碼由 Supabase Auth"),"account help stays customer-focused");
 assert.ok(read("saas/template.html").includes("merchant-center.html#setup"),"retired preview directs visitors to live merchant guide");
});

test("merchant LINE OA onboarding never requires or displays webhook configuration",()=>{
 const settings=read("saas/app/staff/settings.js");
 const actions=read("saas/app/actions/merchant-settings.js");
 const guide=read("saas/merchant-center.html");
 assert.match(settings,/驗證並連接 Messaging API/);
 assert.match(settings,/own-oa-token/);
 assert.doesNotMatch(settings,/複製 Webhook URL|copy-own-oa-webhook|Use webhook/);
 assert.doesNotMatch(actions,/copy-own-oa-webhook|請設定 Webhook URL/);
 assert.doesNotMatch(guide,/複製 Webhook URL|Use webhook|訊息回傳網址/);
});
