import {lineState} from "../state/lineState.js";
import {routeState} from "../state/routeState.js";
import {box,btn,esc} from "../shared-ui.js";

const eyeIcon='<svg class="oa-eye-open" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>'+
 '<svg class="oa-eye-closed" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" hidden><path d="M3 3l18 18M10.6 5.1A11.9 11.9 0 0 1 12 5c6.4 0 10 7 10 7s-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path d="M3 3l18 18"/></svg>';

const developersConsole="https://developers.line.biz/console/";

function developerSettingLink(tab){
 return '<a class="oa-field-console-link" href="'+developersConsole+'" target="_blank" rel="noopener noreferrer">開啟 LINE Developers → '+esc(tab)+' ↗</a>';
}

function newCredentialField(label,id,placeholder,tab){
 return '<div class="oa-credential-field"><label for="'+id+'">'+esc(label)+'</label>'+
  '<div class="oa-credential-input"><input id="'+id+'" class="field" type="password" value=""'+
  ' autocomplete="new-password" placeholder="'+esc(placeholder)+'" spellcheck="false" autocapitalize="off">'+
  '<button type="button" class="oa-eye-btn" data-act="toggle-oa-visibility" data-target="'+id+
  '" aria-label="顯示新輸入的 '+esc(label)+'" aria-pressed="false" title="顯示／隱藏新輸入的憑證">'+eyeIcon+'</button></div>'+developerSettingLink(tab)+'</div>';
}

function savedCredential(label,tab){
 // This is a purely decorative, unselectable mask. It is NOT an input and
 // does not contain or fetch the stored secret.
 return '<div class="oa-credential-field"><span class="oa-field-label">'+esc(label)+'</span>'+
   '<div class="oa-saved-credential" aria-label="'+esc(label)+' 已安全儲存，不能檢視或複製">'+
   '<span class="oa-mask-symbol" aria-hidden="true"></span><strong>已安全儲存</strong>'+
   '<span class="oa-mask-lock" aria-hidden="true">🔒</span></div>'+developerSettingLink(tab)+'</div>';
}

export function renderOaSettings({isManager}){
 const connected=!!lineState.lineConfig?.merchantOaConnected;
 const account=lineState.lineConfig?.botBasicId||"";
 const status='<div class="oa-status-row"><div><span class="oa-overline">MESSAGING API</span>'+
  '<h3>店家 LINE OA</h3><p class="oa-summary">把一次點餐，變成長期顧客關係。顧客完成點餐後，可引導加入店家 LINE OA 好友；加入後可在 LINE 接收、查閱訂單狀態通知，也能直接向店家詢問訂單或取餐問題。持續累積品牌好友，有助於提升回訪與回購機會。</p><p class="oa-summary">顧客需自行同意加入好友，系統不會強制自動加好友。</p></div>'+
  '<span class="oa-connection-chip '+(connected?'is-connected':'is-unbound')+'">'+
  (connected?'已連接':'尚未連接')+'</span></div>';
 const accountInfo=connected?
  '<div class="oa-account-info"><span>已綁定帳號</span><strong>'+esc(account||"LINE 官方帳號")+'</strong></div>':
  '<p class="oa-unbound-help">請填寫兩項 LINE Messaging API 憑證，完成綁定。</p>';
 let setup='';
 if(isManager){
  setup='<div class="oa-step-title"><strong>Messaging API 憑證</strong>'+
   '<span>'+(connected?'已儲存，不需重新填寫':'從 LINE Developers 取得')+'</span></div>'+
   '<p class="oa-console-hint">請到 <a href="'+developersConsole+'" target="_blank" rel="noopener noreferrer">LINE Developers Console ↗</a>，選擇店家官方帳號所屬的 Messaging API Channel，再取得下列憑證。</p>'+ 
   '<div class="oa-credential-grid">'+
    (connected?
      savedCredential("Channel access token (long-lived)","Messaging API → Channel access token")+
      savedCredential("Channel secret","Basic settings → Channel secret"):
      newCredentialField("Channel access token (long-lived)","own-oa-token","Messaging API → Issue","Messaging API → Channel access token")+
      newCredentialField("Channel secret","own-oa-secret","Basic settings → Channel secret","Basic settings → Channel secret"))+
   '</div>'+
   (connected?'<p class="oa-safety-note">基於安全考量，已儲存的憑證不會載入網頁，也無法檢視或複製。</p>':'')+
   (!connected?'<div class="oa-settings-actions">'+
     btn("驗證並連接 LINE OA","connect-own-oa","primary")+'</div>':'');
 }else{
  setup='<p class="oa-read-only">僅店家管理者可管理 LINE OA 憑證。</p>';
 }
 const footer='<div class="oa-guide-link"><a href="./merchant-center.html#mode-own" target="_blank" rel="noopener noreferrer">查看 LINE OA 串接教學 ↗</a>'+
  '<span>已儲存的 Token 與 Secret 不會在網頁上顯示或提供複製。</span></div>';
 return box("LINE 官方帳號串接",'<div class="oa-settings">'+status+accountInfo+setup+footer+'</div>');
}
