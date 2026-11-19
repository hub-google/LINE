# AntiScam OpenChat Bridge (experimental, unauthorized for production)

This is an original adapter for the **documented WebSocket bot API** of the open-source project [`mars-tw/anti-scam-helper`](https://github.com/mars-tw/anti-scam-helper). That upstream repository is Apache-2.0 licensed. Its underlying LINE.js integration is **unofficial**, may stop working after LINE updates and may put a LINE account at risk of suspension. We do not copy its proprietary session data, alter its internal code or ship any LINE tokens.

The upstream project describes `message` frames and `message:delete`, `member:remove`, `message:send` bot actions; we only map those frames to AntiScam's existing signed webhook / REST connector. This bridge **does not support banning re-entry** (`blockMember=false`), and OpenChat join events have not been validated (`readJoin=false`).


## Windows 本機模式（建議先實機驗證）

如果不想把 LINE 登入工作階段放到任何雲端，改用 [Windows 本機 5 小時測試流程](./local/README.md)。兩個 PowerShell 腳本會在你自己的電腦安裝固定版 LINE.js、完成本機 QR 登入，並啟動本機監控；整個過程預設 **Dry Run／只監控**，不進行任何真實刪文或踢人。無需 GitHub Actions 或 VPS。

## Setup (dedicated test account only)

1. On a *separate trusted computer* with Node.js ≥22, clone the open-source upstream: `git clone https://github.com/mars-tw/anti-scam-helper.git`, follow its `README.md` and `guard/DEPLOY.md`, and use a **separate test LINE account** to perform QR login. Review LINE terms and account-risk first. Do not disclose LINE credentials or QR session files in this repository.
2. In upstream `config.yaml`, set `api.enabled: true`, `api.moderation: true`, and `api.chats` to a strictly limited test OpenChat room; restrict `server.host` to `127.0.0.1`. Create an API token via its documented CLI. Store it as `LINEJS_API_TOKEN` only on the server.
3. In **AntiScam** add the same room under its actual `channelId` (`POST /api/communities` with logged-in admin), and set its mode to `monitor`. On the AntiScam API set `OPENCHAT_BRIDGE_URL=http://127.0.0.1:3010`, `OPENCHAT_BRIDGE_TOKEN` and `WEBHOOK_SECRET` matching the bridge.
4. In this `bridge/`, `npm install` (pins `ws` v8.22.0); configure settings from `.env.example` through secure server environment variables and run `node --env-file=.env runner.js` (or use a service manager). The upstream bot API and the AntiScam server must be accessible via localhost on the same host.
5. **First use `OPENCHAT_LIVE_VERIFIED=false` and `OPENCHAT_ACTIONS_ENABLED=false`.** Confirm actual incoming OpenChat messages appear in the AntiScam dashboard and verify member roles. Do not activate actions before a real test with a dedicated account and consented test participants.
6. Only after proving that the dedicated account is a real OpenChat administrator, confirming delete/kick on **test messages**, checking false positives and obtaining explicit operator approval, turn `OPENCHAT_LIVE_VERIFIED=true` and `OPENCHAT_ACTIONS_ENABLED=true`. The AntiScam API separately requires `DRY_RUN=false` and the community's `auto` setting for automation.

## Explicit limitations

- It never accepts arbitrary chat room IDs or member IDs for destructive actions; only configured rooms and a recent **known message sender** can be targeted.
- Admins/co-admins (from upstream `senderRole`) and configured protected IDs cannot be removed by the bridge.
- `block_member` is **not implemented**: kicking a member does not prevent them from joining again. Do not advertise this functionality as completed.
- Only text `message` events are ingested, not message snapshots or automatically inferred join events. Pictures/QR and content in note/thread are separate future work.
- The WebSocket bot API has documented `member:removed` and `message:deleted` confirmations; external LINE UI still requires live manual verification.
- The bridge has in-memory event cache and idempotency cache, but a restarted process cannot guarantee exactly-once external actions. Keep destructive actions off until this durability requirement is addressed.
- Webhook signing is HMAC SHA-256. The bridge HTTP port binds **only localhost**, uses a separate bearer secret, and never logs session tokens or full suspicious messages.
- Upstream is external, not vendored; obey its Apache-2.0 license when making copies/modifications. This adapter is original code.

## Tests

`node --test test/*.test.js` runs without a LINE account, verifies role protection and emulated upstream acknowledgments; it **does not** test a real LINE account.

### Optional pinned bootstrap (Linux/macOS)

Run `sh bridge/bootstrap-linejs.sh` from the `AntiScam/` repository root. This clones the Apache-2.0 upstream at pinned commit `9b59bfaea4579e45c4ba862ae7db8d9327a8b3a7` into ignored `bridge/.runtime/anti-scam-helper` and builds it. It intentionally **does not** log in, start a bot, or enable destructive operations. Review the upstream code and terms before executing. Network access and a Node.js installation with npm are required. Future updates should verify compatibility before changing this pinned commit.
