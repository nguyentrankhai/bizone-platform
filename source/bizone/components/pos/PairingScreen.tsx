"use client";

import { useCallback, useEffect, useState } from "react";
import { Delete, MonitorSmartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { CustomerDisplay } from "./CustomerDisplay";

/**
 * Màn hình khách trên thiết bị riêng (P4.5): nhập mã PIN 6 số mà thu ngân tạo (nút "Ghép màn
 * hình" trên POS) → nhận token màn hình, lưu trên thiết bị, rồi hiển thị giỏ hàng của ca đó.
 * Token hết hạn / ca đã khoá → quay lại màn hình nhập PIN.
 */

interface Grant {
  token: string;
  tenantId: string;
  sessionId: number;
  storeName: string;
  branchName: string;
}

const KEY = "bizone:pos:display-grant";

function loadGrant(): Grant | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Grant) : null;
  } catch {
    return null;
  }
}

function saveGrant(g: Grant | null) {
  try {
    if (g) localStorage.setItem(KEY, JSON.stringify(g));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: pairing lasts for this page only */
  }
}

export function PairingScreen() {
  const [grant, setGrant] = useState<Grant | null | undefined>(undefined);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGrant(loadGrant());
  }, []);

  const unpair = useCallback((message?: string) => {
    saveGrant(null);
    setGrant(null);
    setPin("");
    setError(message ?? null);
  }, []);

  // WS keeps refusing: drop the token only if the server says it is no longer valid
  const onRejected = useCallback(async () => {
    const g = loadGrant();
    if (!g) return;
    try {
      const res = await fetch("/api/pos/pair", { headers: { authorization: `Bearer ${g.token}` } });
      const json = (await res.json()) as { data?: { valid?: boolean } };
      if (json.data?.valid === false) unpair("Phiên ghép đã hết hạn — nhập mã PIN mới");
    } catch {
      /* server unreachable: keep trying with the same token */
    }
  }, [unpair]);

  const onSessionClosed = useCallback(() => {
    setTimeout(() => unpair("Quầy đã đóng ca — nhập mã PIN của ca mới"), 10_000);
  }, [unpair]);

  async function submit(code: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pos/pair", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin: code }),
      });
      const json = (await res.json()) as {
        success: boolean;
        data?: Grant;
        error?: { message: string };
      };
      if (!json.success || !json.data) throw new Error(json.error?.message ?? "Ghép thất bại");
      saveGrant(json.data);
      setGrant(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  function press(d: string) {
    if (busy) return;
    const next = (pin + d).slice(0, 6);
    setPin(next);
    if (next.length === 6) void submit(next);
  }

  useEffect(() => {
    if (grant) return;
    function onKey(e: KeyboardEvent) {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") setPin((p) => p.slice(0, -1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (grant === undefined) return <div className="h-screen bg-slate-900" />;
  if (grant) {
    return (
      <CustomerDisplay
        auth={{ tenantId: grant.tenantId, authToken: grant.token }}
        sessionId={grant.sessionId}
        storeName={grant.storeName}
        onRejected={onRejected}
        onSessionClosed={onSessionClosed}
      />
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-slate-900 px-4 py-10 text-white">
      <MonitorSmartphone className="h-16 w-16 text-blue-400" />
      <div className="text-center">
        <h1 className="text-3xl font-bold">Ghép màn hình khách hàng</h1>
        <p className="mt-2 text-slate-300">
          Trên máy thu ngân bấm <strong>“Ghép màn hình”</strong> rồi nhập mã PIN 6 số tại đây
        </p>
      </div>
      <div className="flex gap-2 sm:gap-3" aria-label="Mã PIN" data-testid="pin-boxes">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className={cn(
              "flex h-14 w-11 items-center justify-center rounded-xl border-2 text-3xl font-bold sm:h-16 sm:w-14",
              i < pin.length ? "border-blue-400 bg-slate-800" : "border-slate-600",
            )}
          >
            {pin[i] ?? ""}
          </div>
        ))}
      </div>
      {error && (
        <p className="text-center text-red-300" role="alert">
          {error}
        </p>
      )}
      <div className="grid w-full max-w-xs grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <KeyButton key={d} onClick={() => press(d)} disabled={busy}>
            {d}
          </KeyButton>
        ))}
        <KeyButton onClick={() => setPin("")} disabled={busy}>
          C
        </KeyButton>
        <KeyButton onClick={() => press("0")} disabled={busy}>
          0
        </KeyButton>
        <KeyButton onClick={() => setPin((p) => p.slice(0, -1))} disabled={busy} label="Xoá">
          <Delete className="mx-auto h-6 w-6" />
        </KeyButton>
      </div>
      {busy && <p className="text-slate-400">Đang ghép…</p>}
    </div>
  );
}

function KeyButton({
  children,
  onClick,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="h-16 rounded-2xl bg-slate-800 text-2xl font-semibold hover:bg-slate-700 active:bg-slate-600 disabled:opacity-50"
    >
      {children}
    </button>
  );
}
