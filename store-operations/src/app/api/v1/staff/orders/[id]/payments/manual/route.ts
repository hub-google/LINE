import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/domain/auth";
import { manualCashPayment } from "@/lib/domain/payment";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const user = await getAuthenticatedUser(req);
    if (!user) return apiError("UNAUTHORIZED", "未登入", 401);

    const body = await req.json();
    const { orderItemIds, paymentMethod = "CASH" } = body;

    if (!orderItemIds || !Array.isArray(orderItemIds) || orderItemIds.length === 0) {
      return apiError("INVALID_INPUT", "必須指定欲收款之 orderItemIds", 400);
    }

    const result = await manualCashPayment({
      orderId: id,
      orderItemIds,
      paymentMethod,
      actorUserId: user.id,
    });

    return apiSuccess(result);
  } catch (err: any) {
    return apiError("MANUAL_PAYMENT_ERROR", err.message || "現場結帳失敗", 400);
  }
}
