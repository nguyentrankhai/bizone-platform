import type { NextRequest } from "next/server";
import { handleListConnectors, handleUploadConnector } from "@/server/routes/connectors";

export async function GET(req: NextRequest): Promise<Response> {
  return handleListConnectors(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handleUploadConnector(req);
}
