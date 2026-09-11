import { NextRequest, NextResponse } from 'next/server';
import { validateSignature } from '@line/bot-sdk';
import { lineClient } from '@/lib/line';

const channelSecret = process.env.LINE_CHANNEL_SECRET || '';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get('x-line-signature');

  if (!signature || !validateSignature(body, channelSecret, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const events = JSON.parse(body).events;

  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      // Basic echo or help response
      if (event.message.text === '開始建立專案') {
        const liffUrl = `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID}`;
        await lineClient.replyMessage(event.replyToken, {
          type: 'text',
          text: `請點擊下方連結建立您的定期收費專案：\n${liffUrl}`
        });
      }
    }
  }

  return NextResponse.json({ success: true });
}
