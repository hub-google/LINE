import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";

const SESSION_SECRET = process.env.SESSION_SECRET || "fallback_secret_for_local_development_32chars";
const MOCK_LINE_SERVICES = process.env.MOCK_LINE_SERVICES === "true";

export interface SessionPayload {
  userId: string;
  lineUserId: string;
  displayName?: string;
  role?: string;
  merchantId?: string;
}

// -----------------------------------------------------------------------------
// 1. LINE Token 驗證 (支援真實 LINE OAuth2.1 Verify 與 本地模擬)
// -----------------------------------------------------------------------------
export async function verifyLineAccessToken(token: string): Promise<{
  lineUserId: string;
  displayName?: string;
  pictureUrl?: string;
}> {
  if (MOCK_LINE_SERVICES || token.startsWith("mock_")) {
    const mockId = token.startsWith("mock_") ? token.replace("mock_", "") : "U_mock_customer_01";
    return {
      lineUserId: mockId,
      displayName: `LINE 模擬用戶 (${mockId.substring(0, 8)})`,
      pictureUrl: "https://placehold.co/100x100?text=LINE",
    };
  }

  const res = await fetch(`https://api.line.me/oauth2/v2.1/verify?access_token=${encodeURIComponent(token)}`);
  if (!res.ok) {
    const errorData = await res.text();
    throw new Error(`LINE Token 驗證失敗: ${errorData}`);
  }

  const data = await res.json();
  if (process.env.LINE_LOGIN_CHANNEL_ID && data.client_id !== process.env.LINE_LOGIN_CHANNEL_ID) {
    throw new Error("LINE Token Channel ID 不匹配，授權遭拒");
  }

  // 取得 Profile
  const profileRes = await fetch("https://api.line.me/v2/profile", {
    headers: { Authorization: `Bearer ${token}` },
  });
  let displayName = undefined;
  let pictureUrl = undefined;
  if (profileRes.ok) {
    const profile = await profileRes.json();
    displayName = profile.displayName;
    pictureUrl = profile.pictureUrl;
  }

  return {
    lineUserId: data.userId || profileRes.ok ? (await profileRes.json()).userId : data.client_id,
    displayName,
    pictureUrl,
  };
}

// -----------------------------------------------------------------------------
// 2. 內部高時效 JWT Session
// -----------------------------------------------------------------------------
export function createSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, SESSION_SECRET, { expiresIn: "24h" });
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, SESSION_SECRET) as SessionPayload;
  } catch {
    return null;
  }
}

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return authHeader.substring(7).trim();
}

// -----------------------------------------------------------------------------
// 3. RBAC 權限檢查引擎
// -----------------------------------------------------------------------------
const ROLE_PERMISSIONS: Record<string, string[]> = {
  CUSTOMER: [
    "queue.read.self",
    "queue.create",
    "queue.cancel.self",
    "reservation.read.self",
    "reservation.create",
    "reservation.cancel.self",
    "order.read.self",
    "order.create",
    "order.checkout.line_pay",
    "catalog.read",
  ],
  STAFF: [
    "queue.read",
    "queue.call",
    "queue.insert_next",
    "queue.cancel",
    "reservation.read",
    "reservation.check_in",
    "reservation.no_show",
    "order.read",
    "order.create",
    "order.edit",
    "order.checkout",
    "payment.read",
    "payment.collect",
    "catalog.read",
    "merchant.settings.read",
  ],
  MANAGER: [
    "queue.read",
    "queue.call",
    "queue.insert_next",
    "queue.reorder",
    "queue.cancel",
    "reservation.read",
    "reservation.manage",
    "order.read",
    "order.create",
    "order.edit",
    "order.checkout",
    "payment.read",
    "payment.collect",
    "payment.refund",
    "catalog.read",
    "catalog.manage",
    "member.read",
    "member.invite.staff",
    "member.manage.staff",
    "merchant.settings.read",
    "merchant.settings.write.basic",
    "audit.read.branch",
  ],
  OWNER: [
    "queue.read",
    "queue.call",
    "queue.insert_next",
    "queue.reorder",
    "queue.cancel",
    "reservation.read",
    "reservation.manage",
    "order.read",
    "order.create",
    "order.edit",
    "order.checkout",
    "payment.read",
    "payment.collect",
    "payment.refund",
    "catalog.read",
    "catalog.manage",
    "member.read",
    "member.invite",
    "member.manage",
    "merchant.settings.read",
    "merchant.settings.write",
    "audit.read",
  ],
};

export function hasPermission(role: string, permission: string): boolean {
  const permissions = ROLE_PERMISSIONS[role.toUpperCase()];
  if (!permissions) return false;
  if (role.toUpperCase() === "OWNER") return true;
  return permissions.includes(permission);
}

// -----------------------------------------------------------------------------
// 4. 後端 Context 身份與門市權限驗證 Guard
// -----------------------------------------------------------------------------
export async function getAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = extractBearerToken(authHeader);
  if (!token) return null;

  const session = verifySessionToken(token);
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: {
      memberships: {
        where: { status: "ACTIVE" },
        include: {
          merchant: true,
          branchScopes: true,
        },
      },
    },
  });

  return user;
}
