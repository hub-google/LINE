import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromAuthHeader } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = getUserFromAuthHeader(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projects = await prisma.project.findMany({
    where: {
      OR: [
        { initiatorId: user.userId },
        { memberships: { some: { userId: user.userId, status: "ACTIVE" } } },
      ],
    },
    include: {
      initiator: { select: { id: true, displayName: true, avatarUrl: true } },
      memberships: {
        where: { status: "ACTIVE" },
        include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
      },
      transactions: {
        orderBy: { createdAt: "desc" },
        take: 100,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ projects });
}

export async function POST(req: NextRequest) {
  const user = getUserFromAuthHeader(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const name = String(body.name || "").trim();
    const amount = Number(body.amount);
    const payDay = Number(body.payDay);
    const paymentLink = String(body.paymentLink || "").trim();

    if (!name || name.length > 100) return NextResponse.json({ error: "Invalid project name" }, { status: 400 });
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 });
    if (!Number.isInteger(payDay) || payDay < 1 || payDay > 31) return NextResponse.json({ error: "payDay must be 1-31" }, { status: 400 });
    if (!/^https?:\/\//i.test(paymentLink)) return NextResponse.json({ error: "A valid payment link is required" }, { status: 400 });

    const project = await prisma.project.create({
      data: {
        initiatorId: user.userId,
        name,
        amount,
        payDay,
        paymentLink,
        memberships: { create: { userId: user.userId, role: "INITIATOR" } },
      },
    });
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    console.error("Create project error:", error);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}
