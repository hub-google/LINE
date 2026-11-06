import { prisma } from "@/lib/prisma";

export async function recordAuditLog(params: {
  merchantId: string;
  branchId?: string;
  actorUserId: string;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId: string;
  beforeState?: any;
  afterState?: any;
  ipAddress?: string;
  userAgent?: string;
}) {
  const {
    merchantId,
    branchId,
    actorUserId,
    actorRole,
    action,
    resourceType,
    resourceId,
    beforeState,
    afterState,
    ipAddress,
    userAgent,
  } = params;

  return await prisma.auditLog.create({
    data: {
      merchantId,
      branchId,
      actorUserId,
      actorRole,
      action,
      resourceType,
      resourceId,
      beforeState: beforeState ? JSON.stringify(beforeState) : null,
      afterState: afterState ? JSON.stringify(afterState) : null,
      ipAddress,
      userAgent,
    },
  });
}
