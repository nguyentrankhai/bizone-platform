"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Play, X } from "lucide-react";
import { type PageMeta, type ReconPartner, type RunView, reconApi } from "./recon-api";
import { ReconciliationTable } from "./ReconciliationTable";
import { ReconciliationDetail } from "./ReconciliationDetail";

/** /reconciliation (P5.4): runs list + selected run, manual run (status queries) or statement import. */

interface Props {
  authToken: string;
  canWrite: boolean;
  partners: ReconPartner[];
  initialRuns: RunView[];
  initialMeta: PageMeta;
  initialRunId: number | null;
  yesterday: string;
}

export function ReconciliationClient(props: Props) {
  const { authToken, canWrite, partners, yesterday } = props;
  const [runs, setRuns] = useState(props.initialRuns);
  const [meta, setMeta] = useState(props.initialMeta);
  const [partnerFilter, setPartnerFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(
    props.initialRunId ?? props.initialRuns[0]?.id ?? null,
  );
  const [selected, setSelected] = useState<RunView | null>(
    props.initialRuns.find((r) => r.id === (props.initialRunId ?? props.initialRuns[0]?.id)) ??
      null,
  );
  const [showRun, setShowRun] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bumped to reload the list / the selected run (state set only in promise callbacks)
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    const q = new URLSearchParams({ page: String(page), limit: "15" });
    if (partnerFilter) q.set("partner_config_id", partnerFilter);
    reconApi
      .runs(authToken, q)
      .then((res) => {
        if (!alive) return;
        setRuns(res.data);
        if (res.meta) setMeta(res.meta);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : "Không tải được danh sách đối soát");
      });
    return () => {
      alive = false;
    };
  }, [authToken, page, partnerFilter, tick]);

  useEffect(() => {
    if (!selectedId) return;
    let alive = true;
    window.history.replaceState(null, "", `/reconciliation?run=${selectedId}`);
    reconApi
      .run(authToken, selectedId)
      .then((res) => {
        if (alive) setSelected(res.data);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : "Không tải được đợt đối soát");
      });
    return () => {
      alive = false;
    };
  }, [authToken, selectedId, tick]);

  // A status-query run executes in the worker: poll until it finishes
  useEffect(() => {
    if (selected?.status !== "Running") return;
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [selected?.status, refresh]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Đối soát giao dịch</h1>
          <p className="text-sm text-gray-500">
            Tự động 00:00 hằng ngày cho ngày hôm trước (VNPay, MoMo, ZaloPay). VietQR: nhập sao kê
            ngân hàng.
          </p>
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={() => setShowRun(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Play className="h-4 w-4" />
            Chạy đối soát
          </button>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-gray-600" htmlFor="recon-partner-filter">
          Đối tác
        </label>
        <select
          id="recon-partner-filter"
          className="h-10 rounded-lg border border-gray-300 bg-white px-2 text-sm"
          value={partnerFilter}
          onChange={(e) => {
            setPartnerFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Tất cả đối tác</option>
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.connector_type})
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-gray-500">
          {meta.total} đợt · trang {meta.page}/{Math.max(1, meta.totalPages)}
        </span>
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
          className="h-9 rounded-md border border-gray-300 bg-white px-3 text-xs disabled:opacity-40"
        >
          Trước
        </button>
        <button
          type="button"
          disabled={page >= meta.totalPages}
          onClick={() => setPage((p) => p + 1)}
          className="h-9 rounded-md border border-gray-300 bg-white px-3 text-xs disabled:opacity-40"
        >
          Sau
        </button>
      </div>

      <ReconciliationTable runs={runs} selectedId={selectedId} onSelect={setSelectedId} />

      {selected && (
        <ReconciliationDetail
          key={selected.id}
          run={selected}
          authToken={authToken}
          canWrite={canWrite}
          onChanged={refresh}
        />
      )}

      {showRun && (
        <RunDialog
          authToken={authToken}
          partners={partners}
          yesterday={yesterday}
          onClose={() => setShowRun(false)}
          onStarted={(run) => {
            setShowRun(false);
            setSelectedId(run.id);
            setSelected(run);
            setPage(1);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function RunDialog({
  authToken,
  partners,
  yesterday,
  onClose,
  onStarted,
}: {
  authToken: string;
  partners: ReconPartner[];
  yesterday: string;
  onClose: () => void;
  onStarted: (run: RunView) => void;
}) {
  const [partnerId, setPartnerId] = useState(String(partners[0]?.id ?? ""));
  const [day, setDay] = useState(yesterday);
  const partner = partners.find((p) => String(p.id) === partnerId);
  const [source, setSource] = useState<"Api" | "File">(partner?.api ? "Api" : "File");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const effective = partner?.api ? source : "File";

  async function submit() {
    if (!partner) return setError("Chọn đối tác");
    if (!day) return setError("Chọn ngày đối soát");
    if (effective === "File" && !file) return setError("Chọn file sao kê (.csv / .xlsx)");
    setBusy(true);
    setError(null);
    try {
      if (effective === "Api") {
        onStarted(
          (await reconApi.start(authToken, { partner_config_id: partner.id, run_date: day })).data,
        );
      } else {
        const form = new FormData();
        form.set("file", file!);
        form.set("partner_config_id", String(partner.id));
        form.set("run_date", day);
        onStarted((await reconApi.importFile(authToken, form)).data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không chạy được đối soát");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/40 p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recon-run-title"
    >
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 id="recon-run-title" className="text-base font-semibold text-gray-800">
            Chạy đối soát
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-5 text-sm">
          <div>
            <label htmlFor="recon-run-partner" className="mb-1 block font-medium text-gray-700">
              Đối tác
            </label>
            <select
              id="recon-run-partner"
              className="h-10 w-full rounded-lg border border-gray-300 bg-white px-2"
              value={partnerId}
              onChange={(e) => {
                setPartnerId(e.target.value);
                const p = partners.find((x) => String(x.id) === e.target.value);
                setSource(p?.api ? "Api" : "File");
              }}
            >
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.connector_type}
                  {p.status !== "Active" ? ` · ${p.status}` : ""})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="recon-run-day" className="mb-1 block font-medium text-gray-700">
              Ngày giao dịch
            </label>
            <input
              id="recon-run-day"
              type="date"
              max={yesterday}
              className="h-10 w-full rounded-lg border border-gray-300 px-3"
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          </div>
          <fieldset>
            <legend className="mb-1 font-medium text-gray-700">Dữ liệu đối tác</legend>
            <label className="flex min-h-11 items-start gap-2">
              <input
                type="radio"
                name="recon-source"
                className="mt-1"
                checked={effective === "Api"}
                disabled={!partner?.api}
                onChange={() => setSource("Api")}
              />
              <span>
                Tra cứu API từng giao dịch
                <span className="block text-xs text-gray-500">
                  {partner?.api
                    ? "Hỏi đối tác trạng thái từng GD trong ngày (chạy nền, có thể vài phút)"
                    : `${partner?.connector_type ?? "Đối tác"} không có API tra cứu`}
                </span>
              </span>
            </label>
            <label className="flex min-h-11 items-start gap-2">
              <input
                type="radio"
                name="recon-source"
                className="mt-1"
                checked={effective === "File"}
                onChange={() => setSource("File")}
              />
              <span>
                Nhập file sao kê (.csv / .xlsx)
                <span className="block text-xs text-gray-500">
                  Cột cần có: số tiền + mã GD (txn_code / order_id / nội dung CK) hoặc mã GD đối
                  tác; tuỳ chọn trạng thái, thời gian
                </span>
              </span>
            </label>
          </fieldset>
          {effective === "File" && (
            <input
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              aria-label="File sao kê"
              className="block w-full text-sm"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          )}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-lg border border-gray-300 px-4 text-sm hover:bg-gray-50"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Bắt đầu đối soát
          </button>
        </div>
      </div>
    </div>
  );
}
