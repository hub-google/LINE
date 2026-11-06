import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/domain/auth";
import { insertNextTicket } from "@/lib/domain/queue";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function POST(req: NextRequest, { params }: { params: { ticketId: string } }) {
  try {
    const { ticketId } = params;
    const user = await getAuthenticatedUser(req);
    if (!user) return apiError("UNAUTHORIZED", "未登入", 401);

    const ticket = await insertNextTicket(ticketId, user.id);
    return apiSuccess({ ticket });
  } catch (err: any) {
    return apiError("INSERT_NEXT_ERROR", err.message, 400);
  }
}
