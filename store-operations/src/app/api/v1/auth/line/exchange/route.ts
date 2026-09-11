import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyLineAccessToken, createSessionToken } from "@/lib/domain/auth";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { lineAccessToken } = body;

    if (!lineAccessToken) {
      return apiError("INVALID_INPUT", "必須提供 lineAccessToken", 400);
    }

    // 1. 驗證 LINE Token 並取得可信 lineUserId
    const verified = await verifyLineAccessToken(lineAccessToken);

    // 2. 寫入或更新 User
    const user = await prisma.user.upsert({
      where: { lineUserId: verified.lineUserId },
      create: {
        lineUserId: verified.lineUserId,
        displayName: verified.displayName || "LINE 顧客",
        pictureUrl: verified.pictureUrl,
        lastSeenAt: new Date(),
      },
      update: {
        displayName: verified.displayName || undefined,
        pictureUrl: verified.pictureUrl || undefined,
        lastSeenAt: new Date(),
      },
      include: {
        memberships: {
          where: { status: "ACTIVE" },
          include: { merchant: true },
        },
      },
    });

    // 3. 簽發內部 Session Token (JWT)
    const sessionToken = createSessionToken({
      userId: user.id,
      lineUserId: user.lineUserId,
      displayName: user.displayName || undefined,
      role: user.memberships[0]?.role || "CUSTOMER",
      merchantId: user.memberships[0]?.merchantId,
    });

    return apiSuccess({
      sessionToken,
      user: {
        id: user.id,
        lineUserId: user.lineUserId,
        displayName: user.displayName,
        pictureUrl: user.pictureUrl,
        roles: user.memberships.map((m) => ({
          merchantId: m.merchantId,
          merchantName: m.merchant.name,
          role: m.role,
        })),
      },
    });
  } catch (err: any) {
    return apiError("AUTH_FAILED", err.message || "LINE 授權交換失敗", 401);
  }
}
