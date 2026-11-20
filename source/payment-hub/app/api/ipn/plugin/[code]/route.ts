import { connection, type NextRequest } from "next/server";
import { handlePluginIpn } from "@/server/routes/plugin-ipn";

/** IPN / callback of a connector plugin (P7.1) — public, verified by the plugin's signature. */
interface Ctx {
  params: Promise<{ code: string }>;
}

export async function GET(req: NextRequest, { params }: Ctx): Promise<Response> {
  await connection();
  return handlePluginIpn(req, (await params).code);
}

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  await connection();
  return handlePluginIpn(req, (await params).code);
}
