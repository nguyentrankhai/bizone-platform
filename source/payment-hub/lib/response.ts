import { NextResponse } from "next/server";

export interface Meta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
}

export function okResponse<T>(data: T, meta?: Meta, status = 200): NextResponse {
  return NextResponse.json({ success: true, data, ...(meta ? { meta } : {}) }, { status });
}

export function createdResponse<T>(data: T): NextResponse {
  return okResponse(data, undefined, 201);
}
