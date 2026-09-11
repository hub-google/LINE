import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/domain/auth";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return apiError("UNAUTHORIZED", "未授權，請先透過 LINE 登入", 401);
  }

  return apiSuccess({
    user: {
      id: user.id,
      lineUserId: user.lineUserId,
      displayName: user.displayName,
      pictureUrl: user.pictureUrl,
      memberships: user.memberships.map((m) => ({
        id: m.id,
        merchantId: m.merchantId,
        merchantName: m.merchant.name,
        role: m.role,
        scopes: m.branchScopes.map((s) => s.branchId),
      })),
    },
  });
}
