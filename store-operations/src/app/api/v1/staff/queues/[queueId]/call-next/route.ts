import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/domain/auth";
import { callNextTicket } from "@/lib/domain/queue";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function POST(req: NextRequest, { params }: { params: { queueId: string } }) {
  try {
    const { queueId } = params;
    const user = await getAuthenticatedUser(req);

    if (!user) {
      return apiError("UNAUTHORIZED", "未登入", 401);
    }

    const ticket = await callNextTicket(queueId, user.id);
    return apiSuccess({ ticket });
  } catch (err: any) {
    return apiError("CALL_NEXT_ERROR", err.message || "叫號操作失敗", 400);
  }
}
