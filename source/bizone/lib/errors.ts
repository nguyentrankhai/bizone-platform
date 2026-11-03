import { TRPCError } from "@trpc/server";

export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

// Map BizOne error codes → tRPC error codes
const TRPC_CODE_MAP: Record<ErrorCode, TRPCError["code"]> = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_ERROR: "BAD_REQUEST",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "TOO_MANY_REQUESTS",
  SERVICE_UNAVAILABLE: "INTERNAL_SERVER_ERROR",
  INTERNAL_ERROR: "INTERNAL_SERVER_ERROR",
};

export function bizoneError(
  code: ErrorCode,
  message: string,
  details?: unknown,
): TRPCError {
  return new TRPCError({
    code: TRPC_CODE_MAP[code],
    message: JSON.stringify({ code, message, details }),
  });
}

export function notFound(entity: string, id?: string | number): TRPCError {
  return bizoneError(
    "NOT_FOUND",
    id ? `${entity} with id "${id}" not found` : `${entity} not found`,
  );
}

export function conflict(message: string): TRPCError {
  return bizoneError("CONFLICT", message);
}

export function forbidden(message = "Forbidden"): TRPCError {
  return bizoneError("FORBIDDEN", message);
}

export function rateLimited(): TRPCError {
  return bizoneError("RATE_LIMITED", "Too many requests, please slow down");
}
