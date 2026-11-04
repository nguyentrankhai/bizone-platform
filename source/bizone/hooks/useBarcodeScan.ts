"use client";

import { useEffect, useRef } from "react";

/**
 * Detect a USB/Bluetooth barcode scanner anywhere on the page. Scanners "type"
 * the code much faster than a person (a few ms per key) and finish with Enter.
 * Keys typed into an input/textarea are left alone — that field handles them.
 */
export function useBarcodeScan(
  onScan: (code: string) => void,
  { minLength = 4, maxGapMs = 50, enabled = true } = {},
) {
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  });

  useEffect(() => {
    if (!enabled) return;
    let buffer = "";
    let last = 0;

    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }
      const now = performance.now();
      if (now - last > maxGapMs) buffer = "";
      last = now;

      if (e.key === "Enter") {
        if (buffer.length >= minLength) {
          e.preventDefault();
          onScanRef.current(buffer);
        }
        buffer = "";
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        buffer += e.key;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, minLength, maxGapMs]);
}
