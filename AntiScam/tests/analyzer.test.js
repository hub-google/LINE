import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMessage, extractUrls, hostMatchesBlocklist, normalizeText, redactPreview } from '../src/analyzer.js';

test('unicode normalization removes zero-width obfuscation and harmonizes traditional forms',()=>{
  assert.equal(normalizeText('保\u200B證獲利'), '保证获利');
  assert.equal(normalizeText('ＡＢＣ'), 'abc');
});
test('plain speech and ordinary links never qualify for automated kick',()=>{
  for(const text of ['歡迎新朋友','今天股市有點震盪','我今天看了假投資詐騙新聞，提醒大家不要相信保證獲利','https://www.wikipedia.org']) {
    const risk=analyzeMessage({text,isNewMember:true});assert.equal(risk.autoEligible,false,text);
  }
});
test('blocked domain matches subdomains only, not impostor host suffix',()=>{
  assert.equal(hostMatchesBlocklist('login.phish.test',['phish.test']),true);
  assert.equal(hostMatchesBlocklist('phish.test.attacker.net',['phish.test']),false);
  assert.equal(hostMatchesBlocklist('notphish.test',['phish.test']),false);
});
test('listed phishing URL is critical and can qualify for automated action',()=>{
  const r=analyzeMessage({text:'點此認證 https://login.phish.test/verify',isNewMember:true,blockedDomains:['phish.test']});
  assert.equal(r.level,'critical');assert.equal(r.autoEligible,true);
});
test('credential theft with payment instructions is critical',()=>{
  const r=analyzeMessage({text:'官方客服請立即匯款，提供簡訊驗證碼，點擊 https://example.org/login',isNewMember:true});
  assert.ok(r.score>=80);assert.equal(r.autoEligible,true);
});
test('URLs are parsed defensively and masked from audit previews',()=>{
  assert.equal(extractUrls('hi https://test.example/hello.')[0].host,'test.example');
  assert.doesNotMatch(redactPreview('my mail hi@example.com go https://scam.test/a'),/scam\.test|hi@example\.com/);
});
