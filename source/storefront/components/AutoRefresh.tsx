"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-render the page every `seconds` (order waiting for its online payment) */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
