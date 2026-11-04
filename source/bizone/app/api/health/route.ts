import { connection } from "next/server";
import { getPrismaForTenant } from "@/lib/prisma";
import { tenantRegistry } from "@/lib/tenant";

type DbCheck = { ok: boolean; latencyMs: number; error?: string };

/** Ping every provisioned tenant database (one DB per tenant). */
async function checkDatabases(): Promise<{ ok: boolean; tenants: Record<string, DbCheck> }> {
  const ids = [...tenantRegistry().keys()];
  if (ids.length === 0) {
    return {
      ok: false,
      tenants: { _registry: { ok: false, latencyMs: 0, error: "TENANT_DATABASES is empty" } },
    };
  }
  const results = await Promise.all(ids.map(async (id) => [id, await checkDatabase(id)] as const));
  return { ok: results.every(([, r]) => r.ok), tenants: Object.fromEntries(results) };
}

async function checkDatabase(tenantId: string): Promise<DbCheck> {
  const start = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      getPrismaForTenant(tenantId).$queryRaw`SELECT 1`,
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
  const database = await checkDatabases();

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
