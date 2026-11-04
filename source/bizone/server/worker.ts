/** BizOne background worker process — BullMQ consumers (inventory follow-ups after sales). */
import { getRedis } from "@/lib/redis";
import { INVENTORY_QUEUE, startInventoryWorker } from "@/server/queue/inventory";

const inventory = startInventoryWorker();
console.log(`[worker] consuming "${INVENTORY_QUEUE}"`);

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[worker] ${signal} received, finishing active jobs…`);
  // Don't hang forever on a stuck job or a Redis outage
  const force = setTimeout(() => process.exit(1), 8_000);
  force.unref();
  await inventory.close().catch(() => {});
  getRedis().disconnect();
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
