import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/domain/auth";
import { getOrCreateDailyQueue } from "@/lib/domain/queue";
import { prisma } from "@/lib/prisma";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function GET(req: NextRequest, { params }: { params: { branchId: string } }) {
  try {
    const { branchId } = params;
    const user = await getAuthenticatedUser(req);

    if (!user) {
      return apiError("UNAUTHORIZED", "未登入", 401);
    }

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      return apiError("NOT_FOUND", "找不到分店", 404);
    }

    // RBAC & 門市租戶授權驗證
    const membership = user.memberships.find((m) => m.merchantId === branch.merchantId);
    if (!membership || !["OWNER", "MANAGER", "STAFF"].includes(membership.role)) {
      return apiError("FORBIDDEN", "您無權管理此門市的排隊佇列", 403);
    }

    const queue = await getOrCreateDailyQueue(branchId, branch.merchantId);

    // 取得所有票券依狀態分類
    const allTickets = await prisma.queueTicket.findMany({
      where: { queueId: queue.id },
      include: {
        user: true,
        position: true,
        orders: {
          include: { items: true },
        },
      },
      orderBy: { ticketNumber: "asc" },
    });

    // 取得候位順序
    const waitingPositions = await prisma.queuePosition.findMany({
      where: { queueId: queue.id },
      orderBy: { sortKey: "asc" },
      include: {
        ticket: {
          include: { user: true },
        },
      },
    });

    const serving = allTickets.find((t) => t.status === "SERVING");
    const called = allTickets.filter((t) => t.status === "CALLED");
    const passed = allTickets.filter((t) => t.status === "PASSED");
    const completed = allTickets.filter((t) => t.status === "COMPLETED");

    return apiSuccess({
      queue: {
        id: queue.id,
        businessDate: queue.businessDate,
        status: queue.status,
        prefix: queue.prefix,
        nextNumber: queue.nextNumber,
      },
      serving,
      called,
      waitingQueue: waitingPositions.map((p) => ({
        positionId: p.id,
        sortKey: p.sortKey,
        insertedReason: p.insertedReason,
        ticket: p.ticket,
      })),
      passed,
      completed,
      stats: {
        totalIssued: allTickets.length,
        waitingCount: waitingPositions.length,
        passedCount: passed.length,
        completedCount: completed.length,
      },
    });
  } catch (err: any) {
    return apiError("SERVER_ERROR", err.message, 500);
  }
}
