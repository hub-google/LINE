import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-development-only';

const getUserFromAuthHeader = (req: NextRequest) => {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string, lineUid: string };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = getUserFromAuthHeader(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = params.id;

  try {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const membership = await prisma.membership.upsert({
      where: {
        projectId_userId: {
          projectId,
          userId: user.userId
        }
      },
      update: { status: 'ACTIVE' },
      create: {
        projectId,
        userId: user.userId,
        role: 'PAYER'
      }
    });

    return NextResponse.json({ success: true, membership });
  } catch (error) {
    console.error('Join project error:', error);
    return NextResponse.json({ error: 'Failed to join project' }, { status: 500 });
  }
}
