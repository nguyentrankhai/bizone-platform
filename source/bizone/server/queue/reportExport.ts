import { Queue, type ConnectionOptions } from "bullmq";
import { bizoneError } from "@/lib/errors";
import { getRedis } from "@/lib/redis";
import { currentTenantId } from "@/lib/tenant";
import type { ExportReportInput } from "@/lib/validators/report";

/**
 * Report exports run in the worker (PDF/Excel rendering is CPU work that must not block the
 * web process). The finished file is kept in Redis for FILE_TTL seconds and fetched once by
 * the requester through `reports.exportStatus`. The job carries tenant + requester so another
 * user (or tenant) cannot read it.
 */
export const REPORT_EXPORT_QUEUE = "bizone-report-export";
export const FILE_TTL = 30 * 60;

export interface ReportExportJob {
  tenantId: string;
  requestedBy: string;
  input: ExportReportInput;
}

export function connection(): ConnectionOptions {
  return {
    url: process.env.REDIS_URL ?? "redis://:123456@localhost:6379",
    maxRetriesPerRequest: null,
  };
}

const globalForQueue = globalThis as unknown as { bizoneReportQueue?: Queue<ReportExportJob> };

export function getReportExportQueue(): Queue<ReportExportJob> {
  if (!globalForQueue.bizoneReportQueue) {
    const queue = new Queue<ReportExportJob>(REPORT_EXPORT_QUEUE, {
      connection: connection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "fixed", delay: 1_000 },
        removeOnComplete: { age: FILE_TTL },
        removeOnFail: { age: FILE_TTL },
      },
    });
    queue.on("error", (err) => console.error(`[queue:report] ${err.message}`));
    globalForQueue.bizoneReportQueue = queue;
  }
  return globalForQueue.bizoneReportQueue;
}

export const fileKey = (tenantId: string, jobId: string) => `report:file:${tenantId}:${jobId}`;

export async function enqueueReportExport(input: ExportReportInput, requestedBy: string) {
  try {
    const job = await getReportExportQueue().add(input.type, {
      tenantId: currentTenantId(),
      requestedBy,
      input,
    });
    return { jobId: job.id! };
  } catch (err) {
    throw bizoneError(
      "SERVICE_UNAVAILABLE",
      `Không đưa được yêu cầu xuất vào hàng đợi (${err instanceof Error ? err.message : String(err)})`,
    );
  }
}

export type ExportStatus =
  | { state: "waiting" | "active"; waitingMs: number }
  | { state: "failed"; error: string }
  | { state: "completed"; fileName: string; mimeType: string; base64: string; ms: number };

export async function exportStatus(jobId: string, requestedBy: string): Promise<ExportStatus> {
  const job = await getReportExportQueue().getJob(jobId);
  // Same answer for "not found" and "not yours": no probing of other tenants' jobs
  if (!job || job.data.tenantId !== currentTenantId() || job.data.requestedBy !== requestedBy) {
    throw bizoneError("NOT_FOUND", "Không tìm thấy yêu cầu xuất (hoặc đã hết hạn 30 phút)");
  }
  const state = await job.getState();
  if (state === "failed")
    return { state: "failed", error: job.failedReason || "Xuất báo cáo thất bại" };
  if (state !== "completed") {
    return {
      state: state === "active" ? "active" : "waiting",
      waitingMs: Date.now() - job.timestamp,
    };
  }
  const result = job.returnvalue as { fileName: string; format: "xlsx" | "pdf" };
  const base64 = await getRedis().get(fileKey(job.data.tenantId, jobId));
  if (!base64) throw bizoneError("NOT_FOUND", "File đã hết hạn — hãy xuất lại");
  return {
    state: "completed",
    fileName: result.fileName,
    mimeType:
      result.format === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    base64,
    ms: (job.finishedOn ?? Date.now()) - job.timestamp,
  };
}
