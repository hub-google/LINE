import { NextResponse } from "next/server";

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function apiError(code: string, message: string, status = 400, requestId?: string) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        requestId: requestId || `req_${Date.now().toString(36)}`,
      },
    },
    { status }
  );
}
