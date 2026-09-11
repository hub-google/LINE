import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-development-only';

// Helper to get user from token
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

export async function GET(req: NextRequest) {
  const user = getUserFromAuthHeader(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Get projects where user is either initiator or member
  const projects = await prisma.project.findMany({
    where: {
      OR: [
        { initiatorId: user.userId },
        { memberships: { some: { userId: user.userId } } }
      ]
    },
    include: {
      initiator: true,
      memberships: { include: { user: true } },
    }
  });

  return NextResponse.json({ projects });
}

export async function POST(req: NextRequest) {
  const user = getUserFromAuthHeader(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { name, amount, payDay, paymentLink } = await req.json();

    const project = await prisma.project.create({
      data: {
        initiatorId: user.userId,
        name,
        amount,
        payDay,
        paymentLink,
        memberships: {
          create: {
            userId: user.userId,
            role: 'INITIATOR'
          }
        }
      }
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    console.error('Create project error:', error);
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}
