import {lineState} from "../state/lineState.js";
import {routeState} from "../state/routeState.js";
import {box,btn,esc} from "../shared-ui.js";

const eyeIcon='<svg class="oa-eye-open" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>'+
 '<svg class="oa-eye-closed" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" hidden><path d="M3 3l18 18M10.6 5.1A11.9 11.9 0 0 1 12 5c6.4 0 10 7 10 7s-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path d="M3 3l18 18"/></svg>';

function newCredentialField(label,id,placeholder){
 return '<div class="oa-credential-field"><label for="'+id+'">'+esc(label)+'</label>'+
  '<div class="oa-credential-input"><input id="'+id+'" class="field" type="password" value=""'+
  ' autocomplete="new-password" placeholder="'+esc(placeholder)+'" spellcheck="false" autocapitalize="off">'+
  '<button type="button" class="oa-eye-btn" data-act="toggle-oa-visibility" data-target="'+id+
  '" aria-label="顯示新輸入的 '+esc(label)+'" aria-pressed="false" title="顯示／隱藏新輸入的憑證">'+eyeIcon+'</button></div></div>';
}

function savedCredential(label){
 // This is a purely decorative, unselectable mask. It is NOT an input and
 // does not contain or fetch the stored secret.
 return '<div class="oa-credential-field"><span class="oa-field-label">'+esc(label)+'</span>'+
   '<div class="oa-saved-credential" aria-label="'+esc(label)+' 已安全儲存，不能檢視或複製">'+
   '<span class="oa-mask-symbol" aria-hidden="true"></span><strong>已安全儲存</strong>'+
   '<span class="oa-mask-lock" aria-hidden="true">🔒</span></div></div>';
}

export function renderOaSettings({isManager}){
 const connected=!!lineState.lineConfig?.merchantOaConnected;
 const account=lineState.lineConfig?.botBasicId||"";
 const replacing=connected&&lineState.oaReplacing===true&&lineState.oaReplacingSlug===routeState.slug;
 const webhook=lineState.LINE_BRIDGE_URL+"?action=webhook&merchant="+encodeURIComponent(routeState.slug);
 const status='<div class="oa-status-row"><div><span class="oa-overline">MESSAGING API</span>'+
  '<h3>店家 LINE OA</h3><p class="oa-summary">使用店家自己的 LINE 官方帳號。</p></div>'+
  '<span class="oa-connection-chip '+(connected?'is-connected':'is-unbound')+'">'+
  (connected?'已連接':'尚未連接')+'</span></div>';
 const accountInfo=connected?
  '<div class="oa-account-info"><span>已綁定帳號</span><strong>'+esc(account||"LINE 官方帳號")+'</strong></div>':
  '<p class="oa-unbound-help">請填寫兩項 LINE Messaging API 憑證，完成綁定。</p>';
 let setup='';
 if(isManager){
  setup='<div class="oa-step-title"><strong>Messaging API 憑證</strong>'+
   '<span>'+(connected&&!replacing?'已儲存，不需重新填寫':'從 LINE Developers 取得')+'</span></div>'+
   '<div class="oa-credential-grid">'+
    (connected&&!replacing?
      savedCredential("Channel access token (long-lived)")+
      savedCredential("Channel secret"):
      newCredentialField("Channel access token (long-lived)","own-oa-token","Messaging API → Issue")+
      newCredentialField("Channel secret","own-oa-secret","Basic settings → Channel secret"))+
   '</div>'+
   (connected&&!replacing?'<p class="oa-safety-note">基於安全考量，已儲存的憑證不會載入網頁，也無法檢視或複製。需要更換時，請重新輸入新憑證。</p>':'')+
   (connected?'<div class="oa-webhook-section"><div class="oa-step-title"><strong>Webhook URL</strong><span>在 LINE Messaging API 啟用 Use webhook</span></div>'+
     '<div class="oa-webhook-entry"><input id="own-oa-webhook" class="field" type="text" readonly value="'+esc(webhook)+'" aria-label="Webhook URL">'+
     '<button class="btn outline" type="button" data-act="copy-oa-webhook">複製網址</button></div></div>':'')+
   ((!connected||replacing)?
    '<details class="oa-advanced"><summary>進階設定：LINE Login／LIFF（選填）</summary>'+
     '<div class="oa-advanced-content"><label for="own-oa-liff">LIFF ID</label>'+
     '<input id="own-oa-liff" class="field" type="text" autocomplete="off" value="'+
      esc(connected?(lineState.lineConfig?.merchantLiffId||""):"")+
     '" placeholder="不需要可留空"><p>一般 LINE OA 串接不需要填寫 LIFF ID。</p></div></details>':
    '<details class="oa-advanced"><summary>進階設定：LINE Login／LIFF</summary>'+
     '<div class="oa-advanced-content"><p>一般 LINE OA 串接不需要 LIFF ID；如須更換進階設定，請選「更換憑證」。</p></div></details>')+
   '<div class="oa-settings-actions">'+
     (connected&&!replacing?
       btn("更換憑證","replace-own-oa","outline")+
       btn("解除綁定","disconnect-own-oa","outline"):
       btn(connected?"儲存並驗證新憑證":"驗證並連接 LINE OA","connect-own-oa","primary")+
       (replacing?btn("取消更換","cancel-replace-own-oa","outline"):""))+
   '</div>';
 }else{
  setup='<p class="oa-read-only">僅店家管理者可管理 LINE OA 憑證。</p>';
 }
 const footer='<div class="oa-guide-link"><a href="./merchant-center.html#mode-own" target="_blank" rel="noopener noreferrer">查看 LINE OA 串接教學 ↗</a>'+
  '<span>Webhook 網址可複製；Token 與 Secret 不提供複製。</span></div>';
 return box("LINE 官方帳號串接",'<div class="oa-settings">'+status+accountInfo+setup+footer+'</div>');
}
