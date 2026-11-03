"use client";

import { useRef, useState } from "react";
import { Upload, X, FileSpreadsheet, Download, CheckCircle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImportError {
  row: number;
  sku?: string;
  errors: string[];
}

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  onDownloadTemplate: () => void;
  onImport: (file: File) => Promise<{ imported: number; errors: ImportError[] }>;
}

export function ImportDialog({ open, onClose, onDownloadTemplate, onImport }: ImportDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imported: number; errors: ImportError[] } | null>(null);

  function handleFile(f: File | null) {
    if (!f) return;
    if (!f.name.endsWith(".xlsx") && !f.name.endsWith(".xls")) {
      alert("Vui lòng chọn file Excel (.xlsx hoặc .xls)");
      return;
    }
    setFile(f);
    setResult(null);
  }

  async function handleImport() {
    if (!file) return;
    setLoading(true);
    try {
      const res = await onImport(file);
      setResult(res);
    } catch (e) {
      alert("Lỗi khi import: " + String(e));
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setFile(null);
    setResult(null);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Import sản phẩm từ Excel</h2>
          <button onClick={handleClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5">
          {/* Download template */}
          <div className="mb-5 flex items-center justify-between rounded-lg bg-blue-50 px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-blue-700">
              <FileSpreadsheet className="h-4 w-4 shrink-0" />
              Tải file mẫu để điền dữ liệu đúng định dạng
            </div>
            <button
              onClick={onDownloadTemplate}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Download className="h-4 w-4" />
              Tải mẫu
            </button>
          </div>

          {/* Drop zone */}
          <div
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-8 transition-colors",
              dragging ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-gray-50 hover:border-gray-300",
            )}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0] ?? null); }}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-9 w-9 text-gray-300" />
            <div className="text-center">
              <p className="font-medium text-gray-700">Kéo thả file vào đây</p>
              <p className="text-sm text-gray-400">hoặc nhấn để chọn file .xlsx</p>
            </div>
            {file && (
              <div className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 shadow-sm">
                <FileSpreadsheet className="h-5 w-5 text-emerald-500" />
                <span className="text-sm font-medium text-gray-700">{file.name}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); setFile(null); setResult(null); }}
                  className="ml-1 text-gray-400 hover:text-red-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />

          {/* Result */}
          {result && (
            <div className="mt-4 rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-2 font-medium text-gray-800">
                <CheckCircle className="h-5 w-5 text-emerald-500" />
                Đã import {result.imported} sản phẩm thành công
              </div>
              {result.errors.length > 0 && (
                <div className="mt-3">
                  <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-amber-700">
                    <AlertTriangle className="h-4 w-4" />
                    {result.errors.length} dòng có lỗi (bị bỏ qua)
                  </div>
                  <div className="max-h-40 overflow-y-auto rounded-lg bg-gray-50 p-3">
                    {result.errors.map((err, i) => (
                      <div key={i} className="mb-1.5 text-xs text-gray-600">
                        <span className="font-medium">Dòng {err.row}</span>
                        {err.sku && <span className="ml-1 text-gray-400">({err.sku})</span>}:{" "}
                        {err.errors.join("; ")}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button
            onClick={handleClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {result ? "Đóng" : "Huỷ"}
          </button>
          {!result && (
            <button
              onClick={handleImport}
              disabled={!file || loading}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {loading && <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              {loading ? "Đang import..." : "Bắt đầu import"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
