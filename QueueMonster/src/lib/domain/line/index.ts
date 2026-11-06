import { prisma } from "@/lib/prisma";

const LINE_MESSAGING_CHANNEL_ACCESS_TOKEN = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
const MOCK_LINE_SERVICES = process.env.MOCK_LINE_SERVICES === "true";

export async function sendPushMessage(params: {
  lineUserId: string;
  text: string;
  dedupeKey: string;
  entityType?: string;
  entityId?: string;
}) {
  const { lineUserId, text, dedupeKey, entityType = "SYSTEM", entityId = "NONE" } = params;

  // 1. 防重複推播檢查 (Deduplication)
  const existingNotification = await prisma.notification.findUnique({
    where: { dedupeKey },
  });

  if (existingNotification && existingNotification.status === "SENT") {
    console.log(`[Notification] Dedupe key matched, skipping: ${dedupeKey}`);
    return;
  }

  // 2. 本地模擬模式或未設定 Token
  if (MOCK_LINE_SERVICES || !LINE_MESSAGING_CHANNEL_ACCESS_TOKEN || LINE_MESSAGING_CHANNEL_ACCESS_TOKEN.includes("your_")) {
    console.log(`[Mock LINE Push] To: ${lineUserId} | Message: ${text}`);
    await prisma.notification.upsert({
      where: { dedupeKey },
      create: {
        userId: lineUserId,
        type: "PUSH",
        entityType,
        entityId,
        dedupeKey,
        status: "SENT",
        sentAt: new Date(),
      },
      update: {
        status: "SENT",
        sentAt: new Date(),
      },
    });
    return;
  }

  // 3. 正式發送 LINE Messaging API
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LINE_MESSAGING_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [{ type: "text", text }],
      }),
    });

    const status = res.ok ? "SENT" : "FAILED";
    const error = res.ok ? null : await res.text();

    await prisma.notification.upsert({
      where: { dedupeKey },
      create: {
        userId: lineUserId,
        type: "PUSH",
        entityType,
        entityId,
        dedupeKey,
        status,
        sentAt: res.ok ? new Date() : null,
        error,
      },
      update: {
        status,
        sentAt: res.ok ? new Date() : null,
        error,
      },
    });
  } catch (err: any) {
    console.error("[LINE Push Error]", err);
    await prisma.notification.upsert({
      where: { dedupeKey },
      create: {
        userId: lineUserId,
        type: "PUSH",
        entityType,
        entityId,
        dedupeKey,
        status: "FAILED",
        error: String(err?.message || err),
      },
      update: {
        status: "FAILED",
        error: String(err?.message || err),
      },
    });
  }
}

// -----------------------------------------------------------------------------
// Per-User Rich Menu 同步綁定與解除
// -----------------------------------------------------------------------------
export async function syncUserRichMenu(lineUserId: string, role?: string) {
  if (MOCK_LINE_SERVICES || !LINE_MESSAGING_CHANNEL_ACCESS_TOKEN) {
    console.log(`[Mock RichMenu Sync] User: ${lineUserId} -> Role: ${role || "DEFAULT"}`);
    return;
  }

  let targetMenuId = process.env.LINE_RICHMENU_DEFAULT_ID;
  if (role === "STAFF") targetMenuId = process.env.LINE_RICHMENU_STAFF_ID;
  else if (role === "MANAGER") targetMenuId = process.env.LINE_RICHMENU_MANAGER_ID;
  else if (role === "OWNER") targetMenuId = process.env.LINE_RICHMENU_OWNER_ID;

  try {
    if (!targetMenuId || targetMenuId.includes("richmenu-default") || !role) {
      // 解除 Per-user 選單，恢復預設選單
      await fetch(`https://api.line.me/v2/bot/user/${encodeURIComponent(lineUserId)}/richmenu`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${LINE_MESSAGING_CHANNEL_ACCESS_TOKEN}` },
      });
    } else {
      // 綁定特定角色的 Rich Menu
      await fetch(
        `https://api.line.me/v2/bot/user/${encodeURIComponent(lineUserId)}/richmenu/${encodeURIComponent(targetMenuId)}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${LINE_MESSAGING_CHANNEL_ACCESS_TOKEN}` },
        }
      );
    }
  } catch (err) {
    console.warn(`[RichMenu Sync Warning] 無法同步選單給 ${lineUserId}:`, err);
  }
}
