import { connection } from "next/server";
import { getPrisma } from "@/lib/prisma";

async function checkDatabase(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      getPrisma().$queryRaw`SELECT 1`,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), 3000);
      }),
    ]);
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  await connection();
  const database = await checkDatabase();

  if (database.ok) {
    return Response.json({
      success: true,
      data: { status: "ok", service: "bizone", checks: { database } },
    });
  }
  return Response.json(
    {
      success: false,
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "Dependency check failed",
        details: { database },
      },
    },
    { status: 503 },
  );
}
