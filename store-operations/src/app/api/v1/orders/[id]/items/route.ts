import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/domain/auth";
import { addItemsToOrder } from "@/lib/domain/order";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const user = await getAuthenticatedUser(req);
    const body = await req.json();
    const { items } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return apiError("INVALID_INPUT", "未傳入有效追加品項", 400);
    }

    const updated = await addItemsToOrder({
      orderId: id,
      items,
      addedByUserId: user?.id,
      source: "ONLINE",
    });

    return apiSuccess({ order: updated });
  } catch (err: any) {
    return apiError("ADD_ITEM_FAILED", err.message || "追加品項失敗", 400);
  }
}
