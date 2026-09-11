import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromAuthHeader } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getUserFromAuthHeader(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId } = await params;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (project.initiatorId === user.userId) {
    return NextResponse.json({ error: "Initiator cannot leave own project" }, { status: 400 });
  }

  const changed = await prisma.membership.updateMany({
    where: { projectId, userId: user.userId, status: "ACTIVE" },
    data: { status: "INACTIVE" },
  });
  if (!changed.count) return NextResponse.json({ error: "Active membership not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
