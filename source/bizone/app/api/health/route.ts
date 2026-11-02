import { connection } from "next/server";

export async function GET() {
  await connection();
  return Response.json({
    success: true,
    data: { status: "ok", service: "bizone", time: new Date().toISOString() },
  });
}
