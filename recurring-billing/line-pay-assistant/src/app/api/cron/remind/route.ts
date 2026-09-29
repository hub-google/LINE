import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLineClient } from "@/lib/line";
import { ensureMonthlyTransaction, isReminderDay } from "@/lib/billing";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const projects = await prisma.project.findMany({
      where: { status: "ACTIVE" },
      include: {
        memberships: {
          where: { role: "PAYER", status: "ACTIVE" },
          include: { user: true },
        },
      },
    });

    const lineClient = getLineClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    let reminded = 0;

    for (const project of projects) {
      if (!isReminderDay(project.payDay)) continue;
      for (const member of project.memberships) {
        if (!member.user.notificationsEnabled) continue;
        const tx = await ensureMonthlyTransaction(project.id, member.userId, project.amount);
        if (!["UNPAID", "OVERDUE"].includes(tx.status)) continue;

        await lineClient.pushMessage(member.user.lineUid, {
          type: "text",
          text:
            `【繳費提醒】\n「${project.name}」本月應繳 ${project.amount} 元，繳款日為每月 ${project.payDay} 日。\n` +
            `請開啟專案頁查看發起人的 LINE Pay／轉帳連結，完成後回報「我已轉帳」。` +
            (appUrl ? `\n${appUrl}` : ""),
        });

        await prisma.transaction.update({ where: { id: tx.id }, data: { notifiedAt: new Date() } });
        reminded++;
      }
    }

    return NextResponse.json({ success: true, reminded });
  } catch (error) {
    console.error("Cron job error:", error);
    return NextResponse.json({ error: "Failed to execute cron job" }, { status: 500 });
  }
}
