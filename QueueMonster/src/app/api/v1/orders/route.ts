import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/domain/auth";
import { createOrder } from "@/lib/domain/order";
import { prisma } from "@/lib/prisma";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json();
    const { branchId, items, reservationId, queueTicketId } = body;

    if (!branchId || !items || !Array.isArray(items) || items.length === 0) {
      return apiError("INVALID_INPUT", "缺少分店或選購品項", 400);
    }

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!branch) return apiError("NOT_FOUND", "找不到門市", 404);

    const order = await createOrder({
      merchantId: branch.merchantId,
      branchId,
      userId: user?.id,
      reservationId,
      queueTicketId,
      items,
    });

    return apiSuccess({ order }, 201);
  } catch (err: any) {
    return apiError("ORDER_CREATE_ERROR", err.message || "建立訂單失敗", 400);
  }
}
