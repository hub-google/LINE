import { prisma } from "@/lib/prisma";
import { sendPushMessage } from "@/lib/domain/line";

// -----------------------------------------------------------------------------
// 1. 取得或初始化今日排隊佇列 (Daily Queue Lifecycle)
// -----------------------------------------------------------------------------
export async function getOrCreateDailyQueue(branchId: string, merchantId: string, prefix = "A") {
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  let queue = await prisma.queue.findUnique({
    where: {
      branchId_businessDate_prefix: {
        branchId,
        businessDate: today,
        prefix,
      },
    },
  });

  if (!queue) {
    queue = await prisma.queue.create({
      data: {
        branchId,
        merchantId,
        businessDate: today,
        prefix,
        nextNumber: 1,
        status: "OPEN",
      },
    });
  }

  return queue;
}

// -----------------------------------------------------------------------------
// 2. 取號 (Take Ticket) - 防重複取號與原子分配
// -----------------------------------------------------------------------------
export async function takeQueueTicket(params: {
  branchId: string;
  merchantId: string;
  userId?: string;
  reservationId?: string;
  notes?: string;
  priority?: number;
}) {
  const { branchId, merchantId, userId, reservationId, notes, priority = 0 } = params;

  // 1. 檢查使用者是否已有有效號碼牌
  if (userId) {
    const activeTicket = await prisma.queueTicket.findFirst({
      where: {
        branchId,
        userId,
        status: { in: ["WAITING", "CALLED", "SERVING", "RETURNED"] },
      },
    });

    if (activeTicket) {
      throw new Error(`您已有生效中的號碼牌 (${activeTicket.displayNumber})，請勿重複取號`);
    }
  }

  // 2. Transaction 確保取號號碼與排序原子產生
  return await prisma.$transaction(async (tx) => {
    const queue = await getOrCreateDailyQueue(branchId, merchantId);

    if (queue.status !== "OPEN") {
      throw new Error("本科別/門市目前未開放取號或已截止排隊");
    }

    const ticketNumber = queue.nextNumber;
    const displayNumber = `${queue.prefix}${String(ticketNumber).padStart(3, "0")}`;

    // 更新 queue 的下一個號碼
    await tx.queue.update({
      where: { id: queue.id },
      data: { nextNumber: ticketNumber + 1 },
    });

    // 建立 QueueTicket
    const ticket = await tx.queueTicket.create({
      data: {
        merchantId,
        branchId,
        queueId: queue.id,
        userId,
        reservationId,
        ticketNumber,
        displayNumber,
        status: "WAITING",
        priority,
        notes,
      },
    });

    // 計算 sort_key：取目前最大 sortKey + 1000.0
    const lastPos = await tx.queuePosition.findFirst({
      where: { queueId: queue.id },
      orderBy: { sortKey: "desc" },
    });
    const newSortKey = lastPos ? lastPos.sortKey + 1000.0 : 1000.0;

    // 建立 queue_position
    await tx.queuePosition.create({
      data: {
        queueId: queue.id,
        ticketId: ticket.id,
        sortKey: newSortKey,
        insertedReason: "NORMAL",
      },
    });

    // 寫入不可篡改事件
    await tx.queueEvent.create({
      data: {
        merchantId,
        branchId,
        queueId: queue.id,
        ticketId: ticket.id,
        eventType: "TICKET_CREATED",
        actorUserId: userId,
        newState: JSON.stringify(ticket),
      },
    });

    return ticket;
  });
}

// -----------------------------------------------------------------------------
// 3. 叫下一位 (Call Next) - 號碼與順序解耦防衝叫號
// -----------------------------------------------------------------------------
export async function callNextTicket(queueId: string, actorUserId: string) {
  return await prisma.$transaction(async (tx) => {
    // 取得排序第一順位的 waiting/returned 號碼牌
    const topPosition = await tx.queuePosition.findFirst({
      where: { queueId },
      orderBy: { sortKey: "asc" },
      include: {
        ticket: {
          include: { user: true },
        },
      },
    });

    if (!topPosition) {
      throw new Error("目前候位佇列已無等待中顧客");
    }

    const ticket = topPosition.ticket;

    // 變更票券狀態為 CALLED
    const updatedTicket = await tx.queueTicket.update({
      where: { id: ticket.id },
      data: {
        status: "CALLED",
        calledAt: new Date(),
      },
    });

    // 自等待排序表移除 (或標記)
    await tx.queuePosition.delete({
      where: { id: topPosition.id },
    });

    // 記錄 Event
    await tx.queueEvent.create({
      data: {
        merchantId: ticket.merchantId,
        branchId: ticket.branchId,
        queueId,
        ticketId: ticket.id,
        eventType: "TICKET_CALLED",
        actorUserId,
        oldState: JSON.stringify(ticket),
        newState: JSON.stringify(updatedTicket),
      },
    });

    // 發送 LINE 通知
    if (ticket.user?.lineUserId) {
      await sendPushMessage({
        lineUserId: ticket.user.lineUserId,
        text: `【叫號提醒】號碼 ${ticket.displayNumber} 已輪到您！請盡速至櫃台或報到處就位服務。`,
        dedupeKey: `queue-called:${ticket.id}:${Date.now()}`,
      });
    }

    return updatedTicket;
  });
}

// -----------------------------------------------------------------------------
// 4. 再叫一次 (Recall)
// -----------------------------------------------------------------------------
export async function recallTicket(ticketId: string, actorUserId: string) {
  const ticket = await prisma.queueTicket.findUnique({
    where: { id: ticketId },
    include: { user: true },
  });

  if (!ticket || ticket.status !== "CALLED") {
    throw new Error("僅能對目前叫號中的票券發送再次提醒");
  }

  await prisma.queueEvent.create({
    data: {
      merchantId: ticket.merchantId,
      branchId: ticket.branchId,
      queueId: ticket.queueId,
      ticketId: ticket.id,
      eventType: "TICKET_RECALLED",
      actorUserId,
      metadata: JSON.stringify({ recalledAt: new Date() }),
    },
  });

  if (ticket.user?.lineUserId) {
    await sendPushMessage({
      lineUserId: ticket.user.lineUserId,
      text: `【再次提醒】號碼 ${ticket.displayNumber} 請至櫃台！若未於 5 分鐘內就位將視為過號。`,
      dedupeKey: `queue-recalled:${ticket.id}:${Date.now()}`,
    });
  }

  return ticket;
}

// -----------------------------------------------------------------------------
// 5. 標記過號 (Pass Ticket)
// -----------------------------------------------------------------------------
export async function passTicket(ticketId: string, actorUserId: string) {
  return await prisma.$transaction(async (tx) => {
    const ticket = await tx.queueTicket.findUnique({
      where: { id: ticketId },
      include: { user: true },
    });

    if (!ticket || ticket.status !== "CALLED") {
      throw new Error("僅有已被叫號的票券可標記為過號");
    }

    const updated = await tx.queueTicket.update({
      where: { id: ticketId },
      data: {
        status: "PASSED",
        passedAt: new Date(),
      },
    });

    await tx.queueEvent.create({
      data: {
        merchantId: ticket.merchantId,
        branchId: ticket.branchId,
        queueId: ticket.queueId,
        ticketId: ticket.id,
        eventType: "TICKET_PASSED",
        actorUserId,
        oldState: JSON.stringify(ticket),
        newState: JSON.stringify(updated),
      },
    });

    if (ticket.user?.lineUserId) {
      await sendPushMessage({
        lineUserId: ticket.user.lineUserId,
        text: `【過號通知】號碼 ${ticket.displayNumber} 因未依時就位已標記過號。若回到現場請向店員告知，將為您安排補入佇列。`,
        dedupeKey: `queue-passed:${ticket.id}:${Date.now()}`,
      });
    }

    return updated;
  });
}

// -----------------------------------------------------------------------------
// 6. 過號客回歸並插入為下一位 (Insert Next - 關鍵解耦排序演算法)
// -----------------------------------------------------------------------------
export async function insertNextTicket(ticketId: string, actorUserId: string) {
  return await prisma.$transaction(async (tx) => {
    const ticket = await tx.queueTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket || (ticket.status !== "PASSED" && ticket.status !== "WAITING")) {
      throw new Error("該票券狀態無法執行插單至下一位");
    }

    // 尋找目前佇列第一順位的 sortKey
    const firstPos = await tx.queuePosition.findFirst({
      where: { queueId: ticket.queueId },
      orderBy: { sortKey: "asc" },
    });

    // 若佇列有其他人，取最小 sortKey / 2；若佇列為空，直接設為 1000.0
    const newSortKey = firstPos ? firstPos.sortKey / 2.0 : 1000.0;

    // 更新票券狀態為 RETURNED (過號回來)
    const updatedTicket = await tx.queueTicket.update({
      where: { id: ticketId },
      data: { status: "RETURNED" },
    });

    // 新增或更新 queue_position
    await tx.queuePosition.upsert({
      where: { ticketId },
      create: {
        queueId: ticket.queueId,
        ticketId,
        sortKey: newSortKey,
        insertedReason: "INSERT_NEXT",
        insertedBy: actorUserId,
      },
      update: {
        sortKey: newSortKey,
        insertedReason: "INSERT_NEXT",
        insertedBy: actorUserId,
      },
    });

    await tx.queueEvent.create({
      data: {
        merchantId: ticket.merchantId,
        branchId: ticket.branchId,
        queueId: ticket.queueId,
        ticketId,
        eventType: "TICKET_RETURNED",
        actorUserId,
        metadata: JSON.stringify({ assignedSortKey: newSortKey }),
      },
    });

    return updatedTicket;
  });
}

// -----------------------------------------------------------------------------
// 7. 開始服務與完成服務 (Service Lifecycle)
// -----------------------------------------------------------------------------
export async function startService(ticketId: string, actorUserId: string) {
  const updated = await prisma.queueTicket.update({
    where: { id: ticketId },
    data: {
      status: "SERVING",
      serviceStartedAt: new Date(),
    },
  });

  await prisma.queueEvent.create({
    data: {
      merchantId: updated.merchantId,
      branchId: updated.branchId,
      queueId: updated.queueId,
      ticketId,
      eventType: "SERVICE_STARTED",
      actorUserId,
    },
  });

  return updated;
}

export async function completeService(ticketId: string, actorUserId: string) {
  const updated = await prisma.queueTicket.update({
    where: { id: ticketId },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
    },
  });

  await prisma.queueEvent.create({
    data: {
      merchantId: updated.merchantId,
      branchId: updated.branchId,
      queueId: updated.queueId,
      ticketId,
      eventType: "SERVICE_COMPLETED",
      actorUserId,
    },
  });

  return updated;
}

// -----------------------------------------------------------------------------
// 8. 取消票券 (Cancel Ticket)
// -----------------------------------------------------------------------------
export async function cancelTicket(ticketId: string, actorUserId?: string) {
  return await prisma.$transaction(async (tx) => {
    const ticket = await tx.queueTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) throw new Error("找不到該號碼牌");
    if (["SERVING", "COMPLETED"].includes(ticket.status)) {
      throw new Error("服務中或已完成之號碼牌無法取消");
    }

    const updated = await tx.queueTicket.update({
      where: { id: ticketId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
      },
    });

    // 移除排序
    await tx.queuePosition.deleteMany({
      where: { ticketId },
    });

    await tx.queueEvent.create({
      data: {
        merchantId: ticket.merchantId,
        branchId: ticket.branchId,
        queueId: ticket.queueId,
        ticketId,
        eventType: "TICKET_CANCELLED",
        actorUserId,
      },
    });

    return updated;
  });
}
