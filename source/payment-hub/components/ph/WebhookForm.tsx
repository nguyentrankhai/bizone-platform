"use client";

import { useState } from "react";
import { Check, Copy, KeyRound, Loader2, X } from "lucide-react";
import {
  DEFAULT_RETRY_COUNT,
  DEFAULT_RETRY_INTERVALS,
  WEBHOOK_EVENTS,
  describeIntervals,
  type WebhookConfigView,
} from "@/lib/webhook-events";
import { cn } from "@/lib/utils";
import { WebhookApiError, webhookApi } from "./webhook-api";

export interface MerchantOption {
  id: number;
  code: string;
  name: string;
}

interface WebhookFormProps {
  authToken: string;
  merchants: MerchantOption[];
  /** null → create */
  config: WebhookConfigView | null;
  onSaved: (config: WebhookConfigView) => void;
  onClose: () => void;
}

const inputCls =
  "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none aria-invalid:border-red-400";

/** Shows a freshly generated secret once, with copy. */
export function SecretReveal({ secret, onDone }: { secret: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">Lưu secret này ngay — Payment Hub sẽ không hiển thị lại.</p>
        <p className="mt-1">
          Endpoint dùng nó để kiểm chữ ký: <code>X-Signature</code> = HMAC-SHA256(secret,{" "}
          <code>X-Timestamp + &quot;.&quot; + body</code>). Với BizOne, đặt vào{" "}
          <code>PAYHUB_WEBHOOK_SECRET</code>.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-sm break-all text-gray-800">
          {secret}
        </code>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(secret);
            setCopied(true);
          }}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm hover:bg-gray-50"
        >
          {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
          {copied ? "Đã chép" : "Chép"}
        </button>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onDone}
          className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Tôi đã lưu secret
        </button>
      </div>
    </div>
  );
}

export function WebhookForm({ authToken, merchants, config, onSaved, onClose }: WebhookFormProps) {
  const isNew = config === null;
  const [merchantId, setMerchantId] = useState(
    String(config?.merchantId ?? merchants[0]?.id ?? ""),
  );
  const [url, setUrl] = useState(config?.url ?? "");
  const [events, setEvents] = useState<string[]>(
    config?.events ?? ["payment.success", "payment.failed", "payment.expired"],
  );
  const [retryCount, setRetryCount] = useState(String(config?.retryCount ?? DEFAULT_RETRY_COUNT));
  const [intervals, setIntervals] = useState(
    (config?.retryIntervals ?? DEFAULT_RETRY_INTERVALS).join(", "),
  );
  const [timeoutMs, setTimeoutMs] = useState(String(config?.timeoutMs ?? 30000));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [savedConfig, setSavedConfig] = useState<WebhookConfigView | null>(null);

  const parsedIntervals = intervals
    .split(/[,\s]+/)
    .filter(Boolean)
    .map(Number);

  function toggleEvent(code: string) {
    setEvents((list) => (list.includes(code) ? list.filter((e) => e !== code) : [...list, code]));
    setErrors((e) => ({ ...e, events: "" }));
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!/^https?:\/\/\S+$/i.test(url.trim()))
      e.url = "Nhập URL bắt đầu bằng http:// hoặc https://";
    if (events.length === 0) e.events = "Chọn ít nhất 1 sự kiện";
    const rc = Number(retryCount);
    if (!Number.isInteger(rc) || rc < 0 || rc > 10) e.retry_count = "0 – 10";
    if (
      parsedIntervals.length === 0 ||
      parsedIntervals.some((n) => !Number.isInteger(n) || n < 1 || n > 86400)
    )
      e.retry_intervals = "Danh sách số giây (1 – 86 400), cách nhau bởi dấu phẩy";
    const t = Number(timeoutMs);
    if (!Number.isInteger(t) || t < 1000 || t > 60000) e.timeout_ms = "1 000 – 60 000 ms";
    if (isNew && !merchantId) e.merchant_id = "Chọn merchant";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setMessage(null);
    if (!validate()) return;
    setSaving(true);
    const body = {
      ...(isNew ? { merchant_id: Number(merchantId) } : {}),
      url: url.trim(),
      events,
      retry_count: Number(retryCount),
      retry_intervals: parsedIntervals,
      timeout_ms: Number(timeoutMs),
    };
    try {
      if (isNew) {
        const created = await webhookApi.create(authToken, body);
        const { secret: s, ...view } = created;
        setSavedConfig(view);
        setSecret(s);
      } else {
        onSaved(await webhookApi.update(authToken, config.id, body));
      }
    } catch (e) {
      if (e instanceof WebhookApiError && e.details) {
        setErrors(Object.fromEntries(Object.entries(e.details).map(([k, v]) => [k, v[0] ?? ""])));
      }
      setMessage(e instanceof Error ? e.message : "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  async function rotate() {
    if (!config) return;
    if (
      !window.confirm(
        "Tạo secret mới? Secret cũ hết hiệu lực ngay — endpoint phải cập nhật secret mới.",
      )
    )
      return;
    setSaving(true);
    try {
      const rotated = await webhookApi.rotate(authToken, config.id);
      const { secret: s, ...view } = rotated;
      setSavedConfig(view);
      setSecret(s);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Không đổi được secret");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/40 p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="webhook-form-title"
    >
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 id="webhook-form-title" className="text-lg font-semibold text-gray-800">
            {secret ? "Secret của endpoint" : isNew ? "Thêm webhook endpoint" : "Cấu hình webhook"}
          </h2>
          <button
            type="button"
            onClick={() => (secret && savedConfig ? onSaved(savedConfig) : onClose())}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5">
          {secret && savedConfig ? (
            <SecretReveal secret={secret} onDone={() => onSaved(savedConfig)} />
          ) : (
            <form onSubmit={submit} className="space-y-5" noValidate>
              {message && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700"
                >
                  {message}
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <label htmlFor="wh-merchant" className="block text-sm font-medium text-gray-700">
                    Merchant
                  </label>
                  <select
                    id="wh-merchant"
                    className={inputCls}
                    value={merchantId}
                    disabled={!isNew}
                    onChange={(e) => setMerchantId(e.target.value)}
                  >
                    {merchants.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.code}
                      </option>
                    ))}
                  </select>
                  {errors.merchant_id && (
                    <p className="text-xs text-red-600">{errors.merchant_id}</p>
                  )}
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label htmlFor="wh-url" className="block text-sm font-medium text-gray-700">
                    URL endpoint <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="wh-url"
                    type="url"
                    className={inputCls}
                    value={url}
                    aria-invalid={!!errors.url}
                    placeholder="https://bizone.vn/api/webhooks/payhub"
                    onChange={(e) => {
                      setUrl(e.target.value);
                      setErrors((x) => ({ ...x, url: "" }));
                    }}
                  />
                  {errors.url && <p className="text-xs text-red-600">{errors.url}</p>}
                </div>
              </div>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-gray-700">
                  Sự kiện <span className="text-red-500">*</span>
                </legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {WEBHOOK_EVENTS.map((e) => (
                    <label
                      key={e.code}
                      className={cn(
                        "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 text-sm",
                        events.includes(e.code) ? "border-blue-300 bg-blue-50" : "border-gray-200",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-blue-600"
                        checked={events.includes(e.code)}
                        onChange={() => toggleEvent(e.code)}
                      />
                      <span>
                        <code className="text-gray-800">{e.code}</code>
                        <span className="text-gray-500"> — {e.label}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {errors.events && <p className="text-xs text-red-600">{errors.events}</p>}
              </fieldset>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <label htmlFor="wh-retry" className="block text-sm font-medium text-gray-700">
                    Số lần retry
                  </label>
                  <input
                    id="wh-retry"
                    type="number"
                    className={inputCls}
                    value={retryCount}
                    onChange={(e) => setRetryCount(e.target.value)}
                  />
                  {errors.retry_count && (
                    <p className="text-xs text-red-600">{errors.retry_count}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="wh-timeout" className="block text-sm font-medium text-gray-700">
                    Timeout (ms)
                  </label>
                  <input
                    id="wh-timeout"
                    type="number"
                    className={inputCls}
                    value={timeoutMs}
                    onChange={(e) => setTimeoutMs(e.target.value)}
                  />
                  {errors.timeout_ms && <p className="text-xs text-red-600">{errors.timeout_ms}</p>}
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="wh-intervals" className="block text-sm font-medium text-gray-700">
                    Khoảng retry (giây)
                  </label>
                  <input
                    id="wh-intervals"
                    className={inputCls}
                    value={intervals}
                    onChange={(e) => setIntervals(e.target.value)}
                  />
                  {errors.retry_intervals ? (
                    <p className="text-xs text-red-600">{errors.retry_intervals}</p>
                  ) : (
                    <p className="text-xs text-gray-500">
                      {parsedIntervals.every((n) => n > 0)
                        ? describeIntervals(parsedIntervals)
                        : ""}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
                {!isNew ? (
                  <button
                    type="button"
                    onClick={rotate}
                    disabled={saving}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    <KeyRound className="h-4 w-4" /> Đổi secret ({config.secretHint})
                  </button>
                ) : (
                  <span className="text-xs text-gray-500">Secret được sinh tự động khi lưu.</span>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="h-9 rounded-lg border border-gray-300 px-4 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    Lưu
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
