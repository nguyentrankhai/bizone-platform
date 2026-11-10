"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowLeft, Loader2, Power, PowerOff, Save } from "lucide-react";
import {
  PARTNER_TYPES,
  PARTNER_TYPE_CODES,
  type PartnerLogView,
  type PartnerView,
} from "@/lib/partner-types";
import { cn } from "@/lib/utils";
import { EnvBadge, PartnerStatusBadge } from "./PartnerStatusBadge";
import { PartnerLogTable } from "./PartnerLogTable";
import { TestConnectionButton } from "./TestConnectionButton";
import { ApiCallError, partnerApi, type PartnerPayload } from "./partner-api";

interface LogsPage {
  items: PartnerLogView[];
  total: number;
  page: number;
  totalPages: number;
}

interface PartnerFormProps {
  partner: PartnerView | null;
  initialLogs: LogsPage | null;
  authToken: string;
  canWrite: boolean;
  /** Public base URL of Payment Hub (APP_URL) — default callback/IPN URLs */
  appUrl: string;
}

interface FormState {
  connectorType: string;
  name: string;
  merchantCode: string;
  environment: string;
  apiKey: string;
  secretKey: string;
  endpointSandbox: string;
  endpointProduction: string;
  callbackUrl: string;
  webhookUrl: string;
  timeout: string;
  maxRetries: string;
  backoffMs: string;
}

function fromPartner(p: PartnerView | null, appUrl: string): FormState {
  const spec = p ? PARTNER_TYPES[p.connectorType] : undefined;
  return {
    connectorType: p?.connectorType ?? "VNPay",
    name: p?.name ?? "",
    merchantCode: p?.merchantCode ?? "",
    environment: p?.environment ?? "Sandbox",
    // Secret values are never sent to the browser: blank = keep. Non-secret ones are prefilled.
    apiKey: p && spec && !spec.apiKey.secret ? p.apiKey : "",
    secretKey: p && spec && !spec.secretKey.secret ? p.secretKey : "",
    endpointSandbox: p?.endpointSandbox ?? PARTNER_TYPES.VNPay.defaultEndpointSandbox ?? "",
    endpointProduction:
      p?.endpointProduction ?? PARTNER_TYPES.VNPay.defaultEndpointProduction ?? "",
    callbackUrl: p ? (p.callbackUrl ?? "") : `${appUrl}/pay/vnpay/return`,
    webhookUrl: p ? (p.webhookUrl ?? "") : `${appUrl}/api/ipn/vnpay`,
    timeout: String(p?.timeout ?? 30000),
    maxRetries: String(p?.retryPolicy?.max_retries ?? 3),
    backoffMs: String(p?.retryPolicy?.backoff_ms ?? 1000),
  };
}

const inputCls =
  "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none disabled:bg-gray-50 disabled:text-gray-500 aria-invalid:border-red-400";

function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="text-xs text-gray-500">{hint}</p>
      ) : null}
    </div>
  );
}

const FIELD_KEYS: Record<string, keyof FormState> = {
  connector_type: "connectorType",
  name: "name",
  merchant_code: "merchantCode",
  environment: "environment",
  api_key: "apiKey",
  secret_key: "secretKey",
  endpoint_sandbox: "endpointSandbox",
  endpoint_production: "endpointProduction",
  callback_url: "callbackUrl",
  webhook_url: "webhookUrl",
  timeout: "timeout",
  retry_policy: "maxRetries",
};

export function PartnerForm({
  partner: initialPartner,
  initialLogs,
  authToken,
  canWrite,
  appUrl,
}: PartnerFormProps) {
  const router = useRouter();
  const isNew = initialPartner === null;
  const [partner, setPartner] = useState(initialPartner);
  const [saved, setSaved] = useState(() => fromPartner(initialPartner, appUrl));
  const [form, setForm] = useState(saved);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [logs, setLogs] = useState(initialLogs);
  const [logsLoading, setLogsLoading] = useState(false);

  const spec = PARTNER_TYPES[form.connectorType]!;
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(saved), [form, saved]);
  const readOnly = !canWrite;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function changeType(type: string) {
    const next = PARTNER_TYPES[type]!;
    const origin = appUrl;
    const code = type.toLowerCase();
    setForm((f) => ({
      ...f,
      connectorType: type,
      name: f.name || `${next.label} - ${f.environment}`,
      endpointSandbox: next.defaultEndpointSandbox ?? "",
      endpointProduction: next.defaultEndpointProduction ?? "",
      // PSPs with a connector get their return / IPN handlers (/pay/{code}/return, /api/ipn/{code})
      callbackUrl: next.implemented && next.usesEndpoints ? `${origin}/pay/${code}/return` : "",
      webhookUrl: next.implemented && next.usesEndpoints ? `${origin}/api/ipn/${code}` : "",
    }));
    setErrors({});
  }

  function validate(): boolean {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) e.name = "Bắt buộc";
    const checks = [
      ["merchantCode", spec.merchantCode, true],
      ["apiKey", spec.apiKey, isNew],
      ["secretKey", spec.secretKey, isNew],
    ] as const;
    for (const [key, field, required] of checks) {
      const v = form[key].trim();
      if (!v && required) e[key] = "Bắt buộc";
      else if (v && field.pattern && !field.pattern.test(v)) e[key] = field.patternMessage;
    }
    const t = Number(form.timeout);
    if (!Number.isInteger(t) || t < 1000 || t > 120000) e.timeout = "1 000 – 120 000 ms";
    const r = Number(form.maxRetries);
    if (!Number.isInteger(r) || r < 0 || r > 10) e.maxRetries = "0 – 10";
    const b = Number(form.backoffMs);
    if (!Number.isInteger(b) || b < 0 || b > 600000) e.backoffMs = "0 – 600 000 ms";
    setErrors(e);
    return Object.values(e).every((v) => !v);
  }

  async function refreshLogs(page = 1) {
    if (!partner) return;
    setLogsLoading(true);
    try {
      setLogs(await partnerApi.logs(authToken, partner.id, page));
    } catch {
      // keep the previous page
    } finally {
      setLogsLoading(false);
    }
  }

  function applyPartner(p: PartnerView) {
    setPartner(p);
    const next = fromPartner(p, appUrl);
    setSaved(next);
    setForm(next);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!validate()) return;
    if (
      partner?.status === "Active" &&
      [
        "merchantCode",
        "environment",
        "apiKey",
        "secretKey",
        "endpointSandbox",
        "endpointProduction",
      ].some((k) => form[k as keyof FormState] !== saved[k as keyof FormState]) &&
      !window.confirm(
        "Thay đổi thông tin kết nối sẽ chuyển đối tác về trạng thái Ngưng cho đến khi test và kích hoạt lại. Tiếp tục?",
      )
    ) {
      return;
    }
    const body: PartnerPayload = {
      connector_type: form.connectorType,
      name: form.name.trim(),
      merchant_code: form.merchantCode.trim(),
      environment: form.environment,
      ...(form.apiKey.trim() ? { api_key: form.apiKey.trim() } : {}),
      ...(form.secretKey.trim() ? { secret_key: form.secretKey.trim() } : {}),
      endpoint_sandbox: spec.usesEndpoints ? form.endpointSandbox.trim() : "",
      endpoint_production: spec.usesEndpoints ? form.endpointProduction.trim() : "",
      callback_url: form.callbackUrl.trim(),
      webhook_url: form.webhookUrl.trim(),
      timeout: Number(form.timeout),
      retry_policy: { max_retries: Number(form.maxRetries), backoff_ms: Number(form.backoffMs) },
    };
    setSaving(true);
    try {
      if (isNew) {
        const created = await partnerApi.create(authToken, body);
        router.push(`/partners/${created.id}`);
        return;
      }
      const updated = await partnerApi.update(authToken, partner!.id, body);
      applyPartner(updated);
      setMessage({ tone: "ok", text: "Đã lưu cấu hình" });
      void refreshLogs();
    } catch (err) {
      if (err instanceof ApiCallError && err.details) {
        const fieldErrors: Partial<Record<keyof FormState, string>> = {};
        for (const [k, msgs] of Object.entries(err.details)) {
          const key = FIELD_KEYS[k];
          if (key) fieldErrors[key] = msgs[0];
        }
        setErrors(fieldErrors);
      }
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Lưu thất bại" });
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(next: "Active" | "Inactive") {
    if (!partner) return;
    if (next === "Inactive" && !window.confirm(`Vô hiệu hóa "${partner.name}"?`)) return;
    setStatusBusy(true);
    setMessage(null);
    try {
      applyPartner(await partnerApi.setStatus(authToken, partner.id, next));
      setMessage({
        tone: "ok",
        text: next === "Active" ? "Đã kích hoạt đối tác" : "Đã vô hiệu hóa đối tác",
      });
      void refreshLogs();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Thao tác thất bại" });
    } finally {
      setStatusBusy(false);
    }
  }

  const canActivate =
    !!partner && partner.status !== "Active" && !!partner.testResult?.success && !dirty;

  return (
    <form onSubmit={save} className="space-y-5" noValidate>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/partners"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
            aria-label="Quay lại danh sách đối tác"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold text-gray-800">
              {isNew ? "Thêm đối tác" : partner!.name}
            </h1>
            {partner && (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <PartnerStatusBadge status={partner.status} />
                <EnvBadge env={partner.environment} />
              </div>
            )}
          </div>
        </div>
        {canWrite && (
          <div className="flex gap-2">
            {dirty && !isNew && (
              <button
                type="button"
                onClick={() => {
                  setForm(saved);
                  setErrors({});
                }}
                className="h-9 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Hủy thay đổi
              </button>
            )}
            <button
              type="submit"
              disabled={saving || (!dirty && !isNew)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Lưu cấu hình
            </button>
          </div>
        )}
      </div>

      {message && (
        <div
          role={message.tone === "error" ? "alert" : "status"}
          className={cn(
            "rounded-lg border px-4 py-2.5 text-sm",
            message.tone === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700",
          )}
        >
          {message.text}
        </div>
      )}

      {!canWrite && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          Chế độ chỉ xem — cần role <code>payhub-admin</code> để sửa cấu hình.
        </div>
      )}

      <fieldset disabled={readOnly} className="grid gap-5 lg:grid-cols-2">
        <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-gray-800">Thông tin cơ bản</h2>
          <Field label="Loại connector" htmlFor="connectorType" required hint={spec.description}>
            <select
              id="connectorType"
              className={inputCls}
              value={form.connectorType}
              disabled={!isNew || readOnly}
              onChange={(e) => changeType(e.target.value)}
            >
              {PARTNER_TYPE_CODES.map((c) => (
                <option key={c} value={c}>
                  {PARTNER_TYPES[c]!.label}
                  {PARTNER_TYPES[c]!.implemented ? "" : " (chưa hỗ trợ)"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tên hiển thị" htmlFor="name" required error={errors.name}>
            <input
              id="name"
              className={inputCls}
              value={form.name}
              aria-invalid={!!errors.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="VD: VNPay - Production"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={spec.merchantCode.label}
              htmlFor="merchantCode"
              required
              error={errors.merchantCode}
            >
              <input
                id="merchantCode"
                className={inputCls}
                value={form.merchantCode}
                aria-invalid={!!errors.merchantCode}
                onChange={(e) => set("merchantCode", e.target.value)}
                placeholder={spec.merchantCode.placeholder}
                autoComplete="off"
              />
            </Field>
            <Field label="Môi trường" htmlFor="environment" required>
              <select
                id="environment"
                className={inputCls}
                value={form.environment}
                onChange={(e) => set("environment", e.target.value)}
              >
                <option value="Sandbox">Sandbox</option>
                <option value="Production">Production</option>
              </select>
            </Field>
          </div>
          {(["apiKey", "secretKey"] as const).map((key) => {
            const f = spec[key];
            const current = partner?.[key];
            return (
              <Field
                key={key}
                label={f.label}
                htmlFor={key}
                required={isNew}
                error={errors[key]}
                hint={
                  !isNew && f.secret
                    ? `Để trống để giữ nguyên${current ? ` (hiện tại ${current})` : ""}. Giá trị được mã hoá AES-256-GCM.`
                    : f.secret
                      ? "Được mã hoá AES-256-GCM, không hiển thị lại sau khi lưu."
                      : undefined
                }
              >
                <input
                  id={key}
                  type={f.secret ? "password" : "text"}
                  className={inputCls}
                  value={form[key]}
                  aria-invalid={!!errors[key]}
                  onChange={(e) => set(key, e.target.value)}
                  placeholder={!isNew && f.secret ? "••••••••" : f.placeholder}
                  autoComplete={f.secret ? "new-password" : "off"}
                />
              </Field>
            );
          })}
        </section>

        <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-gray-800">Cấu hình kết nối</h2>
          {spec.usesEndpoints ? (
            <>
              <Field
                label="Endpoint (Sandbox)"
                htmlFor="endpointSandbox"
                error={errors.endpointSandbox}
              >
                <input
                  id="endpointSandbox"
                  type="url"
                  className={inputCls}
                  value={form.endpointSandbox}
                  onChange={(e) => set("endpointSandbox", e.target.value)}
                />
              </Field>
              <Field
                label="Endpoint (Production)"
                htmlFor="endpointProduction"
                error={errors.endpointProduction}
              >
                <input
                  id="endpointProduction"
                  type="url"
                  className={inputCls}
                  value={form.endpointProduction}
                  onChange={(e) => set("endpointProduction", e.target.value)}
                />
              </Field>
            </>
          ) : (
            <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
              {spec.label} không gọi API đối tác — không cần endpoint.
            </p>
          )}
          <Field
            label="Callback URL (redirect)"
            htmlFor="callbackUrl"
            error={errors.callbackUrl}
            hint="URL đối tác chuyển khách về sau khi thanh toán"
          >
            <input
              id="callbackUrl"
              type="url"
              className={inputCls}
              value={form.callbackUrl}
              onChange={(e) => set("callbackUrl", e.target.value)}
            />
          </Field>
          <Field
            label="Webhook URL (nhận IPN)"
            htmlFor="webhookUrl"
            error={errors.webhookUrl}
            hint={
              form.connectorType === "MoMo"
                ? "Gửi kèm mỗi yêu cầu thanh toán (ipnUrl) — phải truy cập được từ Internet"
                : "Khai báo URL này trên cổng quản trị của đối tác"
            }
          >
            <input
              id="webhookUrl"
              type="url"
              className={inputCls}
              value={form.webhookUrl}
              onChange={(e) => set("webhookUrl", e.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Timeout (ms)" htmlFor="timeout" error={errors.timeout}>
              <input
                id="timeout"
                type="number"
                inputMode="numeric"
                className={inputCls}
                value={form.timeout}
                onChange={(e) => set("timeout", e.target.value)}
              />
            </Field>
            <Field label="Retry tối đa" htmlFor="maxRetries" error={errors.maxRetries}>
              <input
                id="maxRetries"
                type="number"
                inputMode="numeric"
                className={inputCls}
                value={form.maxRetries}
                onChange={(e) => set("maxRetries", e.target.value)}
              />
            </Field>
            <Field label="Backoff (ms)" htmlFor="backoffMs" error={errors.backoffMs}>
              <input
                id="backoffMs"
                type="number"
                inputMode="numeric"
                className={inputCls}
                value={form.backoffMs}
                onChange={(e) => set("backoffMs", e.target.value)}
              />
            </Field>
          </div>
        </section>
      </fieldset>

      {partner && (
        <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-gray-800">Kết nối & kích hoạt</h2>
          <TestConnectionButton
            partnerId={partner.id}
            authToken={authToken}
            lastResult={partner.testResult}
            lastTestedAt={partner.lastTestedAt}
            disabled={!canWrite || dirty || !spec.implemented}
            disabledReason={
              !spec.implemented
                ? `Connector ${spec.label} chưa được hỗ trợ trong phiên bản này`
                : dirty
                  ? "Lưu thay đổi trước khi test kết nối"
                  : undefined
            }
            onTested={(p) => {
              applyPartner(p);
              void refreshLogs();
            }}
          />
          {canWrite && (
            <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
              {partner.status === "Active" ? (
                <button
                  type="button"
                  onClick={() => changeStatus("Inactive")}
                  disabled={statusBusy}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 px-4 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  {statusBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <PowerOff className="h-4 w-4" />
                  )}
                  Vô hiệu hóa
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => changeStatus("Active")}
                  disabled={statusBusy || !canActivate}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {statusBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Power className="h-4 w-4" />
                  )}
                  Kích hoạt
                </button>
              )}
              <span className="text-xs text-gray-500">
                {partner.status === "Active"
                  ? "Đang nhận giao dịch mới."
                  : partner.status === "Error"
                    ? "Lỗi kết nối — test lại thành công để tự khôi phục, hoặc vô hiệu hóa."
                    : canActivate
                      ? "Test kết nối đã đạt — có thể kích hoạt."
                      : "Chỉ kích hoạt được sau khi test kết nối thành công."}
              </span>
            </div>
          )}
        </section>
      )}

      {partner && logs && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold text-gray-800">Lịch sử thay đổi cấu hình</h2>
          <PartnerLogTable
            items={logs.items}
            page={logs.page}
            total={logs.total}
            totalPages={logs.totalPages}
            loading={logsLoading}
            onPage={(p) => void refreshLogs(p)}
          />
        </section>
      )}
    </form>
  );
}
