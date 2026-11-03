"use client";

import { useEffect, useRef } from "react";

export interface LowStockAlert {
  warehouseId: number;
  alerts: Array<{
    quantity: string;
    product: { id: number; name: string; sku: string; minStock: number };
  }>;
}

/**
 * Subscribe to /api/inventory/alerts (SSE over fetch so the Bearer header can be sent).
 * Reconnects after 5s when the stream drops.
 */
export function useLowStockAlerts(
  auth: { tenantId: string; authToken: string },
  onAlert: (alert: LowStockAlert) => void,
) {
  const onAlertRef = useRef(onAlert);
  useEffect(() => {
    onAlertRef.current = onAlert;
  });

  useEffect(() => {
    if (!auth.authToken) return;
    const controller = new AbortController();
    let retry: ReturnType<typeof setTimeout> | undefined;

    async function connect() {
      try {
        const res = await fetch("/api/inventory/alerts", {
          headers: { Authorization: `Bearer ${auth.authToken}`, "X-Tenant-ID": auth.tenantId },
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const evt of events) {
            const data = evt
              .split("\n")
              .filter((l) => l.startsWith("data: "))
              .map((l) => l.slice(6))
              .join("\n");
            if (data) onAlertRef.current(JSON.parse(data) as LowStockAlert);
          }
        }
      } catch {
        // fall through to reconnect
      }
      if (!controller.signal.aborted) retry = setTimeout(connect, 5000);
    }

    connect();
    return () => {
      controller.abort();
      clearTimeout(retry);
    };
  }, [auth.authToken, auth.tenantId]);
}
