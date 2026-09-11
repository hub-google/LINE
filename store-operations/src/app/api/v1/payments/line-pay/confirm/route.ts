import { NextRequest, NextResponse } from "next/server";
import { confirmLinePayment } from "@/lib/domain/payment";
import { apiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const paymentId = url.searchParams.get("paymentId");
    const transactionId = url.searchParams.get("transactionId") || "MOCK_TX_CONFIRM";

    if (!paymentId) {
      return apiError("INVALID_INPUT", "缺少 paymentId", 400);
    }

    const result = await confirmLinePayment({
      paymentId,
      transactionId,
    });

    const redirectUrl = new URL(`/c/pay/result?status=SUCCESS&orderId=${result.orderId}`, req.url);
    return NextResponse.redirect(redirectUrl);
  } catch (err: any) {
    console.error("[LINE Pay Confirm Error]", err);
    const redirectUrl = new URL(`/c/pay/result?status=FAILED&error=${encodeURIComponent(err.message)}`, req.url);
    return NextResponse.redirect(redirectUrl);
  }
}
