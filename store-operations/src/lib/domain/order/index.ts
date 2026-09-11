import { prisma } from "@/lib/prisma";

export interface CreateOrderItemInput {
  catalogItemId: string;
  quantity: number;
}

// -----------------------------------------------------------------------------
// 1. 建立新訂單 (品項價格快照與初始統計)
// -----------------------------------------------------------------------------
export async function createOrder(params: {
  merchantId: string;
  branchId: string;
  userId?: string;
  reservationId?: string;
  queueTicketId?: string;
  items: CreateOrderItemInput[];
}) {
  const { merchantId, branchId, userId, reservationId, queueTicketId, items } = params;

  if (!items || items.length === 0) {
    throw new Error("訂單必須包含至少一項品項");
  }

  // 1. 批次查詢 Catalog Items 以取得可信單價與名稱快照
  const catalogItemIds = items.map((i) => i.catalogItemId);
  const catalogItems = await prisma.catalogItem.findMany({
    where: {
      id: { in: catalogItemIds },
      merchantId,
      active: true,
      isDeleted: false,
    },
  });

  const catalogMap = new Map(catalogItems.map((c) => [c.id, c]));

  // 2. 計算總額並構建快照
  let subtotal = 0;
  const orderItemsData = items.map((input) => {
    const catalog = catalogMap.get(input.catalogItemId);
    if (!catalog) {
      throw new Error(`品項不存在或已下架 (ID: ${input.catalogItemId})`);
    }
    const quantity = Math.max(1, input.quantity);
    const totalAmount = catalog.price * quantity;
    subtotal += totalAmount;

    return {
      catalogItemId: catalog.id,
      nameSnapshot: catalog.name,
      unitPrice: catalog.price,
      quantity,
      totalAmount,
      paymentStatus: "UNPAID",
      fulfillmentStatus: "PENDING",
      addedSource: "ONLINE",
    };
  });

  // 產生唯一訂單編號 (例如 ORD-20260903-XXXX)
  const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`;

  return await prisma.order.create({
    data: {
      merchantId,
      branchId,
      userId,
      reservationId,
      queueTicketId,
      orderNumber,
      status: "OPEN",
      currency: "TWD",
      subtotal,
      discountTotal: 0,
      paidTotal: 0,
      dueTotal: subtotal,
      items: {
        create: orderItemsData,
      },
    },
    include: {
      items: true,
    },
  });
}

// -----------------------------------------------------------------------------
// 2. 追加品項 (現場追加或顧客線上加點)
// -----------------------------------------------------------------------------
export async function addItemsToOrder(params: {
  orderId: string;
  items: CreateOrderItemInput[];
  addedByUserId?: string;
  source?: "ONLINE" | "STAFF_ONSITE";
}) {
  const { orderId, items, addedByUserId, source = "STAFF_ONSITE" } = params;

  return await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) throw new Error("找不到該訂單");
    if (["COMPLETED", "CANCELLED", "REFUNDED"].includes(order.status)) {
      throw new Error("已結案或已取消的訂單不可再追加品項");
    }

    const catalogItemIds = items.map((i) => i.catalogItemId);
    const catalogItems = await tx.catalogItem.findMany({
      where: { id: { in: catalogItemIds }, merchantId: order.merchantId },
    });
    const catalogMap = new Map(catalogItems.map((c) => [c.id, c]));

    let addedAmount = 0;
    for (const input of items) {
      const catalog = catalogMap.get(input.catalogItemId);
      if (!catalog) throw new Error(`品項不存在 (ID: ${input.catalogItemId})`);

      const qty = Math.max(1, input.quantity);
      const totalAmount = catalog.price * qty;
      addedAmount += totalAmount;

      await tx.orderItem.create({
        data: {
          orderId,
          catalogItemId: catalog.id,
          nameSnapshot: catalog.name,
          unitPrice: catalog.price,
          quantity: qty,
          totalAmount,
          paymentStatus: "UNPAID",
          fulfillmentStatus: "PENDING",
          addedSource: source,
          addedByUserId,
        },
      });
    }

    // 重新計算訂單總額與應付金額
    const newSubtotal = order.subtotal + addedAmount;
    const newDueTotal = order.dueTotal + addedAmount;
    const newStatus = order.paidTotal > 0 ? "PARTIALLY_PAID" : "OPEN";

    return await tx.order.update({
      where: { id: orderId },
      data: {
        subtotal: newSubtotal,
        dueTotal: newDueTotal,
        status: newStatus,
      },
      include: { items: true },
    });
  });
}
