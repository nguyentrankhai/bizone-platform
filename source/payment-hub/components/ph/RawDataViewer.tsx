"use client";

import { useState } from "react";

interface RawDataViewerProps {
  data: unknown;
  title?: string;
  defaultOpen?: boolean;
}

export function RawDataViewer({
  data,
  title = "Raw Data",
  defaultOpen = false,
}: RawDataViewerProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);

  const json = JSON.stringify(data, null, 2);

  async function copyToClipboard() {
    await navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-2 text-left text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex items-center gap-2">
          <svg
            className="h-4 w-4 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
            />
          </svg>
          {title}
        </span>
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="relative border-t border-gray-200">
          <button
            type="button"
            onClick={copyToClipboard}
            className="absolute top-2 right-2 rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-500 shadow-sm transition-colors hover:bg-gray-50"
          >
            {copied ? "Đã sao chép!" : "Sao chép"}
          </button>
          <pre className="overflow-x-auto p-4 pt-8 font-mono text-xs leading-relaxed whitespace-pre text-gray-700">
            {json}
          </pre>
        </div>
      )}
    </div>
  );
}
