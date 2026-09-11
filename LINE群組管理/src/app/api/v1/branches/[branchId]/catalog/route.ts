import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function GET(req: NextRequest, { params }: { params: { branchId: string } }) {
  try {
    const { branchId } = params;
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      return apiError("NOT_FOUND", "找不到該門市", 404);
    }

    const items = await prisma.catalogItem.findMany({
      where: {
        merchantId: branch.merchantId,
        active: true,
        isDeleted: false,
      },
      orderBy: [{ sortOrder: "asc" }, { price: "asc" }],
    });

    return apiSuccess({ items });
  } catch (err: any) {
    return apiError("SERVER_ERROR", err.message, 500);
  }
}
