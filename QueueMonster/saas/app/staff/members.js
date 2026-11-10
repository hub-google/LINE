import {staffState} from "../state/staffState.js";
import {box,btn,esc,field,tag} from "../shared-ui.js";

const roleName={STAFF:"員工",MANAGER:"管理者",OWNER:"負責人"};

export function renderStaffMembers({isManager,html}){
 const members=staffState.staff.members||[];
 const invites=staffState.staff.invites||[];
 html+=box("已加入的員工",
  '<div class="scroll"><table class="rows"><tr><th>帳號</th><th>角色</th></tr>'+
  members.map(m=>'<tr><td>'+esc(m.email||('驗證員工（Auth ID '+String(m.user_id||'').slice(0,8)+'）'))+'</td><td>'+esc(roleName[m.role]||m.role)+'</td></tr>').join("")+
  '</table></div>')+
 box("待接受邀請",
  invites.length?invites.map(i=>
    '<div class="listline"><span><b>'+esc(i.email)+'</b><small class="muted" style="display:block">尚未接受邀請</small></span>'+
    tag(roleName[i.role]||i.role)+
    (isManager?btn("複製邀請連結","copy-staff-invite","outline",'data-id="'+esc(i.id)+'"'):"")+
    '</div>').join(""):'<p class="muted">尚無待接受的邀請</p>')+
 (isManager?box("邀請企業員工",
   '<p class="muted">受邀員工會收到登入／接受邀請的 Email；如果信件未送達，可以複製上方邀請連結傳給對方。</p>'+
   field("員工 Email","invite-email","","email")+
   '<label for="invite-role">角色</label><select id="invite-role" class="field">'+
   '<option value="STAFF">員工</option><option value="MANAGER">管理者</option>'+(["OWNER","PLATFORM"].includes(staffState.staff.role)?'<option value="OWNER">負責人</option>':"")+'</select>'+
   '<div style="margin-top:15px">'+btn("寄送邀請","invite-staff","primary")+'</div>'+
   '<p class="small">員工以受邀的 Email 登入，確認加入企業後才會取得指定權限。寄信失敗不會顯示已寄送成功。</p>'
  ):"");
 return html;
}
