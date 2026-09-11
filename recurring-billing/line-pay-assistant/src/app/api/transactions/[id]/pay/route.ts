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

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = getUserFromAuthHeader(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const transactionId = params.id;

  try {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { project: true }
    });

    if (!transaction) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    if (transaction.payerId !== user.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    if (transaction.status !== 'UNPAID' && transaction.status !== 'OVERDUE') {
      return NextResponse.json({ error: 'Invalid transaction status' }, { status: 400 });
    }

    const updatedTransaction = await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        status: 'PENDING',
        paidAt: new Date()
      }
    });

    // TODO: Trigger push notification to initiator using lineClient

    return NextResponse.json({ success: true, transaction: updatedTransaction });
  } catch (error) {
    console.error('Pay transaction error:', error);
    return NextResponse.json({ error: 'Failed to update transaction' }, { status: 500 });
  }
}
