import type { NextRequest } from "next/server";
import { handleMarkRead } from "@/server/routes/notification";

/** Personal read state — not an administrative change, so not audited. */
export async function POST(req: NextRequest): Promise<Response> {
  return handleMarkRead(req);
}
