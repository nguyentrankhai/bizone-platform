import { Worker, type Job } from "bullmq";
import { getRedis } from "@/lib/redis";
import { runWithTenant } from "@/lib/tenant";
import { renderReport } from "@/server/services/reportExport.service";
import {
  FILE_TTL,
  REPORT_EXPORT_QUEUE,
  connection,
  fileKey,
  type ReportExportJob,
} from "./reportExport";

/** Worker side of report exports (only imported by server/worker.ts — keeps exceljs/pdfmake out of Next) */
export async function processReportExport(job: Job<ReportExportJob>) {
  const { tenantId, input } = job.data;
  const { fileName, buffer } = await runWithTenant(tenantId, () => renderReport(input));
  await getRedis().set(fileKey(tenantId, job.id!), buffer.toString("base64"), "EX", FILE_TTL);
  return { fileName, format: input.format, bytes: buffer.length };
}

export function startReportExportWorker(): Worker<ReportExportJob> {
  const worker = new Worker<ReportExportJob>(REPORT_EXPORT_QUEUE, processReportExport, {
    connection: connection(),
    concurrency: 2,
  });
  worker.on("failed", (job, err) =>
    console.error(`[worker:report] job ${job?.id} failed: ${err.message}`),
  );
  worker.on("error", (err) => console.error(`[worker:report] ${err.message}`));
  return worker;
}
