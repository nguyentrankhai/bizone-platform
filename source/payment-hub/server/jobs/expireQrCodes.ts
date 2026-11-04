import { expireQrCodes } from "@/server/services/qr.service";

/** Run once: mark expired QR codes and drop their stored image. Scheduled by the worker. */
export async function runExpireQrJob(): Promise<void> {
  const count = await expireQrCodes();
  if (count > 0) {
    console.log(`[qr-expire-job] Expired ${count} QR code(s)`);
  }
}
