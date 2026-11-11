export function formatAuthError(error,operation="general",weakPasswordMessage="密碼強度不足，請使用至少 8 個字元的密碼。"){
 const raw=typeof error==="string"?error:typeof error?.message==="string"?error.message:typeof error?.error==="string"?error.error:"";
 const code=typeof error?.code==="string"?error.code:typeof error?.error_code==="string"?error.error_code:"";
 const detail=(code+" "+raw).toLowerCase();
 if(/invalid.login.credentials|invalid_credentials|invalid.grant|invalid.pin|invalid.password|incorrect.password|wrong.password|email.or.password/i.test(detail))return "電子信箱或密碼不正確，請重新輸入。";
 if(/email.not.confirmed|email_not_confirmed|email.unverified/i.test(detail))return "電子信箱尚未完成驗證，請先到信箱確認後再登入。";
 if(/user.already.registered|user_already_exists|email_exists|already.registered/i.test(detail))return "這個電子信箱已經註冊，請直接登入或使用忘記密碼。";
 if(/weak_password|password.should|password.must|password.is.too.short|password.*at.least|password.*characters/i.test(detail))return weakPasswordMessage;
 if(/same_password|new.password.should.be.different/i.test(detail))return "新密碼不可與原本密碼相同，請重新設定。";
 if(/over.*rate.limit|rate.limit|too.many.requests|security.purposes|try.again.after|too.many.attempts|admin.locked|locked.until/i.test(detail))return "操作太頻繁，請稍後再試。";
 if(/otp.expired|token.expired|refresh.token|session.not.found|invalid.jwt|jwt.expired|auth.session.missing/i.test(detail))return "登入驗證已過期，請重新登入。";
 if(/failed.to.fetch|network.error|networkerror|network.request.failed|load.failed|connection.*failed|fetch.failed|timeout|timed.out|network.unavailable/i.test(detail))return "網路連線異常，請檢查網路後再試一次。";
 if(/email.address.invalid|invalid.email|valid.email|email.*format/i.test(detail))return "電子信箱格式不正確，請重新確認。";
 if(/signup.disabled|signups.not.allowed|signups.*disabled/i.test(detail))return "目前暫時無法註冊，請稍後再試。";
 if(/[\u3400-\u9fff]/.test(raw)&&!/\b(?:error|failed|exception|sqlstate|jwt|pgrst\d+|authapierror|internal.server.error|undefined|null)\b/i.test(raw)&&!/[a-z][a-z0-9]*_[a-z0-9_]+/i.test(raw))return raw;
 if(operation==="login")return "登入失敗，請檢查電子信箱與密碼後重試。";
 if(operation==="signup")return "目前無法完成註冊，請稍後再試。";
 if(operation==="reset")return "暫時無法處理電子郵件或密碼設定，請稍後再試。";
 if(operation==="line")return "LINE 身分驗證暫時無法完成，請重新登入。";
 return "系統暫時無法完成操作，請稍後再試。";
}

