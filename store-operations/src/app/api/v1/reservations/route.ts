import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/domain/auth";
import { createReservation } from "@/lib/domain/reservation";
import { prisma } from "@/lib/prisma";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return apiError("UNAUTHORIZED", "未登入，請先透過 LINE 登入", 401);
    }

    const body = await req.json();
    const { branchId, slotId, customerName, customerPhone, partySize, notes } = body;

    if (!branchId || !slotId || !customerName) {
      return apiError("INVALID_INPUT", "缺少必要欄位 (branchId, slotId, customerName)", 400);
    }

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!branch) return apiError("NOT_FOUND", "找不到門市", 404);

    const reservation = await createReservation({
      merchantId: branch.merchantId,
      branchId,
      userId: user.id,
      slotId,
      customerName,
      customerPhone,
      partySize: Number(partySize) || 1,
      notes,
    });

    return apiSuccess({ reservation }, 201);
  } catch (err: any) {
    return apiError("RESERVATION_FAILED", err.message || "預約失敗", 400);
  }
}
