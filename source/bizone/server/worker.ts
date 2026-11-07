/** BizOne background worker process — BullMQ consumers (inventory + commission follow-ups). */
import { getRedis } from "@/lib/redis";
import { INVENTORY_QUEUE, startInventoryWorker } from "@/server/queue/inventory";
import { COMMISSION_QUEUE, startCommissionWorker } from "@/server/queue/commission";

const inventory = startInventoryWorker();
console.log(`[worker] consuming "${INVENTORY_QUEUE}"`);
const commission = startCommissionWorker().then((w) => {
  console.log(`[worker] consuming "${COMMISSION_QUEUE}" (month-end at 00:30 VN on the 1st)`);
  return w;
});
commission.catch((err) => console.error("[worker] commission worker failed to start:", err));

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[worker] ${signal} received, finishing active jobs…`);
  // Don't hang forever on a stuck job or a Redis outage
  const force = setTimeout(() => process.exit(1), 8_000);
  force.unref();
  await Promise.all([
    inventory.close().catch(() => {}),
    commission.then((w) => w.close()).catch(() => {}),
  ]);
  getRedis().disconnect();
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
