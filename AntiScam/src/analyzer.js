/** Pure, dependency-free risk engine. Runs in Node and the browser demo. */
const INVISIBLE = /[\u200B-\u200D\u2060\uFEFF]/g;
const replacements = Object.freeze({ 賺: '赚', 穩: '稳', 錢: '钱', 匯: '汇', 寶: '宝', 證: '证', 獲: '获', 轉: '转', 優: '优', 簡: '简', 聯: '联', 繫: '系', 詐: '诈', 騙: '骗', 點: '点', 擊: '击', 進: '进', 群: '群', 號: '号', 驗: '验', 碼: '码', 費: '费', 領: '领', 獎: '奖', 訊: '讯', 帳: '账', 網: '网', 廣: '广', 刷: '刷', 單: '单' });
export function normalizeText(input) {
  return String(input ?? '').normalize('NFKC').replace(INVISIBLE, '').toLowerCase()
    .split('').map(c => replacements[c] ?? c).join('').replace(/\s+/g, ' ').trim();
}
export function extractUrls(value) {
  const text = String(value ?? '');
  const matches = text.match(/https?:\/\/[^\s<>"'，。！）\])]+/giu) ?? [];
  return matches.map(u => {
    try { const url = new URL(u.replace(/[.,!?;:]+$/, '')); return { host: url.hostname.toLowerCase().replace(/\.$/, ''), url: url.href }; }
    catch { return null; }
  }).filter(Boolean).slice(0, 20);
}
export function redactPreview(value) {
  return String(value ?? '').replace(/https?:\/\/[^\s<>"'，。！）\])]+/giu, '[網址已隱藏]')
    .replace(/\b(?:\+?\d[\s-]?){9,15}\b/g, '[電話已隱藏]')
    .replace(/\b\S+@\S+\.\S+\b/g, '[信箱已隱藏]')
    .slice(0, 180);
}
export function hostMatchesBlocklist(host, domains = []) {
  return domains.some(domain => {
    const d = String(domain).trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
    return d && (host === d || host.endsWith(`.${d}`));
  });
}
const regexes = {
  guarantee: /(?:保证|保本|稳赚|零风险|高额报酬|翻倍收益|稳定获利|无风险获利|每日获利|获利保证)/iu,
  contact: /(?:私讯|私信|加(?:我|老师|客服)?(?:line|赖|telegram|tg|微信)|进群|加入群|联系(?:老师|客服)|扫描(?:qr|二维码)|点(?:击|此)?(?:链接|连结|網址|网址)|点我加入)/iu,
  transfer: /(?:立即|马上|先|请|必须|需要).{0,14}(?:汇款|转账|付款|缴费|充值|储值|保证金|手续费)/iu,
  credentials: /(?:提供|输入|回传|传送|填写|告诉|交出).{0,12}(?:验证码|otp|动态密码|简讯验证码|银行密码|登入密码)/iu,
  impersonation: /(?:官方客服|平台客服|管理员|管理員|金管会|证交所|公家机关).{0,30}(?:账户|账号|帐户|验证|转账|汇款|付款|点击)/iu,
  bait: /(?:限时领取|中奖通知|免费领取.*奖金|领取奖金|高薪兼职|轻松赚钱|在家赚钱)/iu,
};
const knownShorteners = new Set(['bit.ly', 'tinyurl.com', 'reurl.cc', 't.co', 'shorturl.at']);
/** No AI score by itself can authorize a kick/ban. */
export function analyzeMessage({ text, isNewMember = false, recentSameText = 0, recentMessages = 0, blockedDomains = [] } = {}) {
  const normalized = normalizeText(text);
  const urls = extractUrls(text);
  const reasons = [];
  let score = 0;
  const categories = new Set();
  const add = (code, value, category, detail) => { reasons.push({ code, score: value, detail }); score += value; if (category) categories.add(category); };
  const blocked = urls.find(u => hostMatchesBlocklist(u.host, blockedDomains));
  if (blocked) add('BLOCKED_DOMAIN', 95, '釣魚連結', '命中管理員確認的封鎖網域');
  if (regexes.guarantee.test(normalized)) add('GUARANTEED_RETURN', 30, '假投資', '疑似保證獲利宣傳');
  if (regexes.contact.test(normalized)) add('OFF_PLATFORM_CONTACT', 22, '惡意導流', '引導成員轉至私訊或外部聯絡方式');
  if (regexes.transfer.test(normalized)) add('PAYMENT_PRESSURE', 34, '收款詐騙', '要求匯款、儲值或先支付費用');
  if (regexes.credentials.test(normalized)) add('CREDENTIAL_REQUEST', 65, '帳密釣魚', '要求提供密碼或驗證碼');
  if (regexes.impersonation.test(normalized)) add('IMPERSONATION', 32, '假冒客服', '疑似冒充官方人員');
  if (regexes.bait.test(normalized)) add('BAIT', 20, '誘導詐騙', '疑似以獎金或高薪誘導');
  if (urls.some(u => knownShorteners.has(u.host))) add('SHORT_LINK', 12, '可疑網址', '使用縮網址，目的地尚未查證');
  if (recentSameText >= 2) add('REPEATED_SPAM', 36, '洗版', '短時間重複張貼相同內容');
  if (recentMessages >= 8) add('FLOOD', 25, '洗版', '短時間高頻率發話');
  if (isNewMember && score > 0) add('NEW_MEMBER', 8, null, '新加入成員觀察期');
  // Links strengthen existing fraud signals, but a URL alone does not constitute fraud.
  if (urls.length && reasons.some(r => ['GUARANTEED_RETURN', 'PAYMENT_PRESSURE', 'CREDENTIAL_REQUEST', 'IMPERSONATION', 'BAIT'].includes(r.code))) {
    add('RISKY_LINK_CONTEXT', 16, '可疑網址', '可疑文字同時包含外部網址');
  }
  // Keep anti-scam education and scam news from being escalated as recruitment when no payment/link/credential CTA exists.
  if (/诈骗|防诈|反诈|新闻|提醒大家|不要相信/iu.test(normalized) && !blocked && !urls.length && !regexes.transfer.test(normalized) && !regexes.credentials.test(normalized)) {
    score = Math.max(0, score - 35);
    reasons.push({ code: 'EDUCATIONAL_CONTEXT', score: -35, detail: '防詐提醒或一般新聞討論，降低風險權重' });
  }
  score = Math.min(100, score);
  const level = score >= 80 ? 'critical' : score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low';
  const codes = new Set(reasons.map(r => r.code));
  const eligible = !!blocked || (score >= 90 && (codes.has('PAYMENT_PRESSURE') || codes.has('CREDENTIAL_REQUEST')) && (codes.has('RISKY_LINK_CONTEXT') || codes.has('IMPERSONATION')));
  return { score, level, categories: [...categories], reasons, urlCount: urls.length, autoEligible: eligible, normalized };
}
