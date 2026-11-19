export const MODES = ['monitor', 'assist', 'auto'];
export const ACTIONS = ['delete_message', 'remove_member', 'block_member', 'send_notice'];
export function planActions({ community, risk, privileged = false }) {
  if (!community || privileged || community.mode !== 'auto' || risk.level !== 'critical' || !risk.autoEligible) return [];
  return [...ACTIONS];
}
export function formatNotice() {
  return '【AntiScam 防詐提醒】偵測到疑似詐騙／惡意導流內容，管理員已依社群規範處理。請勿點擊可疑連結、提供驗證碼或匯款。如有疑慮請洽社群管理員或撥打 165 反詐騙專線。';
}
