import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sendPushMessage } from "@/lib/domain/line";

const LINE_PAY_CHANNEL_ID = process.env.LINE_PAY_CHANNEL_ID;
const LINE_PAY_CHANNEL_SECRET = process.env.LINE_PAY_CHANNEL_SECRET;
const LINE_PAY_API_BASE_URL = process.env.LINE_PAY_API_BASE_URL || "https://sandbox-api-pay.line.me";
const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:3000";
const MOCK_LINE_SERVICES = process.env.MOCK_LINE_SERVICES === "true";

// -----------------------------------------------------------------------------
// 1. LINE Pay Online API v4 HMAC-SHA256 簽署器
// -----------------------------------------------------------------------------
function generateLinePayHeaders(uri: string, requestBody: string) {
  const nonce = crypto.randomUUID();
  const secret = LINE_PAY_CHANNEL_SECRET || "";
  const signatureString = secret + uri + requestBody + nonce;
  const signature = crypto.createHmac("sha256", secret).update(signatureString).digest("base64");

  return {
    "Content-Type": "application/json",
    "X-LINE-ChannelId": LINE_PAY_CHANNEL_ID || "",
    "X-LINE-Authorization-Nonce": nonce,
    "X-LINE-Authorization": signature,
  };
}

// -----------------------------------------------------------------------------
// 2. 發起 LINE Pay 支付請求 (Request Payment)
// -----------------------------------------------------------------------------
export async function requestLinePayment(params: {
  orderId: string;
  orderItemIds: string[];
  idempotencyKey?: string;
}) {
  const { orderId, orderItemIds, idempotencyKey = crypto.randomUUID() } = params;

  return await prisma.$transaction(async (tx) => {
    // 1. 查詢訂單與待付款品項
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          where: { id: { in: orderItemIds } },
        },
      },
    });

    if (!order) throw new Error("找不到該訂單");

    const unpaidItems = order.items.filter((item) => item.paymentStatus === "UNPAID");
    if (unpaidItems.length === 0) {
      throw new Error("所選品項皆已付款或無有效待付款品項");
    }

    // 2. 伺服器端唯一計算應付金額 (嚴禁信任前端傳入金額)
    const expectedAmount = unpaidItems.reduce((acc, cur) => acc + cur.totalAmount, 0);

    // 3. 建立內部 Payment 意圖記錄
    const payment = await tx.payment.create({
      data: {
        orderId,
        provider: "LINE_PAY",
        method: "LINE_PAY",
        status: "CREATED",
        amount: expectedAmount,
        currency: "TWD",
        idempotencyKey,
      },
    });

    // 4. 判斷是否為本地模擬模式
    const isMock =
      MOCK_LINE_SERVICES ||
      !LINE_PAY_CHANNEL_ID ||
      LINE_PAY_CHANNEL_ID.includes("your_") ||
      !LINE_PAY_CHANNEL_SECRET ||
      LINE_PAY_CHANNEL_SECRET.includes("your_");

    if (isMock) {
      const mockTransactionId = `MOCK_TX_${Date.now()}`;
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "REQUESTED",
          externalTransactionId: mockTransactionId,
          metadata: JSON.stringify({ unpaidItemIds: unpaidItems.map((i) => i.id) }),
        },
      });

      return {
        paymentId: payment.id,
        transactionId: mockTransactionId,
        paymentUrl: `${APP_BASE_URL}/c/pay/mock?paymentId=${payment.id}&transactionId=${mockTransactionId}&amount=${expectedAmount}`,
        isMock: true,
      };
    }

    // 5. 正式呼叫 LINE Pay Online API v4 POST /v4/payments/request
    const uri = "/v4/payments/request";
    const linePayPayload = {
      amount: expectedAmount,
      currency: "TWD",
      orderId: `${order.orderNumber}_P${payment.id.substring(0, 6)}`,
      packages: [
        {
          id: `PKG_${order.id.substring(0, 8)}`,
          amount: expectedAmount,
          name: `門市點單 (${order.orderNumber})`,
          products: unpaidItems.map((item) => ({
            id: item.id,
            name: item.nameSnapshot,
            quantity: item.quantity,
            price: item.unitPrice,
          })),
        },
      ],
      redirectUrls: {
        confirmUrl: `${APP_BASE_URL}/api/v1/payments/line-pay/confirm?paymentId=${payment.id}`,
        cancelUrl: `${APP_BASE_URL}/c/pay/result?status=CANCELLED&orderId=${order.id}`,
      },
    };

    const bodyStr = JSON.stringify(linePayPayload);
    const headers = generateLinePayHeaders(uri, bodyStr);

    const res = await fetch(`${LINE_PAY_API_BASE_URL}${uri}`, {
      method: "POST",
      headers,
      body: bodyStr,
    });

    const responseData = await res.json();
    if (!res.ok || responseData.returnCode !== "0000") {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED", failedAt: new Date(), metadata: JSON.stringify(responseData) },
      });
      throw new Error(`LINE Pay 請求失敗: [${responseData.returnCode}] ${responseData.returnMessage}`);
    }

    const transactionId = String(responseData.info.transactionId);
    const paymentUrl = responseData.info.paymentUrl.web || responseData.info.paymentUrl.app;

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "REQUESTED",
        externalTransactionId: transactionId,
        metadata: JSON.stringify({
          unpaidItemIds: unpaidItems.map((i) => i.id),
          linePayResponse: responseData,
        }),
      },
    });

    return {
      paymentId: payment.id,
      transactionId,
      paymentUrl,
      isMock: false,
    };
  });
}

// -----------------------------------------------------------------------------
// 3. 核銷確認支付 (Confirm Payment) - 項目級分配與冪等防重刷
// -----------------------------------------------------------------------------
export async function confirmLinePayment(params: {
  paymentId: string;
  transactionId: string;
}) {
  const { paymentId, transactionId } = params;

  return await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      include: {
        order: {
          include: {
            items: true,
            user: true,
          },
        },
      },
    });

    if (!payment) throw new Error("找不到付款記錄");

    // 冪等性防護：若已是 PAID 狀態，直接返回既有成功資訊，絕不重複分配！
    if (payment.status === "PAID") {
      return { success: true, orderId: payment.orderId, alreadyPaid: true };
    }

    const metadata = payment.metadata ? JSON.parse(payment.metadata) : {};
    const itemIdsToAllocate: string[] = metadata.unpaidItemIds || [];

    const isMock =
      MOCK_LINE_SERVICES ||
      transactionId.startsWith("MOCK_TX_") ||
      !LINE_PAY_CHANNEL_ID ||
      LINE_PAY_CHANNEL_ID.includes("your_");

    if (!isMock) {
      // 呼叫 LINE Pay Online API v4 POST /v4/payments/{transactionId}/confirm
      const uri = `/v4/payments/${transactionId}/confirm`;
      const bodyPayload = {
        amount: payment.amount,
        currency: payment.currency,
      };
      const bodyStr = JSON.stringify(bodyPayload);
      const headers = generateLinePayHeaders(uri, bodyStr);

      const res = await fetch(`${LINE_PAY_API_BASE_URL}${uri}`, {
        method: "POST",
        headers,
        body: bodyStr,
      });

      const responseData = await res.json();
      if (!res.ok || responseData.returnCode !== "0000") {
        await tx.payment.update({
          where: { id: paymentId },
          data: { status: "FAILED", failedAt: new Date(), metadata: JSON.stringify(responseData) },
        });
        throw new Error(`LINE Pay Confirm 失敗: [${responseData.returnCode}] ${responseData.returnMessage}`);
      }
    }

    // 4. 核銷成功：建立 Payment Allocations 並標記品項已付
    for (const itemId of itemIdsToAllocate) {
      const orderItem = payment.order.items.find((i) => i.id === itemId);
      if (orderItem) {
        await tx.paymentAllocation.create({
          data: {
            paymentId: payment.id,
            orderItemId: orderItem.id,
            amount: orderItem.totalAmount,
          },
        });

        await tx.orderItem.update({
          where: { id: orderItem.id },
          data: { paymentStatus: "PAID" },
        });
      }
    }

    // 5. 更新 Payment 狀態為 PAID
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "PAID",
        paidAt: new Date(),
      },
    });

    // 6. 重新計算訂單總額
    const newPaidTotal = payment.order.paidTotal + payment.amount;
    const newDueTotal = Math.max(0, payment.order.subtotal - newPaidTotal);
    const newOrderStatus = newDueTotal === 0 ? "PAID" : "PARTIALLY_PAID";

    await tx.order.update({
      where: { id: payment.orderId },
      data: {
        paidTotal: newPaidTotal,
        dueTotal: newDueTotal,
        status: newOrderStatus,
      },
    });

    // 7. 發送推播通知
    if (payment.order.user?.lineUserId) {
      await sendPushMessage({
        lineUserId: payment.order.user.lineUserId,
        text: `【付款成功】您的訂單 ${payment.order.orderNumber} 已成功支付 NT$ ${payment.amount} (LINE Pay)。感謝您的惠顧！`,
        dedupeKey: `payment-success:${payment.id}`,
      });
    }

    return { success: true, orderId: payment.orderId, alreadyPaid: false };
  });
}

// -----------------------------------------------------------------------------
// 4. 門市現場手動結帳 (Manual Cash / Card Payment)
// -----------------------------------------------------------------------------
export async function manualCashPayment(params: {
  orderId: string;
  orderItemIds: string[];
  paymentMethod?: "CASH" | "CARD" | "OTHER";
  actorUserId: string;
}) {
  const { orderId, orderItemIds, paymentMethod = "CASH", actorUserId } = params;

  return await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          where: { id: { in: orderItemIds } },
        },
      },
    });

    if (!order) throw new Error("找不到該訂單");

    const unpaidItems = order.items.filter((item) => item.paymentStatus === "UNPAID");
    if (unpaidItems.length === 0) {
      throw new Error("所選品項皆已付款");
    }

    const totalToCollect = unpaidItems.reduce((acc, cur) => acc + cur.totalAmount, 0);

    // 建立 Payment
    const payment = await tx.payment.create({
      data: {
        orderId,
        provider: `MANUAL_${paymentMethod}`,
        method: paymentMethod,
        status: "PAID",
        amount: totalToCollect,
        currency: "TWD",
        idempotencyKey: crypto.randomUUID(),
        paidAt: new Date(),
        metadata: JSON.stringify({ collectedByUserId: actorUserId }),
      },
    });

    // 建立 Allocations
    for (const item of unpaidItems) {
      await tx.paymentAllocation.create({
        data: {
          paymentId: payment.id,
          orderItemId: item.id,
          amount: item.totalAmount,
        },
      });

      await tx.orderItem.update({
        where: { id: item.id },
        data: { paymentStatus: "PAID" },
      });
    }

    const newPaidTotal = order.paidTotal + totalToCollect;
    const newDueTotal = Math.max(0, order.subtotal - newPaidTotal);
    const newOrderStatus = newDueTotal === 0 ? "PAID" : "PARTIALLY_PAID";

    const updatedOrder = await tx.order.update({
      where: { id: orderId },
      data: {
        paidTotal: newPaidTotal,
        dueTotal: newDueTotal,
        status: newOrderStatus,
      },
      include: { items: true },
    });

    // 寫入 Audit Log
    await tx.auditLog.create({
      data: {
        merchantId: order.merchantId,
        branchId: order.branchId,
        actorUserId,
        actorRole: "STAFF",
        action: "MANUAL_PAYMENT_COLLECTED",
        resourceType: "PAYMENT",
        resourceId: payment.id,
        afterState: JSON.stringify({ amount: totalToCollect, method: paymentMethod }),
      },
    });

    return { payment, order: updatedOrder };
  });
}
