import type { Permission } from "@/types/auth";

/**
 * Permission catalog stored in `permissions` (code = "module.action") and assigned to roles in
 * the Staff module. API procedures check coarser capabilities (`Permission`, e.g. "pos:write");
 * every catalog entry grants exactly one capability via `grants`, so assigning a detailed
 * permission to a custom role is what unlocks the matching procedures.
 *
 * System roles (code admin/manager/…) mirror the Keycloak realm roles `bizone-<code>`: their
 * permissions come from ROLE_PERMISSIONS in lib/rbac.ts and are not editable.
 */
export interface CatalogPermission {
  module: string;
  action: string;
  name: string;
  /** Capability checked by the API (null = reserved for a module not built yet) */
  grants: Permission | null;
}

export const PERMISSION_CATALOG: CatalogPermission[] = [
  { module: "pos", action: "create_invoice", name: "Tạo hóa đơn", grants: "pos:write" },
  { module: "pos", action: "read_invoice", name: "Xem hóa đơn", grants: "pos:read" },
  { module: "pos", action: "cancel_invoice", name: "Hủy hóa đơn", grants: "pos:write" },
  { module: "pos", action: "refund_invoice", name: "Đổi trả hóa đơn", grants: "pos:write" },
  { module: "pos", action: "manage_session", name: "Quản lý ca", grants: "pos:write" },
  { module: "product", action: "create", name: "Thêm sản phẩm", grants: "product:write" },
  { module: "product", action: "read", name: "Xem sản phẩm", grants: "product:read" },
  { module: "product", action: "update", name: "Sửa sản phẩm", grants: "product:write" },
  { module: "product", action: "delete", name: "Xóa sản phẩm", grants: "product:write" },
  {
    module: "product",
    action: "manage_category",
    name: "Quản lý danh mục",
    grants: "product:write",
  },
  {
    module: "product",
    action: "import_export",
    name: "Import/Export sản phẩm",
    grants: "product:write",
  },
  {
    module: "warehouse",
    action: "create_transaction",
    name: "Tạo phiếu nhập/xuất",
    grants: "inventory:write",
  },
  { module: "warehouse", action: "read_inventory", name: "Xem tồn kho", grants: "inventory:read" },
  { module: "warehouse", action: "stock_take", name: "Kiểm kê kho", grants: "inventory:write" },
  { module: "warehouse", action: "transfer", name: "Chuyển kho", grants: "inventory:write" },
  { module: "crm", action: "create", name: "Thêm khách hàng", grants: "crm:write" },
  { module: "crm", action: "read", name: "Xem khách hàng", grants: "crm:read" },
  { module: "crm", action: "update", name: "Sửa khách hàng", grants: "crm:write" },
  {
    module: "crm",
    action: "manage_points",
    name: "Quản lý điểm thưởng",
    grants: "crm:manage_points",
  },
  { module: "crm", action: "manage_debt", name: "Quản lý công nợ", grants: "crm:manage_debt" },
  { module: "order", action: "read", name: "Xem đơn hàng", grants: "order:read" },
  { module: "order", action: "update_status", name: "Cập nhật trạng thái", grants: "order:write" },
  { module: "order", action: "manage_return", name: "Quản lý đổi trả", grants: "order:write" },
  { module: "staff", action: "read", name: "Xem nhân viên", grants: "staff:read" },
  { module: "staff", action: "create", name: "Thêm nhân viên", grants: "staff:write" },
  { module: "staff", action: "update", name: "Sửa nhân viên", grants: "staff:write" },
  { module: "staff", action: "delete", name: "Xóa nhân viên", grants: "staff:write" },
  {
    module: "staff",
    action: "manage_shift",
    name: "Quản lý ca làm việc",
    grants: "staff:manage_shift",
  },
  {
    module: "staff",
    action: "manage_attendance",
    name: "Quản lý chấm công",
    grants: "staff:manage_attendance",
  },
  {
    module: "staff",
    action: "manage_commission",
    name: "Quản lý hoa hồng",
    grants: "staff:manage_commission",
  },
  {
    module: "staff",
    action: "view_audit_log",
    name: "Xem audit log",
    grants: "staff:view_audit_log",
  },
  { module: "report", action: "view_dashboard", name: "Xem dashboard", grants: "report:read" },
  {
    module: "report",
    action: "view_revenue",
    name: "Xem báo cáo doanh thu",
    grants: "report:read",
  },
  {
    module: "report",
    action: "view_profit",
    name: "Xem báo cáo lợi nhuận",
    grants: "report:read",
  },
  {
    module: "report",
    action: "view_inventory",
    name: "Xem báo cáo tồn kho",
    grants: "report:read",
  },
  { module: "report", action: "export", name: "Xuất báo cáo", grants: "report:read" },
  { module: "supplier", action: "create", name: "Thêm nhà cung cấp", grants: "supplier:write" },
  { module: "supplier", action: "read", name: "Xem nhà cung cấp", grants: "supplier:read" },
  { module: "supplier", action: "update", name: "Sửa nhà cung cấp", grants: "supplier:write" },
  {
    module: "supplier",
    action: "manage_po",
    name: "Quản lý đơn nhập",
    grants: "supplier:manage_po",
  },
  { module: "omni", action: "manage_connection", name: "Quản lý kết nối kênh", grants: null },
  { module: "omni", action: "manage_product_sync", name: "Đồng bộ sản phẩm", grants: null },
  { module: "omni", action: "manage_order_sync", name: "Đồng bộ đơn hàng", grants: null },
  {
    module: "marketing",
    action: "manage_coupon",
    name: "Quản lý mã giảm giá",
    grants: "marketing:coupon",
  },
  {
    module: "marketing",
    action: "manage_flash_sale",
    name: "Quản lý flash sale",
    grants: "marketing:flash_sale",
  },
  {
    module: "marketing",
    action: "manage_promotion",
    name: "Quản lý khuyến mãi",
    grants: "marketing:promotion",
  },
  {
    module: "marketing",
    action: "manage_campaign",
    name: "Chiến dịch SMS / Email",
    grants: "marketing:campaign",
  },
  {
    module: "accounting",
    action: "read",
    name: "Xem sổ quỹ, thu chi, báo cáo tài chính",
    grants: "accounting:read",
  },
  { module: "accounting", action: "manage_fund", name: "Quản lý quỹ", grants: "accounting:fund" },
  {
    module: "accounting",
    action: "manage_revenue_expense",
    name: "Quản lý thu chi",
    grants: "accounting:revenue_expense",
  },
  {
    module: "accounting",
    action: "manage_debt",
    name: "Quản lý công nợ",
    grants: "accounting:debt",
  },
  { module: "config", action: "read", name: "Xem cấu hình", grants: "config:read" },
  { module: "config", action: "update", name: "Cập nhật cấu hình", grants: "config:write" },
  { module: "config", action: "manage_role", name: "Quản lý vai trò", grants: "staff:write" },
];

export const MODULE_LABELS: Record<string, string> = {
  pos: "POS",
  product: "Sản phẩm",
  warehouse: "Kho hàng",
  crm: "Khách hàng",
  order: "Đơn hàng",
  staff: "Nhân viên",
  report: "Báo cáo",
  supplier: "Nhà cung cấp",
  omni: "Omni Channel",
  marketing: "Marketing",
  accounting: "Kế toán",
  config: "Cài đặt",
};

export function permissionCode(p: Pick<CatalogPermission, "module" | "action">): string {
  return `${p.module}.${p.action}`;
}

const GRANTS = new Map(PERMISSION_CATALOG.map((p) => [permissionCode(p), p.grants]));

/** Capabilities unlocked by a set of catalog codes (unknown / reserved codes grant nothing) */
export function capabilitiesOf(codes: Iterable<string>): Set<Permission> {
  const out = new Set<Permission>();
  for (const code of codes) {
    const grant = GRANTS.get(code);
    if (grant) out.add(grant);
  }
  return out;
}

/** System roles — `code` ↔ Keycloak realm role `bizone-<code>` */
export const SYSTEM_ROLES = [
  { code: "admin", name: "Quản trị viên", description: "Toàn quyền hệ thống" },
  { code: "manager", name: "Quản lý", description: "Vận hành, báo cáo, trừ cấu hình" },
  { code: "seller", name: "Nhân viên bán hàng", description: "POS, tra cứu sản phẩm, khách hàng" },
  { code: "warehouse", name: "Nhân viên kho", description: "Quản lý kho, nhập/xuất/kiểm kê" },
  { code: "viewer", name: "Người xem", description: "Chỉ xem báo cáo, dashboard" },
] as const;

export type SystemRoleCode = (typeof SYSTEM_ROLES)[number]["code"];

export const SYSTEM_ROLE_CODES = SYSTEM_ROLES.map((r) => r.code) as readonly string[];

export function keycloakRoleOf(code: string): string | null {
  return SYSTEM_ROLE_CODES.includes(code) ? `bizone-${code}` : null;
}

/**
 * Catalog codes a system role holds: every entry whose capability the Keycloak role grants
 * (admin holds the whole catalog, including entries reserved for modules not built yet).
 */
export function systemRolePermissionCodes(
  code: string,
  roleCapabilities: (keycloakRole: string) => Permission[],
): string[] {
  const kcRole = keycloakRoleOf(code);
  if (!kcRole) return [];
  const caps = roleCapabilities(kcRole);
  if (caps.includes("admin:*")) return PERMISSION_CATALOG.map(permissionCode);
  return PERMISSION_CATALOG.filter((p) => p.grants && caps.includes(p.grants)).map(permissionCode);
}
