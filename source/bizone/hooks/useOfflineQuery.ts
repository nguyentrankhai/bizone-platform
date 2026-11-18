"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, type ApiAuth } from "@/components/inventory/shared";
import { getSelectedBranch } from "@/lib/branch-client";
import { loadSnapshot, saveSnapshot, snapshotKey } from "@/lib/pwa/snapshot";

interface State<T> {
  key: string;
  data?: T;
  savedAt: number | null;
  /** `data` is the stored snapshot: the last request failed (offline / server down) */
  stale: boolean;
  error: string;
  loading: boolean;
}

/**
 * Data of a mobile screen with an offline fallback (P6.4): shows the last stored answer at once,
 * fetches a fresh one, stores it, and keeps the stored copy (flagged `stale`) when the request
 * fails. `name` must include every input that changes the answer (period, filter…).
 * Refreshes every `refreshMs` while the page is visible, and when the connection returns.
 */
export function useOfflineQuery<T>(
  auth: ApiAuth,
  name: string,
  load: () => Promise<T>,
  refreshMs?: number,
) {
  const key = snapshotKey(auth.tenantId, getSelectedBranch(), name);
  const [state, setState] = useState<State<T>>({
    key,
    savedAt: null,
    stale: false,
    error: "",
    loading: true,
  });
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  const seq = useRef(0);

  const fetchNow = useCallback(async () => {
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true }));
    try {
      const data = await loadRef.current();
      if (id !== seq.current) return;
      const savedAt = saveSnapshot(key, data);
      setState({ key, data, savedAt, stale: false, error: "", loading: false });
    } catch (e) {
      if (id !== seq.current) return;
      setState((s) => ({
        ...s,
        stale: s.data !== undefined,
        error: errorMessage(e),
        loading: false,
      }));
    }
  }, [key]);

  useEffect(() => {
    // show the stored copy at once, then fetch a fresh answer
    const snap = loadSnapshot<T>(key);
    setState({
      key,
      data: snap?.data,
      savedAt: snap?.savedAt ?? null,
      stale: false, // only once the fresh request has failed
      error: "",
      loading: true,
    });
    void fetchNow();
  }, [key, fetchNow]);

  useEffect(() => {
    const onOnline = () => void fetchNow();
    window.addEventListener("online", onOnline);
    const timer = refreshMs
      ? setInterval(() => {
          if (document.visibilityState === "visible" && navigator.onLine) void fetchNow();
        }, refreshMs)
      : undefined;
    return () => {
      window.removeEventListener("online", onOnline);
      if (timer) clearInterval(timer);
    };
  }, [fetchNow, refreshMs]);

  const current = state.key === key ? state : null;
  return {
    data: current?.data,
    savedAt: current?.savedAt ?? null,
    stale: current?.stale ?? false,
    error: current?.error ?? "",
    loading: current?.loading ?? true,
    refresh: fetchNow,
  };
}
