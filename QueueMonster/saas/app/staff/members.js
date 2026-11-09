import {staffState} from "../state/staffState.js";

import {box,btn,esc,field,tag} from "../shared-ui.js";

export function renderStaffMembers({isManager,html}){
  html+=box("已加入的員工",'<div class="scroll"><table class="rows"><tr><th>帳號</th><th>角色</th></tr>'+ (staffState.staff.members||[]).map(m=>'<tr><td>'+esc(m.email||('驗證員工（Auth ID '+String(m.user_id||'').slice(0,8)+'）'))+'</td><td>'+esc(m.role)+'</td></tr>').join("")+'</table></div>')+
  box("待接受邀請",(staffState.staff.invites||[]).map(i=>'<div class="listline"><span>'+esc(i.email)+'</span>'+tag(i.role)+'</div>').join("")||'<p class="muted">尚無邀請</p>')+
  (isManager?box("邀請企業員工",field("員工 Email","invite-email","","email")+'<label>角色</label><select id="invite-role" class="field"><option value="STAFF">員工</option><option value="MANAGER">管理者</option><option value="OWNER">負責人</option></select><div style="margin-top:15px">'+btn("送出邀請","invite-staff","primary")+'</div><p class="small">員工使用同一 Email 註冊、驗證後，登入即可接受邀請。</p>'):"");

return html;
}
