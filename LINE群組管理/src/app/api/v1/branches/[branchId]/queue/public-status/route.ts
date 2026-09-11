import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function GET(req: NextRequest, { params }: { params: { branchId: string } }) {
  try {
    const { branchId } = params;
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      include: { settings: true },
    });

    if (!branch) {
      return apiError("NOT_FOUND", "找不到該分店", 404);
    }

    const today = new Date().toISOString().split("T")[0];
    const queue = await prisma.queue.findFirst({
      where: { branchId, businessDate: today },
      include: {
        tickets: {
          where: { status: { in: ["WAITING", "CALLED", "SERVING", "RETURNED"] } },
          orderBy: { ticketNumber: "asc" },
        },
      },
    });

    const currentServing = queue?.tickets.find((t) => t.status === "SERVING" || t.status === "CALLED");
    const waitingTickets = queue?.tickets.filter((t) => t.status === "WAITING" || t.status === "RETURNED") || [];

    const defaultMinutes = branch.settings?.defaultServiceMinutes || 20;
    const estimatedMinutes = waitingTickets.length * defaultMinutes;

    return apiSuccess({
      branchName: branch.name,
      isOpen: branch.settings?.queueEnabled && queue?.status === "OPEN",
      currentCalling: currentServing?.displayNumber || "無",
      waitingCount: waitingTickets.length,
      estimatedWaitText:
        waitingTickets.length > 0 ? `預估約 ${Math.max(10, estimatedMinutes - 10)}–${estimatedMinutes + 10} 分鐘` : "目前無需等待",
    });
  } catch (err: any) {
    return apiError("SERVER_ERROR", err.message, 500);
  }
}
