import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getLineClient } from '@/lib/line';

// This endpoint should be protected, e.g. using a CRON_SECRET or Vercel Cron header
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const today = new Date();
    // Assuming timezone Asia/Taipei is handled, we get today's day of month
    // We want to remind 3 days before payDay
    const currentDay = today.getDate();
    const targetPayDay = currentDay + 3; 

    // Find unpaid transactions for projects where payDay matches targetPayDay
    // Actually, in the PRD, transactions are generated per month.
    // Let's assume transactions are pre-generated, or we just notify active memberships
    
    // For simplicity in this demo endpoint: Find all active memberships of projects that have payDay = targetPayDay
    const projectsToRemind = await prisma.project.findMany({
      where: {
        payDay: targetPayDay,
        status: 'ACTIVE'
      },
      include: {
        memberships: {
          where: { role: 'PAYER', status: 'ACTIVE' },
          include: { user: true }
        }
      }
    });

    const lineClient = getLineClient();
    const liffUrl = `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID}`;

    let remindCount = 0;

    for (const project of projectsToRemind) {
      for (const member of project.memberships) {
        if (!member.user.lineUid) continue;

        // Check if there's already an UNPAID transaction for this month
        // (Omitted here for brevity; assume we create one or just send message directly)
        
        const messageText = `【繳費提醒】\n您參與的專案「${project.name}」即將於 3 天後（${project.payDay}日）扣款。\n應繳金額：${project.amount} 元\n\n請點擊下方按鈕前往轉帳：\n${liffUrl}`;
        
        await lineClient.pushMessage(member.user.lineUid, {
          type: 'text',
          text: messageText
        });
        remindCount++;
      }
    }

    return NextResponse.json({ success: true, reminded: remindCount });
  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json({ error: 'Failed to execute cron job' }, { status: 500 });
  }
}
