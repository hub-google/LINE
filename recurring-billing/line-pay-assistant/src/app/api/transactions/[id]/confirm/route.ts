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
      include: { project: true, payer: true },
    });
    if (!tx) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    if (tx.project.initiatorId !== user.userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (tx.status !== "PENDING") return NextResponse.json({ error: "Transaction is not pending" }, { status: 409 });

    const updated = await prisma.transaction.update({
      where: { id },
      data: { status: "COMPLETED", confirmedAt: new Date() },
    });

    if (tx.payer.notificationsEnabled) {
      try {
        await getLineClient().pushMessage(tx.payer.lineUid, {
          type: "text",
          text: "【收款確認】「" + tx.project.name + "」" + tx.billingMonth + " 帳款 NT$ " + tx.amount.toString() + " 已由發起人確認收款。",
        });
      } catch (error) {
        console.error("Notify payer failed:", error);
      }
    }
    return NextResponse.json({ success: true, transaction: updated });
  } catch (error) {
    console.error("Confirm transaction error:", error);
    return NextResponse.json({ error: "Failed to confirm transaction" }, { status: 500 });
  }
}
