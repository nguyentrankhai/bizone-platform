// Reference data from database/schema.sql (SEED DATA section). Safe to re-run: every row is
// upserted by its unique code, and Admin is (re)granted every permission.
//
// One database per tenant: seeds the tenant named by SEED_TENANT_ID (default DEV_TENANT_ID),
// which must be listed in TENANT_DATABASES.
import { getPrismaForTenant } from "@/lib/prisma";

const seedTenant = process.env.SEED_TENANT_ID ?? process.env.DEV_TENANT_ID;
if (!seedTenant) throw new Error("Set SEED_TENANT_ID (or DEV_TENANT_ID) to the tenant to seed");
const prisma = getPrismaForTenant(seedTenant);

const roles = [
  { code: "admin", name: "Admin", description: "Chủ cửa hàng - Toàn quyền" },
  { code: "manager", name: "Manager", description: "Quản lý vận hành" },
  { code: "seller", name: "Seller", description: "Nhân viên bán hàng" },
  { code: "warehouse", name: "Warehouse", description: "Nhân viên kho" },
  { code: "viewer", name: "Viewer", description: "Chế độ xem" },
];

const permissions: [module: string, action: string, name: string][] = [
  ["pos", "create_invoice", "Tạo hóa đơn"],
  ["pos", "read_invoice", "Xem hóa đơn"],
  ["pos", "cancel_invoice", "Hủy hóa đơn"],
  ["pos", "refund_invoice", "Đổi trả hóa đơn"],
  ["pos", "manage_session", "Quản lý ca"],
  ["product", "create", "Thêm sản phẩm"],
  ["product", "read", "Xem sản phẩm"],
  ["product", "update", "Sửa sản phẩm"],
  ["product", "delete", "Xóa sản phẩm"],
  ["product", "manage_category", "Quản lý danh mục"],
  ["product", "import_export", "Import/Export sản phẩm"],
  ["warehouse", "create_transaction", "Tạo phiếu nhập/xuất"],
  ["warehouse", "read_inventory", "Xem tồn kho"],
  ["warehouse", "stock_take", "Kiểm kê kho"],
  ["warehouse", "transfer", "Chuyển kho"],
  ["crm", "create", "Thêm khách hàng"],
  ["crm", "read", "Xem khách hàng"],
  ["crm", "update", "Sửa khách hàng"],
  ["crm", "manage_points", "Quản lý điểm thưởng"],
  ["crm", "manage_debt", "Quản lý công nợ"],
  ["order", "read", "Xem đơn hàng"],
  ["order", "update_status", "Cập nhật trạng thái"],
  ["order", "manage_return", "Quản lý đổi trả"],
  ["staff", "read", "Xem nhân viên"],
  ["staff", "create", "Thêm nhân viên"],
  ["staff", "update", "Sửa nhân viên"],
  ["staff", "delete", "Xóa nhân viên"],
  ["staff", "manage_shift", "Quản lý ca làm việc"],
  ["staff", "manage_attendance", "Quản lý chấm công"],
  ["staff", "manage_commission", "Quản lý hoa hồng"],
  ["staff", "view_audit_log", "Xem audit log"],
  ["report", "view_dashboard", "Xem dashboard"],
  ["report", "view_revenue", "Xem báo cáo doanh thu"],
  ["report", "view_profit", "Xem báo cáo lợi nhuận"],
  ["report", "view_inventory", "Xem báo cáo tồn kho"],
  ["report", "export", "Xuất báo cáo"],
  ["supplier", "create", "Thêm nhà cung cấp"],
  ["supplier", "read", "Xem nhà cung cấp"],
  ["supplier", "update", "Sửa nhà cung cấp"],
  ["supplier", "manage_po", "Quản lý đơn nhập"],
  ["omni", "manage_connection", "Quản lý kết nối kênh"],
  ["omni", "manage_product_sync", "Đồng bộ sản phẩm"],
  ["omni", "manage_order_sync", "Đồng bộ đơn hàng"],
  ["marketing", "manage_coupon", "Quản lý mã giảm giá"],
  ["marketing", "manage_flash_sale", "Quản lý flash sale"],
  ["marketing", "manage_promotion", "Quản lý khuyến mãi"],
  ["accounting", "manage_fund", "Quản lý quỹ"],
  ["accounting", "manage_revenue_expense", "Quản lý thu chi"],
  ["accounting", "manage_debt", "Quản lý công nợ"],
  ["config", "read", "Xem cấu hình"],
  ["config", "update", "Cập nhật cấu hình"],
  ["config", "manage_role", "Quản lý vai trò"],
];

const customerGroups = [
  {
    code: "retail",
    name: "Khách lẻ",
    description: "Khách hàng mua lẻ",
    discountPercent: 0,
    isDefault: true,
  },
  {
    code: "wholesale",
    name: "Khách buôn",
    description: "Khách hàng mua buôn",
    discountPercent: 5,
    isDefault: false,
  },
  {
    code: "vip",
    name: "Khách VIP",
    description: "Khách hàng thân thiết",
    discountPercent: 10,
    isDefault: false,
  },
];

const transactionTypes = [
  { code: "purchase_receipt", name: "Nhập kho từ đơn nhập hàng", direction: "in" },
  { code: "sales_issue", name: "Xuất kho cho hóa đơn bán", direction: "out" },
  { code: "transfer_out", name: "Chuyển kho đi", direction: "out" },
  { code: "transfer_in", name: "Nhận chuyển kho đến", direction: "in" },
  { code: "adjustment_in", name: "Điều chỉnh tăng", direction: "in" },
  { code: "adjustment_out", name: "Điều chỉnh giảm", direction: "out" },
  { code: "return_in", name: "Nhập kho hàng trả lại", direction: "in" },
  { code: "return_out", name: "Xuất kho trả nhà cung cấp", direction: "out" },
  { code: "stock_take", name: "Kiểm kê kho", direction: "out" },
] as const;

const storeConfig: [key: string, value: string, group: string, description: string][] = [
  ["store_name", "Cửa hàng của tôi", "general", "Tên cửa hàng"],
  ["store_address", "", "general", "Địa chỉ cửa hàng"],
  ["store_phone", "", "general", "Số điện thoại"],
  ["store_email", "", "general", "Email"],
  ["tax_rate", "10", "tax", "Thuế suất VAT mặc định (%)"],
  ["currency", "VND", "general", "Đơn vị tiền tệ"],
  ["loyalty_rate", "1", "loyalty", "Số điểm tích lũy trên 1.000đ"],
  ["loyalty_convert_rate", "1000", "loyalty", "Giá trị quy đổi 1 điểm (VNĐ)"],
  ["min_stock_alert", "10", "inventory", "Ngưỡng cảnh báo tồn kho tối thiểu (mặc định)"],
  ["invoice_prefix", "HD", "pos", "Tiền tố mã hóa đơn"],
  ["bank_bin", "", "payment", "Mã BIN ngân hàng nhận chuyển khoản (VietQR), vd 970436"],
  ["bank_name", "", "payment", "Tên ngân hàng"],
  ["bank_account_no", "", "payment", "Số tài khoản nhận chuyển khoản"],
  ["bank_account_name", "", "payment", "Tên chủ tài khoản"],
  ["pos_two_screen", "0", "pos", "Bật chế độ POS 2 màn hình"],
  ["receipt_printer", "", "pos", "Máy in hóa đơn mặc định"],
  ["notification_stock_alert", "1", "notification", "Bật cảnh báo tồn kho"],
  ["notification_expiry_alert_30", "1", "notification", "Cảnh báo HSD 30 ngày"],
  ["notification_expiry_alert_14", "1", "notification", "Cảnh báo HSD 14 ngày"],
  ["notification_expiry_alert_7", "1", "notification", "Cảnh báo HSD 7 ngày"],
  ["notification_debt_alert", "1", "notification", "Cảnh báo công nợ quá hạn"],
];

const revenueExpenseCategories = [
  { code: "revenue_sales", name: "Doanh thu bán hàng", type: "revenue" },
  { code: "revenue_other", name: "Doanh thu khác", type: "revenue" },
  { code: "expense_purchase", name: "Tiền nhập hàng", type: "expense" },
  { code: "expense_rent", name: "Tiền thuê mặt bằng", type: "expense" },
  { code: "expense_electricity", name: "Tiền điện", type: "expense" },
  { code: "expense_water", name: "Tiền nước", type: "expense" },
  { code: "expense_salary", name: "Lương nhân viên", type: "expense" },
  { code: "expense_shipping", name: "Chi phí vận chuyển", type: "expense" },
  { code: "expense_marketing", name: "Chi phí marketing", type: "expense" },
  { code: "expense_other", name: "Chi phí khác", type: "expense" },
] as const;

const productCategories = [
  { slug: "thoi-trang", name: "Thời trang" },
  { slug: "dien-tu", name: "Điện tử" },
  { slug: "thuc-pham", name: "Thực phẩm" },
  { slug: "do-uong", name: "Đồ uống" },
  { slug: "my-pham", name: "Mỹ phẩm" },
  { slug: "do-gia-dung", name: "Đồ gia dụng" },
  { slug: "sach-van-phong-pham", name: "Sách văn phòng phẩm" },
  { slug: "khac", name: "Khác" },
];

const notificationTemplates = [
  {
    templateCode: "invoice_email",
    templateName: "Hóa đơn điện tử",
    channel: "email",
    subject: "Hóa đơn điện tử từ {{store_name}}",
    content:
      "Cảm ơn {{customer_name}} đã mua hàng tại {{store_name}}. Mã hóa đơn: {{invoice_code}}, tổng tiền: {{total_amount}}",
    variables: "store_name,customer_name,invoice_code,total_amount",
  },
  {
    templateCode: "debt_reminder_sms",
    templateName: "Nhắc nợ SMS",
    channel: "sms",
    subject: "",
    content:
      "Khách hàng {{customer_name}} thân mến, bạn còn {{remaining_amount}}đ chưa thanh toán. Vui lòng thanh toán trước {{due_date}}.",
    variables: "customer_name,remaining_amount,due_date",
  },
  {
    templateCode: "welcome_sms",
    templateName: "Chào mừng khách mới",
    channel: "sms",
    subject: "",
    content: "Chào mừng {{customer_name}} đến với {{store_name}}. Cảm ơn bạn đã tin tưởng!",
    variables: "customer_name,store_name",
  },
];

async function main() {
  for (const role of roles) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: { name: role.name, description: role.description, isSystem: true },
      create: { ...role, isSystem: true },
    });
  }

  for (const [module, action, name] of permissions) {
    const code = `${module}.${action}`;
    await prisma.permission.upsert({
      where: { code },
      update: { module, action, name },
      create: { module, action, name, code },
    });
  }

  const admin = await prisma.role.findUniqueOrThrow({ where: { code: "admin" } });
  const allPermissions = await prisma.permission.findMany({ select: { id: true } });
  await prisma.rolePermission.createMany({
    data: allPermissions.map((p) => ({ roleId: admin.id, permissionId: p.id })),
    skipDuplicates: true,
  });

  for (const group of customerGroups) {
    await prisma.customerGroup.upsert({
      where: { code: group.code },
      update: group,
      create: group,
    });
  }

  for (const type of transactionTypes) {
    await prisma.inventoryTransactionType.upsert({
      where: { code: type.code },
      update: type,
      create: type,
    });
  }

  for (const [configKey, configValue, groupName, description] of storeConfig) {
    // Only fill missing keys: a shop's own settings must survive a re-seed.
    await prisma.storeConfig.upsert({
      where: { configKey },
      update: {},
      create: { configKey, configValue, groupName, description },
    });
  }

  for (const [i, category] of revenueExpenseCategories.entries()) {
    const data = { ...category, sortOrder: i + 1 };
    await prisma.revenueExpenseCategory.upsert({
      where: { code: category.code },
      update: data,
      create: data,
    });
  }

  for (const [i, category] of productCategories.entries()) {
    const data = { ...category, sortOrder: i + 1 };
    await prisma.productCategory.upsert({
      where: { slug: category.slug },
      update: data,
      create: data,
    });
  }

  for (const template of notificationTemplates) {
    await prisma.notificationTemplate.upsert({
      where: { templateCode: template.templateCode },
      update: template,
      create: template,
    });
  }

  console.log(
    `Seeded ${roles.length} roles, ${permissions.length} permissions (admin: ${allPermissions.length}), ` +
      `${customerGroups.length} customer groups, ${transactionTypes.length} transaction types, ` +
      `${storeConfig.length} config keys, ${revenueExpenseCategories.length} revenue/expense categories, ` +
      `${productCategories.length} product categories, ${notificationTemplates.length} notification templates`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
