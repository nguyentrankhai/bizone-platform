import type { NextRequest } from "next/server";
import { handleCreateWebhook, handleListWebhooks } from "@/server/routes/webhook-config";

export async function GET(req: NextRequest): Promise<Response> {
  return handleListWebhooks(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handleCreateWebhook(req);
}
