import type { NextRequest } from "next/server";
import { handleListNotifications } from "@/server/routes/notification";

export async function GET(req: NextRequest): Promise<Response> {
  return handleListNotifications(req);
}
