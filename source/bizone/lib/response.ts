import { NextResponse } from "next/server";

export interface Meta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
}

export function ok<T>(data: T, meta?: Meta) {
  return { success: true as const, data, ...(meta ? { meta } : {}) };
}

export function okResponse<T>(data: T, meta?: Meta, status = 200): NextResponse {
  return NextResponse.json(ok(data, meta), { status });
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): NextResponse {
  return NextResponse.json(
    { success: false, error: { code, message, ...(details ? { details } : {}) } },
    { status },
  );
}
