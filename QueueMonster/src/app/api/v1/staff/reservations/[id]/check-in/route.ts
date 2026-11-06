import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/domain/auth";
import { checkInReservation } from "@/lib/domain/reservation";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const user = await getAuthenticatedUser(req);
    if (!user) return apiError("UNAUTHORIZED", "未登入", 401);

    const result = await checkInReservation(id, user.id);
    return apiSuccess(result);
  } catch (err: any) {
    return apiError("CHECK_IN_ERROR", err.message, 400);
  }
}
