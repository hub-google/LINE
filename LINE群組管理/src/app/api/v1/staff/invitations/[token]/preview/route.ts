import crypto from "crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const { token } = params;
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const invitation = await prisma.staffInvitation.findUnique({
      where: { tokenHash },
      include: {
        merchant: true,
      },
    });

    if (!invitation) {
      return apiError("NOT_FOUND", "無效的邀請連結", 404);
    }

    if (invitation.status !== "PENDING" || invitation.expiresAt < new Date()) {
      return apiError("INVITATION_INVALID", "此邀請連結已過期或已被使用", 400);
    }

    return apiSuccess({
      merchantName: invitation.merchant.name,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
    });
  } catch (err: any) {
    return apiError("SERVER_ERROR", err.message, 500);
  }
}
