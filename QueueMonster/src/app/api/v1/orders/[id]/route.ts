import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
        payments: {
          include: { allocations: true },
        },
        branch: true,
      },
    });

    if (!order) return apiError("NOT_FOUND", "找不到該訂單", 404);

    return apiSuccess({ order });
  } catch (err: any) {
    return apiError("SERVER_ERROR", err.message, 500);
  }
}
