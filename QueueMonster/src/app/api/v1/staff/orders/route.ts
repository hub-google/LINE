import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/domain/auth";
import { prisma } from "@/lib/prisma";
import { apiSuccess, apiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return apiError("UNAUTHORIZED", "未登入", 401);

    const url = new URL(req.url);
    const branchId = url.searchParams.get("branchId");
    const status = url.searchParams.get("status");

    if (!branchId) return apiError("INVALID_INPUT", "必須指定 branchId", 400);

    const orders = await prisma.order.findMany({
      where: {
        branchId,
        ...(status ? { status } : {}),
      },
      include: {
        items: true,
        user: true,
        ticket: true,
        reservation: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return apiSuccess({ orders });
  } catch (err: any) {
    return apiError("SERVER_ERROR", err.message, 500);
  }
}
