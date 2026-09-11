import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-development-only';
const LINE_CLIENT_ID = process.env.NEXT_PUBLIC_LIFF_ID;

export async function POST(req: NextRequest) {
  try {
    const { idToken } = await req.json();

    if (!idToken) {
      return NextResponse.json({ error: 'Missing idToken' }, { status: 400 });
    }

    // Verify idToken with LINE API
    const verifyRes = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        id_token: idToken,
        client_id: LINE_CLIENT_ID || '', // LIFF Channel ID
      }).toString(),
    });

    const verifyData = await verifyRes.json();

    if (verifyData.error) {
      return NextResponse.json({ error: verifyData.error_description }, { status: 401 });
    }

    const { sub: lineUid, name: displayName, picture: avatarUrl } = verifyData;

    // Find or create user in our DB
    const user = await prisma.user.upsert({
      where: { lineUid },
      update: {
        displayName,
        avatarUrl,
      },
      create: {
        lineUid,
        displayName,
        avatarUrl,
      },
    });

    // Sign our own JWT
    const token = jwt.sign(
      { userId: user.id, lineUid: user.lineUid },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    return NextResponse.json({ token, user });

  } catch (error) {
    console.error('Auth Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
