import type { NextRequest } from "next/server";
import { handlePayEntry } from "@/server/routes/pay-page";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ txnCode: string }> },
): Promise<Response> {
  const { txnCode } = await ctx.params;
  return handlePayEntry(req, txnCode);
}
