import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function GET(req: NextRequest, { params }: { params: { ticketId: string } }) {
  try {
    const { ticketId } = params;

    const ticket = await prisma.queueTicket.findUnique({
      where: { id: ticketId },
      include: {
        branch: {
          include: { settings: true },
        },
        position: true,
      },
    });

    if (!ticket) {
      return apiError("NOT_FOUND", "找不到該號碼牌", 404);
    }

    // 計算前方還有幾組在等待
    let aheadCount = 0;
    if (ticket.position && ticket.status === "WAITING") {
      aheadCount = await prisma.queuePosition.count({
        where: {
          queueId: ticket.queueId,
          sortKey: { lt: ticket.position.sortKey },
        },
      });
    }

    const defaultMinutes = ticket.branch.settings?.defaultServiceMinutes || 20;
    const estimatedMinutes = (aheadCount + 1) * defaultMinutes;

    return apiSuccess({
      ticket: {
        id: ticket.id,
        displayNumber: ticket.displayNumber,
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
        joinedAt: ticket.joinedAt,
        calledAt: ticket.calledAt,
        branchName: ticket.branch.name,
        aheadCount,
        estimatedWaitText:
          ticket.status === "WAITING"
            ? `前方約 ${aheadCount} 組（預估 ${Math.max(10, estimatedMinutes - 10)}–${estimatedMinutes + 10} 分鐘）`
            : ticket.status === "CALLED"
            ? "已叫號！請盡速至櫃台就位"
            : ticket.status === "SERVING"
            ? "服務進行中"
            : ticket.status === "PASSED"
            ? "已過號，請向店員報到"
            : "已結束",
      },
    });
  } catch (err: any) {
    return apiError("SERVER_ERROR", err.message, 500);
  }
}
