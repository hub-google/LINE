import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const reservation = await prisma.reservation.findUnique({
      where: { id },
      include: {
        slot: true,
        branch: true,
        ticket: true,
      },
    });

    if (!reservation) return apiError("NOT_FOUND", "找不到預約", 404);

    return apiSuccess({ reservation });
  } catch (err: any) {
    return apiError("SERVER_ERROR", err.message, 500);
  }
}
