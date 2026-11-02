import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { getRedis } from "@/lib/redis";

type Check = { ok: boolean; latencyMs: number; error?: string };

async function check(probe: () => Promise<unknown>): Promise<Check> {
  const start = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      probe(),
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
  const [database, redis] = await Promise.all([
    check(() => getDb().query("SELECT 1")),
    check(() => getRedis().ping()),
  ]);
  const checks = { database, redis };

  if (database.ok && redis.ok) {
    return Response.json({ success: true, data: { status: "ok", service: "payment-hub", checks } });
  }
  return Response.json(
    {
      success: false,
      error: { code: "SERVICE_UNAVAILABLE", message: "Dependency check failed", details: checks },
    },
    { status: 503 },
  );
}
