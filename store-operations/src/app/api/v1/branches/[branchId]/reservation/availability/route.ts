import { NextRequest } from "next/server";
import { getReservationAvailability } from "@/lib/domain/reservation";
import { apiSuccess, apiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { branchId: string } }) {
  try {
    const { branchId } = params;
    const url = new URL(req.url);
    const dateStr = url.searchParams.get("date") || new Date().toISOString().split("T")[0];

    const slots = await getReservationAvailability(branchId, dateStr);
    return apiSuccess({ date: dateStr, slots });
  } catch (err: any) {
    return apiError("SERVER_ERROR", err.message, 500);
  }
}
