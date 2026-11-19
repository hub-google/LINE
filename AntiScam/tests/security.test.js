import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomBytes} from 'node:crypto';
import {encryptMemberId,decryptMemberId,makeMemberKey,safeEquals,verifyWebhook} from '../src/security.js';
const key=randomBytes(32).toString('hex');
test('member id is encrypted at rest and can be decrypted by backend',()=>{const value=encryptMemberId('opaque-id-123',key);assert.ok(!value.includes('opaque-id'));assert.equal(decryptMemberId(value,key),'opaque-id-123');assert.notEqual(makeMemberKey('salt','a','id'),makeMemberKey('salt','b','id'));});
test('signed webhook requires current timestamp and valid HMAC',()=>{const raw='{"eventId":"test"}';const now=Date.now();const ts=Math.floor(now/1000);const secret='long-random-demo-secret';const sig='sha256='+createHmac('sha256',secret).update(`${ts}.${raw}`).digest('hex');assert.ok(verifyWebhook({raw,timestamp:ts,signature:sig,secret,now}));assert.equal(verifyWebhook({raw,timestamp:ts-600,signature:sig,secret,now}),false);assert.equal(verifyWebhook({raw:raw+'x',timestamp:ts,signature:sig,secret,now}),false);assert.ok(safeEquals('a','a'));assert.equal(safeEquals('a','b'),false);});
