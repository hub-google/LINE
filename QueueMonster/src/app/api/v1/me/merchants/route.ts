import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/domain/auth";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return apiError("UNAUTHORIZED", "未授權，請先登入", 401);
  }

  const merchants = user.memberships.map((m) => ({
    merchantId: m.merchantId,
    merchantName: m.merchant.name,
    merchantCode: m.merchant.code,
    role: m.role,
  }));

  return apiSuccess({ merchants });
}
