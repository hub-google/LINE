import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/domain/auth";
import { cancelTicket } from "@/lib/domain/queue";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function POST(req: NextRequest, { params }: { params: { ticketId: string } }) {
  try {
    const { ticketId } = params;
    const user = await getAuthenticatedUser(req);

    const cancelled = await cancelTicket(ticketId, user?.id);
    return apiSuccess({ ticket: cancelled });
  } catch (err: any) {
    return apiError("CANCEL_FAILED", err.message || "取消號碼牌失敗", 400);
  }
}
