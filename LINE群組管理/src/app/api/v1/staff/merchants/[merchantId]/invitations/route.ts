import crypto from "crypto";
import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/domain/auth";
import { prisma } from "@/lib/prisma";
import { apiSuccess, apiError } from "@/lib/api-response";

const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:3000";

export async function POST(req: NextRequest, { params }: { params: { merchantId: string } }) {
  try {
    const { merchantId } = params;
    const user = await getAuthenticatedUser(req);
    if (!user) return apiError("UNAUTHORIZED", "未登入", 401);

    // 檢查是否有權限發送邀請 (OWNER 或 MANAGER)
    const membership = user.memberships.find((m) => m.merchantId === merchantId);
    if (!membership || !["OWNER", "MANAGER"].includes(membership.role)) {
      return apiError("FORBIDDEN", "您無權發送此商家的成員邀請", 403);
    }

    const body = await req.json();
    const { role = "STAFF", branchId } = body;

    // Manager 只能邀請 Staff，不能邀請 Manager 或 Owner
    if (membership.role === "MANAGER" && role !== "STAFF") {
      return apiError("FORBIDDEN", "店長僅能邀請一般門市員工 (Staff)", 403);
    }

    // 產生一次性密碼學隨機 Token 與其 SHA-256 雜湊
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    // 預設 48 小時過期
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    await prisma.staffInvitation.create({
      data: {
        merchantId,
        branchId,
        role,
        tokenHash,
        expiresAt,
        status: "PENDING",
        invitedByUserId: user.id,
      },
    });

    const inviteUrl = `${APP_BASE_URL}/s/invite/${rawToken}`;

    return apiSuccess({
      inviteUrl,
      rawToken,
      role,
      expiresAt,
    }, 201);
  } catch (err: any) {
    return apiError("INVITATION_ERROR", err.message, 400);
  }
}
