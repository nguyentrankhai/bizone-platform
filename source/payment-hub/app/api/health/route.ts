import { connection } from "next/server";
import { handleReadiness } from "@/server/routes/health";

/** Docker healthcheck / readiness (P1.2; P7.5: same report as /api/v1/health). */
export async function GET(): Promise<Response> {
  await connection();
  return handleReadiness();
}
