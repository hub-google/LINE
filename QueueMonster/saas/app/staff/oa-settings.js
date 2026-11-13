import {lineState} from "../state/lineState.js";
import {routeState} from "../state/routeState.js";
import {box,btn,esc} from "../shared-ui.js";

const eyeIcon='<svg class="oa-eye-open" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>'+
 '<svg class="oa-eye-closed" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" hidden><path d="M3 3l18 18M10.6 5.1A11.9 11.9 0 0 1 12 5c6.4 0 10 7 10 7a17.5 17.5 0 0 1-3.2 3.8M6.4 6.5C3.6 8.4 2 12 2 12s3.6 7 10 7c1.5 0 2.9-.4 4.1-1"/><path d="M10 10a3 3 0 0 0 4 4"/></svg>';

function credentialField(label,id,value,placeholder,readonly=false){
 return '<div class="oa-credential-field"><label for="'+id+'">'+esc(label)+'</label>'+
  '<div class="oa-credential-input"><input id="'+id+'" class="field" type="password" value="'+esc(value)+'"'+
  (readonly?' readonly':' autocomplete="new-password"')+
  (placeholder?' placeholder="'+esc(placeholder)+'"':'')+
  ' spellcheck="false" autocapitalize="off" autocomplete="off">'+
  '<button type="button" class="oa-eye-btn" data-act="toggle-oa-visibility" data-target="'+id+
  '" aria-label="顯示 '+esc(label)+'" aria-pressed="false" title="顯示／隱藏內容">'+eyeIcon+'</button></div></div>';
}

export function renderOaSettings({isManager}){
 const connected=!!lineState.lineConfig?.merchantOaConnected;
 const account=lineState.lineConfig?.botBasicId||"";
 const creds=lineState.oaCredentialsSlug===routeState.slug?lineState.oaCredentials:null;
 const token=typeof creds?.botToken==="string"?creds.botToken:"";
 const secret=typeof creds?.channelSecret==="string"?creds.channelSecret:"";
 const webhook=lineState.LINE_BRIDGE_URL+"?action=webhook&merchant="+encodeURIComponent(routeState.slug);
 const status='<div class="oa-status-row"><div><span class="oa-overline">MESSAGING API</span>'+
  '<h3>店家 LINE OA</h3><p class="oa-summary">用自己的官方帳號回覆顧客訊息。</p></div>'+
  '<span class="oa-connection-chip '+(connected?'is-connected':'is-unbound')+'">'+
  (connected?'已連接':'尚未連接')+'</span></div>';
 const accountInfo=connected?
  '<div class="oa-account-info"><span>目前連接</span><strong>'+esc(account||"LINE 官方帳號")+'</strong></div>':
  '<p class="oa-unbound-help">尚未綁定。準備下方兩項憑證，就可以連接自己的 LINE OA。</p>';
 let setup='';
 if(isManager){
  const loadingWarning=connected&&!creds?
   '<p class="oa-read-warning" role="status">'+esc(lineState.oaCredentialReadError||"已連接，但暫時無法讀取儲存的憑證；請重新整理後再試。")+'</p>':"";
  setup='<div class="oa-step-title"><strong>憑證設定</strong><span>從 LINE Developers 複製兩項資料</span></div>'+
   loadingWarning+
   '<div class="oa-credential-grid">'+
    credentialField("Channel access token (long-lived)","own-oa-token",token,"Messaging API → Issue")+
    credentialField("Channel secret","own-oa-secret",secret,"Basic settings → Channel secret")+
   '</div>'+
   (connected?'<div class="oa-webhook-section"><div class="oa-step-title"><strong>Webhook 網址</strong><span>複製到 LINE Messaging API，並開啟 Use webhook</span></div>'+
    credentialField("Webhook URL","own-oa-webhook",webhook,"",true)+'</div>':'')+
   '<details class="oa-advanced"><summary>進階設定 · 店家專用 LINE Login／LIFF（選填）</summary>'+
    '<div class="oa-advanced-content"><label for="own-oa-liff">LIFF ID</label>'+
    '<input id="own-oa-liff" class="field" type="text" autocomplete="off" value="'+
     esc(connected?(lineState.lineConfig?.merchantLiffId||""):"")+
    '" placeholder="不需要可留空"><p>一般串接不需要 LIFF ID。只有使用店家自己的 LINE Login 時才設定。</p></div></details>'+
   '<div class="oa-settings-actions">'+
    btn(connected?"驗證並更新設定":"驗證並連接 LINE OA","connect-own-oa","primary")+
    (connected?btn("解除綁定","disconnect-own-oa","outline"):"")+
   '</div>';
 }else{
  setup='<p class="oa-read-only">只有店家管理者可以查看或修改憑證。</p>';
 }
 const footer='<div class="oa-guide-link"><a href="./merchant-center.html#mode-own" target="_blank" rel="noopener noreferrer">查看 LINE OA 串接教學 ↗</a>'+
  '<span>未綁定的門市不會收到店家 LINE 通知。</span></div>';
 return box("LINE 官方帳號串接",'<div class="oa-settings">'+status+accountInfo+setup+footer+'</div>');
}
