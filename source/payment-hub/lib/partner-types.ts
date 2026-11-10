/**
 * Partner (PSP) types the admin can configure, and what each partner_configs column means for
 * that type. Shared by the API (validation, masking) and the admin UI (labels) — no server imports.
 */

export type PartnerStatus = "Active" | "Inactive" | "Error";
export type PartnerEnv = "Sandbox" | "Production";

export interface PartnerFieldSpec {
  label: string;
  /** Secret values are write-only: the API never returns them, only a masked hint. */
  secret: boolean;
  placeholder?: string;
  pattern?: RegExp;
  patternMessage?: string;
}

export interface PartnerTypeSpec {
  label: string;
  description: string;
  apiKey: PartnerFieldSpec;
  secretKey: PartnerFieldSpec;
  merchantCode: PartnerFieldSpec;
  /** Payment page endpoints apply (redirect PSPs). */
  usesEndpoints: boolean;
  defaultEndpointSandbox?: string;
  defaultEndpointProduction?: string;
  /** A connector exists in this build → "test connection" and activation are possible. */
  implemented: boolean;
}

export const PARTNER_TYPES: Record<string, PartnerTypeSpec> = {
  VNPay: {
    label: "VNPay",
    description: "Cổng thanh toán VNPay (QR, ATM, thẻ quốc tế)",
    merchantCode: { label: "TMN Code", secret: false, placeholder: "VD: 2QXUI4J4" },
    apiKey: { label: "API Key", secret: true, placeholder: "Thường trùng TMN Code" },
    secretKey: { label: "Hash Secret", secret: true },
    usesEndpoints: true,
    defaultEndpointSandbox: "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",
    defaultEndpointProduction: "https://pay.vnpay.vn/vpcpay.html",
    implemented: true,
  },
  VietQR: {
    label: "VietQR",
    description: "Chuyển khoản NAPAS 247 qua mã VietQR",
    apiKey: {
      label: "Mã BIN ngân hàng (NAPAS)",
      secret: false,
      placeholder: "VD: 970436 (Vietcombank)",
      pattern: /^\d{6}$/,
      patternMessage: "Mã BIN gồm 6 chữ số",
    },
    merchantCode: {
      label: "Số tài khoản nhận",
      secret: false,
      pattern: /^[0-9A-Za-z]{1,19}$/,
      patternMessage: "Số tài khoản gồm 1–19 chữ/số",
    },
    secretKey: { label: "Tên chủ tài khoản", secret: false, placeholder: "VD: CONG TY ABC" },
    usesEndpoints: false,
    implemented: true,
  },
  MoMo: {
    label: "MoMo",
    description: "Ví MoMo (QR / app MoMo) — IPN tại /api/ipn/momo",
    merchantCode: { label: "Partner Code", secret: false, placeholder: "VD: MOMOXXXX" },
    apiKey: { label: "Access Key", secret: true },
    secretKey: { label: "Secret Key", secret: true },
    usesEndpoints: true,
    defaultEndpointSandbox: "https://test-payment.momo.vn/v2/gateway/api/create",
    defaultEndpointProduction: "https://payment.momo.vn/v2/gateway/api/create",
    implemented: true,
  },
  ZaloPay: {
    label: "ZaloPay",
    description: "Ví ZaloPay — connector ở P5.2",
    merchantCode: { label: "App ID", secret: false },
    apiKey: { label: "Key1", secret: true },
    secretKey: { label: "Key2", secret: true },
    usesEndpoints: true,
    defaultEndpointSandbox: "https://sb-openapi.zalopay.vn/v2/create",
    defaultEndpointProduction: "https://openapi.zalopay.vn/v2/create",
    implemented: false,
  },
};

export const PARTNER_TYPE_CODES = Object.keys(PARTNER_TYPES);

export const PARTNER_STATUS_LABEL: Record<PartnerStatus, string> = {
  Active: "Hoạt động",
  Inactive: "Ngưng",
  Error: "Lỗi kết nối",
};

export interface RetryPolicy {
  max_retries: number;
  backoff_ms: number;
}

export interface TestResult {
  success: boolean;
  message: string;
  response_time_ms: number;
}

/** What the API returns for a partner config — never a secret value. */
export interface PartnerView {
  id: number;
  connectorType: string;
  name: string;
  merchantCode: string | null;
  environment: PartnerEnv;
  status: PartnerStatus;
  /** Plain value for non-secret fields, masked hint ("••••1234") for secrets. */
  apiKey: string;
  secretKey: string;
  endpointSandbox: string | null;
  endpointProduction: string | null;
  callbackUrl: string | null;
  webhookUrl: string | null;
  timeout: number;
  retryPolicy: RetryPolicy | null;
  testResult: TestResult | null;
  lastTestedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PartnerLogView {
  id: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string | null;
  ipAddress: string | null;
  createdAt: string;
}
