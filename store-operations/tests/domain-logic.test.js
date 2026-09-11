import { test, describe } from "node:test";
import assert from "node:assert/strict";

describe("Domain Invariant 1 & 2: 號碼與排隊服務順序解耦 (Queue Ordering & Invariants)", () => {
  test("Ticket Number 建立後保持不變，候位順序由 sort_key 決定", () => {
    // 假設佇列中有 3 位顧客
    const tickets = [
      { id: "t-51", ticketNumber: 51, displayNumber: "A051", status: "WAITING" },
      { id: "t-52", ticketNumber: 52, displayNumber: "A052", status: "WAITING" },
      { id: "t-53", ticketNumber: 53, displayNumber: "A053", status: "WAITING" },
    ];

    let positions = [
      { ticketId: "t-51", sortKey: 1000.0 },
      { ticketId: "t-52", sortKey: 2000.0 },
      { ticketId: "t-53", sortKey: 3000.0 },
    ];

    // 叫號第一位
    positions.sort((a, b) => a.sortKey - b.sortKey);
    const firstCall = positions.shift();
    assert.equal(firstCall.ticketId, "t-51");
    tickets[0].status = "SERVING";

    // 25 號過號客 (Passed) 回到現場，店員選擇「插單為下一位 (insert-next)」
    const returnedTicket = { id: "t-25", ticketNumber: 25, displayNumber: "A025", status: "PASSED" };
    // 取得當前第一順位 (t-52, key = 2000.0)
    const currentFirstPos = positions[0];
    const newSortKey = currentFirstPos.sortKey / 2.0; // 1000.0

    returnedTicket.status = "RETURNED";
    positions.unshift({ ticketId: "t-25", sortKey: newSortKey });

    // 驗證順序
    positions.sort((a, b) => a.sortKey - b.sortKey);
    assert.equal(positions[0].ticketId, "t-25", "25 號應成為第一順位被叫號");
    assert.equal(positions[1].ticketId, "t-52", "25 號完成後應接著叫 52 號");
    assert.equal(positions[2].ticketId, "t-53", "最後叫 53 號");

    // 核心 Invariant 驗證：ticketNumber 絕未倒退或被竄改
    assert.equal(returnedTicket.ticketNumber, 25);
    assert.equal(tickets[1].ticketNumber, 52);
    assert.equal(tickets[2].ticketNumber, 53);
  });
});

describe("Domain Invariant 3 & 4: 項目級支付與分配 (Item-Level Payment Allocation)", () => {
  test("支援線上部分付款、現場追加項目與多次補付款", () => {
    // 1. 線上建立初始訂單
    const orderItems = [
      { id: "item-1", name: "剪髮", unitPrice: 600, qty: 1, total: 600, paymentStatus: "UNPAID" },
      { id: "item-2", name: "護髮", unitPrice: 800, qty: 1, total: 800, paymentStatus: "UNPAID" },
      { id: "item-3", name: "染髮", unitPrice: 2000, qty: 1, total: 2000, paymentStatus: "UNPAID" },
    ];

    let subtotal = orderItems.reduce((acc, cur) => acc + cur.total, 0); // 3400
    let paidTotal = 0;
    let dueTotal = subtotal;
    assert.equal(subtotal, 3400);
    assert.equal(dueTotal, 3400);

    // 2. 顧客透過 LINE Pay 先支付 item-1 + item-2
    const payment1SelectedIds = ["item-1", "item-2"];
    const payment1Amount = orderItems
      .filter((i) => payment1SelectedIds.includes(i.id))
      .reduce((acc, cur) => acc + cur.total, 0);

    assert.equal(payment1Amount, 1400);

    // 模擬 LINE Pay Confirm 成功，執行分配
    const payment1Allocations = [];
    for (const id of payment1SelectedIds) {
      const item = orderItems.find((i) => i.id === id);
      item.paymentStatus = "PAID";
      payment1Allocations.push({ itemId: item.id, amount: item.total });
    }
    paidTotal += payment1Amount;
    dueTotal = subtotal - paidTotal;

    assert.equal(paidTotal, 1400);
    assert.equal(dueTotal, 2000);
    assert.equal(orderItems[0].paymentStatus, "PAID");
    assert.equal(orderItems[1].paymentStatus, "PAID");
    assert.equal(orderItems[2].paymentStatus, "UNPAID");

    // 3. 現場追加 item-4: 頭皮護理 $500
    const newItem = { id: "item-4", name: "頭皮護理", unitPrice: 500, qty: 1, total: 500, paymentStatus: "UNPAID" };
    orderItems.push(newItem);
    subtotal += newItem.total;
    dueTotal = subtotal - paidTotal;

    assert.equal(subtotal, 3900);
    assert.equal(dueTotal, 2500);

    // 4. 店員現場收取現金結清剩餘項目 (item-3 + item-4)
    const payment2SelectedIds = ["item-3", "item-4"];
    const payment2Amount = orderItems
      .filter((i) => payment2SelectedIds.includes(i.id))
      .reduce((acc, cur) => acc + cur.total, 0);

    assert.equal(payment2Amount, 2500);
    for (const id of payment2SelectedIds) {
      const item = orderItems.find((i) => i.id === id);
      item.paymentStatus = "PAID";
    }
    paidTotal += payment2Amount;
    dueTotal = subtotal - paidTotal;

    assert.equal(paidTotal, 3900);
    assert.equal(dueTotal, 0);
    assert.ok(orderItems.every((i) => i.paymentStatus === "PAID"), "所有項目均已結清");
  });
});

describe("Domain Invariant 5 & 6: RBAC 矩陣與權限阻擋", () => {
  const ROLE_PERMISSIONS = {
    CUSTOMER: ["queue.read.self", "queue.create", "order.checkout.line_pay"],
    STAFF: ["queue.read", "queue.call", "order.checkout", "payment.collect"],
    MANAGER: ["queue.read", "queue.call", "queue.reorder", "member.invite.staff", "payment.refund"],
    OWNER: ["*"],
  };

  function hasPerm(role, perm) {
    if (role === "OWNER") return true;
    return ROLE_PERMISSIONS[role]?.includes(perm) || false;
  }

  test("一般顧客無法執行店員叫號與管理", () => {
    assert.equal(hasPerm("CUSTOMER", "queue.call"), false);
    assert.equal(hasPerm("CUSTOMER", "payment.collect"), false);
  });

  test("一般店員無權邀請主管或執行退款", () => {
    assert.equal(hasPerm("STAFF", "member.invite.staff"), false);
    assert.equal(hasPerm("STAFF", "payment.refund"), false);
  });

  test("店長具備叫號重排與退款權限", () => {
    assert.equal(hasPerm("MANAGER", "queue.reorder"), true);
    assert.equal(hasPerm("MANAGER", "payment.refund"), true);
  });
});
