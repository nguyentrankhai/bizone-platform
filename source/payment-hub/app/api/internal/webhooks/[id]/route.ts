import type { NextRequest } from "next/server";
import {
  handleDeleteWebhook,
  handleGetWebhook,
  handleUpdateWebhook,
} from "@/server/routes/webhook-config";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx): Promise<Response> {
  return handleGetWebhook(req, (await params).id);
}

export async function PUT(req: NextRequest, { params }: Ctx): Promise<Response> {
  return handleUpdateWebhook(req, (await params).id);
}

export async function DELETE(req: NextRequest, { params }: Ctx): Promise<Response> {
  return handleDeleteWebhook(req, (await params).id);
}
