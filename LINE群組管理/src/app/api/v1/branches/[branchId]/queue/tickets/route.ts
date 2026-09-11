import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/domain/auth";
import { takeQueueTicket } from "@/lib/domain/queue";
import { prisma } from "@/lib/prisma";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function POST(req: NextRequest, { params }: { params: { branchId: string } }) {
  try {
    const { branchId } = params;
    const user = await getAuthenticatedUser(req);
    const body = await req.json().catch(() => ({}));

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      return apiError("NOT_FOUND", "找不到該分店", 404);
    }

    const ticket = await takeQueueTicket({
      branchId,
      merchantId: branch.merchantId,
      userId: user?.id,
      notes: body.notes,
    });

    return apiSuccess({ ticket }, 201);
  } catch (err: any) {
    return apiError("QUEUE_ERROR", err.message || "取號失敗", 400);
  }
}
