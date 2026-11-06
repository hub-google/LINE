import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";

const LINE_MESSAGING_CHANNEL_SECRET = process.env.LINE_MESSAGING_CHANNEL_SECRET;

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-line-signature");

    if (!signature && process.env.MOCK_LINE_SERVICES !== "true") {
      return apiError("UNAUTHORIZED", "缺少 x-line-signature 簽名", 401);
    }

    // 驗證 HMAC-SHA256 簽名
    if (LINE_MESSAGING_CHANNEL_SECRET && !LINE_MESSAGING_CHANNEL_SECRET.includes("your_")) {
      const expectedSignature = crypto
        .createHmac("sha256", LINE_MESSAGING_CHANNEL_SECRET)
        .update(rawBody)
        .digest("base64");

      if (signature !== expectedSignature) {
        return apiError("FORBIDDEN", "LINE Webhook 簽名驗證不符", 403);
      }
    }

    const payload = JSON.parse(rawBody);
    const events = payload.events || [];

    for (const event of events) {
      console.log(`[LINE Webhook Event Received] Type: ${event.type} from: ${event.source?.userId}`);
      // 可處理 follow, unfollow, message, postback 等事件
    }

    return NextResponse.json({ status: "OK" });
  } catch (err: any) {
    console.error("[LINE Webhook Error]", err);
    return apiError("SERVER_ERROR", err.message, 500);
  }
}
