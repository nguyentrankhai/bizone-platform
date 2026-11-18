import { connection } from "next/server";
import { handleStoreRequest } from "@/server/store/api";

/**
 * Store API for the website (P6.1) — see server/store/api.ts. Public route (proxy.ts): the
 * storefront authenticates with its store key, customers with their session token.
 */
type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: Request, { params }: Ctx) {
  await connection();
  return handleStoreRequest(req, (await params).path);
}

export async function POST(req: Request, { params }: Ctx) {
  await connection();
  return handleStoreRequest(req, (await params).path);
}
