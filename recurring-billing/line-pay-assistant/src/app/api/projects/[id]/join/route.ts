import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromAuthHeader } from "@/lib/auth";
import { ensureMonthlyTransaction } from "@/lib/billing";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getUserFromAuthHeader(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId } = await params;

  try {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.status !== "ACTIVE") {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const membership = await prisma.membership.upsert({
      where: { projectId_userId: { projectId, userId: user.userId } },
      update: { status: "ACTIVE" },
      create: { projectId, userId: user.userId, role: project.initiatorId === user.userId ? "INITIATOR" : "PAYER" },
    });

    if (project.initiatorId !== user.userId) {
      await ensureMonthlyTransaction(project.id, user.userId, project.amount);
    }
    return NextResponse.json({ success: true, membership });
  } catch (error) {
    console.error("Join project error:", error);
    return NextResponse.json({ error: "Failed to join project" }, { status: 500 });
  }
}
