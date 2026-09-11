import { NextRequest } from "next/server";
import { requestLinePayment } from "@/lib/domain/payment";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const body = await req.json();
    const { orderItemIds } = body;

    if (!orderItemIds || !Array.isArray(orderItemIds) || orderItemIds.length === 0) {
      return apiError("INVALID_INPUT", "必須指定欲結帳之 orderItemIds", 400);
    }

    const idempotencyKey = req.headers.get("idempotency-key") || undefined;
    const result = await requestLinePayment({
      orderId: id,
      orderItemIds,
      idempotencyKey,
    });

    return apiSuccess(result);
  } catch (err: any) {
    return apiError("PAYMENT_REQUEST_ERROR", err.message || "發起支付失敗", 400);
  }
}
