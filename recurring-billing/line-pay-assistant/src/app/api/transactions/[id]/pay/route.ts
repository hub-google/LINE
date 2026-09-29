import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromAuthHeader } from "@/lib/auth";
import { getLineClient } from "@/lib/line";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getUserFromAuthHeader(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    const tx = await prisma.transaction.findUnique({
      where: { id },
      include: { project: { include: { initiator: true } }, payer: true },
    });
    if (!tx) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    if (tx.payerId !== user.userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (tx.status !== "UNPAID" && tx.status !== "OVERDUE") {
      return NextResponse.json({ error: "Invalid transaction status" }, { status: 409 });
    }

    const updated = await prisma.transaction.update({
      where: { id },
      data: { status: "PENDING", paidAt: new Date() },
    });

    if (tx.project.initiator.notificationsEnabled) {
      try {
        await getLineClient().pushMessage(tx.project.initiator.lineUid, {
          type: "text",
          text: "【待核對】" + (tx.payer.displayName || "付款人") + " 已回報「" + tx.project.name + "」" + tx.billingMonth + " 帳款已轉帳，請確認實際入帳後再按確認收款。",
        });
      } catch (error) {
        console.error("Notify initiator failed:", error);
      }
    }
    return NextResponse.json({ success: true, transaction: updated });
  } catch (error) {
    console.error("Pay transaction error:", error);
    return NextResponse.json({ error: "Failed to update transaction" }, { status: 500 });
  }
}
