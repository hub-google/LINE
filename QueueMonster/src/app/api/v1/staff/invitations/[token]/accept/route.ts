import crypto from "crypto";
import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/domain/auth";
import { syncUserRichMenu } from "@/lib/domain/line";
import { prisma } from "@/lib/prisma";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const { token } = params;
    const user = await getAuthenticatedUser(req);
    if (!user) return apiError("UNAUTHORIZED", "接受邀請前請先透過 LINE 登入", 401);

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    return await prisma.$transaction(async (tx) => {
      const invitation = await tx.staffInvitation.findUnique({
        where: { tokenHash },
      });

      if (!invitation) throw new Error("無效的邀請連結");
      if (invitation.status !== "PENDING" || invitation.expiresAt < new Date()) {
        throw new Error("邀請連結已過期或已被使用");
      }

      // 建立或更新成員
      const member = await tx.merchantMember.upsert({
        where: {
          merchantId_userId: {
            merchantId: invitation.merchantId,
            userId: user.id,
          },
        },
        create: {
          merchantId: invitation.merchantId,
          userId: user.id,
          role: invitation.role,
          status: "ACTIVE",
          createdBy: invitation.invitedByUserId,
        },
        update: {
          role: invitation.role,
          status: "ACTIVE",
        },
      });

      // 若有指定分店範圍
      if (invitation.branchId) {
        await tx.memberBranchScope.upsert({
          where: {
            memberId_branchId: {
              memberId: member.id,
              branchId: invitation.branchId,
            },
          },
          create: {
            memberId: member.id,
            branchId: invitation.branchId,
          },
          update: {},
        });
      }

      // 標記邀請已被使用 (不可重複使用)
      await tx.staffInvitation.update({
        where: { id: invitation.id },
        data: {
          status: "ACCEPTED",
          acceptedByUserId: user.id,
          acceptedAt: new Date(),
        },
      });

      // 寫入 Audit Log
      await tx.auditLog.create({
        data: {
          merchantId: invitation.merchantId,
          branchId: invitation.branchId,
          actorUserId: user.id,
          actorRole: invitation.role,
          action: "STAFF_INVITATION_ACCEPTED",
          resourceType: "MERCHANT_MEMBER",
          resourceId: member.id,
        },
      });

      // 背景同步 Per-user Rich Menu
      syncUserRichMenu(user.lineUserId, invitation.role).catch(console.error);

      return apiSuccess({ success: true, member });
    });
  } catch (err: any) {
    return apiError("ACCEPT_ERROR", err.message || "接受邀請失敗", 400);
  }
}
