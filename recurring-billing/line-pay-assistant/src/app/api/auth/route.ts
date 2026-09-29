import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signUserToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { idToken } = await req.json();
    const clientId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (!idToken || !clientId) return NextResponse.json({ error: "Missing LINE login configuration" }, { status: 400 });

    const verifyRes = await fetch("https://api.line.me/oauth2/v2.1/verify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id_token: idToken, client_id: clientId }).toString(),
    });
    const verifyData = await verifyRes.json();
    if (!verifyRes.ok || verifyData.error || !verifyData.sub) {
      return NextResponse.json({ error: verifyData.error_description || "Invalid LINE idToken" }, { status: 401 });
    }

    const user = await prisma.user.upsert({
      where: { lineUid: verifyData.sub },
      update: {
        displayName: verifyData.name || null,
        avatarUrl: verifyData.picture || null,
        notificationsEnabled: true,
      },
      create: {
        lineUid: verifyData.sub,
        displayName: verifyData.name || null,
        avatarUrl: verifyData.picture || null,
      },
    });

    return NextResponse.json({
      token: signUserToken({ userId: user.id, lineUid: user.lineUid }),
      user,
    });
  } catch (error) {
    console.error("Auth Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
