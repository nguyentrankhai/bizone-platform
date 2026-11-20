"use client";

import { useRef, useState } from "react";
import { CheckCircle2, FileArchive, Loader2, Upload, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConnectorApiError, connectorApi, detailLines, type InstallResult } from "./connector-api";

const MAX_BYTES = 5 * 1024 * 1024;

interface ConnectorUploadProps {
  onInstalled: (result: InstallResult) => void;
}

/**
 * Upload a connector plugin package (P7.1): a signed zip (manifest.json + ES module +
 * SIGNATURE.json). The server verifies the signature against the trusted publisher keys, validates
 * the manifest, refuses name clashes / downgrades and loads the plugin once in a sandbox before
 * storing it. A new plugin starts deactivated; an update replaces the running version in place.
 */
export function ConnectorUpload({ onInstalled }: ConnectorUploadProps) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    { ok: true; text: string } | { ok: false; text: string; lines: string[] } | null
  >(null);

  function pick(f: File | null) {
    setResult(null);
    if (f && f.size > MAX_BYTES) {
      setFile(null);
      setResult({ ok: false, text: "Gói vượt quá 5 MB", lines: [] });
      return;
    }
    setFile(f);
  }

  async function upload() {
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await connectorApi.upload(file);
      setResult({
        ok: true,
        text: r.updated
          ? `Đã nâng cấp ${r.connector.name} ${r.previousVersion ?? ""} → ${r.connector.version} (đang chạy bản mới, không cần khởi động lại)`
          : `Đã cài ${r.connector.name} ${r.connector.version}. Connector đang ở trạng thái Ngưng — kích hoạt khi sẵn sàng.`,
      });
      setFile(null);
      if (input.current) input.current.value = "";
      onInstalled(r);
    } catch (e) {
      setResult({
        ok: false,
        text: e instanceof Error ? e.message : "Tải lên thất bại",
        lines: e instanceof ConnectorApiError ? detailLines(e.details) : [],
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-gray-800">Cài đặt / nâng cấp connector</h2>
      <p className="mt-1 text-sm text-gray-500">
        Gói <code className="rounded bg-gray-100 px-1">.zip</code> đã ký bởi nhà phát hành tin cậy
        (manifest.json, module .mjs, SIGNATURE.json) — tối đa 5 MB. Cùng mã connector với phiên bản
        cao hơn = nâng cấp.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label
          className={cn(
            "flex min-h-11 flex-1 cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm",
            file ? "border-blue-300 bg-blue-50 text-blue-800" : "border-gray-300 text-gray-500",
          )}
        >
          <FileArchive className="h-4 w-4 shrink-0" />
          <span className="truncate">
            {file
              ? `${file.name} · ${(file.size / 1024).toFixed(1)} KB`
              : "Chọn tệp gói connector (.zip)"}
          </span>
          <input
            ref={input}
            type="file"
            accept=".zip,application/zip"
            className="sr-only"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
        </label>
        <button
          type="button"
          onClick={upload}
          disabled={!file || busy}
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {busy ? "Đang kiểm tra…" : "Tải lên & kiểm tra"}
        </button>
      </div>
      {result && (
        <div
          role={result.ok ? "status" : "alert"}
          className={cn(
            "mt-3 rounded-lg border px-3 py-2 text-sm",
            result.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700",
          )}
        >
          <p className="flex items-start gap-1.5 font-medium">
            {result.ok ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            {result.text}
          </p>
          {!result.ok && result.lines.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-6 text-xs">
              {result.lines.map((l) => (
                <li key={l} className="break-words">
                  {l}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
