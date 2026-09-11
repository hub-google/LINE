import { prisma } from "@/lib/prisma";
import { takeQueueTicket } from "@/lib/domain/queue";
import { sendPushMessage } from "@/lib/domain/line";

// -----------------------------------------------------------------------------
// 1. 查詢特定分店與日期的預約時段 (Availability)
// -----------------------------------------------------------------------------
export async function getReservationAvailability(branchId: string, dateStr: string) {
  // 查詢當日所有時段
  const startOfDay = new Date(`${dateStr}T00:00:00.000Z`);
  const endOfDay = new Date(`${dateStr}T23:59:59.999Z`);

  const slots = await prisma.reservationSlot.findMany({
    where: {
      branchId,
      startAt: { gte: startOfDay, lte: endOfDay },
      status: { not: "CLOSED" },
    },
    orderBy: { startAt: "asc" },
  });

  return slots.map((slot) => ({
    id: slot.id,
    startAt: slot.startAt,
    endAt: slot.endAt,
    capacity: slot.capacity,
    bookedCount: slot.bookedCount,
    availableCount: Math.max(0, slot.capacity - slot.bookedCount),
    isFull: slot.bookedCount >= slot.capacity,
  }));
}

// -----------------------------------------------------------------------------
// 2. 建立新預約 (防超賣樂觀鎖/悲觀鎖交易)
// -----------------------------------------------------------------------------
export async function createReservation(params: {
  merchantId: string;
  branchId: string;
  userId: string;
  slotId: string;
  customerName: string;
  customerPhone?: string;
  partySize?: number;
  notes?: string;
}) {
  const { merchantId, branchId, userId, slotId, customerName, customerPhone, partySize = 1, notes } = params;

  return await prisma.$transaction(async (tx) => {
    // 鎖定時段並檢查剩餘容量
    const slot = await tx.reservationSlot.findUnique({
      where: { id: slotId },
    });

    if (!slot || slot.status === "CLOSED") {
      throw new Error("此預約時段已關閉或不存在");
    }

    if (slot.bookedCount >= slot.capacity) {
      throw new Error("此預約時段已額滿，請選擇其他時段");
    }

    // 建立預約
    const reservation = await tx.reservation.create({
      data: {
        merchantId,
        branchId,
        userId,
        slotId,
        customerName,
        customerPhone,
        partySize,
        status: "CONFIRMED",
        notes,
      },
      include: {
        user: true,
        slot: true,
      },
    });

    // 累加時段訂位人數
    const newBookedCount = slot.bookedCount + 1;
    await tx.reservationSlot.update({
      where: { id: slotId },
      data: {
        bookedCount: newBookedCount,
        status: newBookedCount >= slot.capacity ? "FULL" : "OPEN",
      },
    });

    // 發送 LINE 通知
    if (reservation.user?.lineUserId) {
      const timeStr = slot.startAt.toISOString().replace("T", " ").substring(0, 16);
      await sendPushMessage({
        lineUserId: reservation.user.lineUserId,
        text: `【預約成功】您已成功預約 ${timeStr}，人數：${partySize} 人。期待您的光臨！`,
        dedupeKey: `reservation-confirmed:${reservation.id}`,
      });
    }

    return reservation;
  });
}

// -----------------------------------------------------------------------------
// 3. 預約到店報到 (Check-in) -> 自動合流進入排隊佇列
// -----------------------------------------------------------------------------
export async function checkInReservation(reservationId: string, actorUserId: string) {
  return await prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUnique({
      where: { id: reservationId },
      include: { user: true },
    });

    if (!reservation) throw new Error("找不到該預約");
    if (reservation.status !== "CONFIRMED") {
      throw new Error(`預約狀態為 ${reservation.status}，無法進行報到`);
    }

    // 取號合流
    const ticket = await takeQueueTicket({
      branchId: reservation.branchId,
      merchantId: reservation.merchantId,
      userId: reservation.userId,
      reservationId: reservation.id,
      notes: `預約報到 (${reservation.customerName})`,
      priority: 10, // 預約客人具備微優先級
    });

    // 更新預約狀態為 CHECKED_IN
    const updated = await tx.reservation.update({
      where: { id: reservationId },
      data: {
        status: "CHECKED_IN",
        checkInTicketId: ticket.id,
      },
    });

    await tx.auditLog.create({
      data: {
        merchantId: reservation.merchantId,
        branchId: reservation.branchId,
        actorUserId,
        actorRole: "STAFF",
        action: "RESERVATION_CHECKED_IN",
        resourceType: "RESERVATION",
        resourceId: reservationId,
        afterState: JSON.stringify({ ticketId: ticket.id, displayNumber: ticket.displayNumber }),
      },
    });

    return { reservation: updated, ticket };
  });
}
