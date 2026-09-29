import { NextRequest, NextResponse } from "next/server";
import { validateSignature } from "@line/bot-sdk";
import { lineClient } from "@/lib/line";
import { prisma } from "@/lib/prisma";

const channelSecret = process.env.LINE_CHANNEL_SECRET || "";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("x-line-signature");
  if (!channelSecret || !signature || !validateSignature(body, channelSecret, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(body);
  for (const event of payload.events || []) {
    const lineUid = event.source?.userId as string | undefined;

    if (event.type === "follow" && lineUid) {
      await prisma.user.updateMany({ where: { lineUid }, data: { notificationsEnabled: true } });
    }
    if (event.type === "unfollow" && lineUid) {
      await prisma.user.updateMany({ where: { lineUid }, data: { notificationsEnabled: false } });
    }

    if (event.type === "message" && event.message?.type === "text" && event.replyToken) {
      if (event.message.text.trim() === "開始建立專案") {
        const liffUrl = `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID || ""}`;
        await lineClient.replyMessage(event.replyToken, {
          type: "text",
          text: `請開啟定期收款對帳小幫手：\n${liffUrl}`,
        });
      }
    }
  }

  return NextResponse.json({ success: true });
}
