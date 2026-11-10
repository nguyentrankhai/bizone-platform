// Reference data from database/schema.sql (SEED DATA section). Safe to re-run: every row is
// upserted by its unique code, and Admin is (re)granted every permission.
//
// One database per tenant: seeds the tenant named by SEED_TENANT_ID (default DEV_TENANT_ID),
// which must be listed in TENANT_DATABASES.
import { getPrismaForTenant } from "@/lib/prisma";
import { PERMISSION_CATALOG, SYSTEM_ROLES, systemRolePermissionCodes } from "@/lib/permissions";
import { roleCapabilities } from "@/lib/rbac";

const seedTenant = process.env.SEED_TENANT_ID ?? process.env.DEV_TENANT_ID;
if (!seedTenant) throw new Error("Set SEED_TENANT_ID (or DEV_TENANT_ID) to the tenant to seed");
const prisma = getPrismaForTenant(seedTenant);

// Roles and the permission catalog live in lib/permissions.ts (shared with the Staff module)
const roles = SYSTEM_ROLES;
const permissions = PERMISSION_CATALOG;

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
  [
    "attendance_grace_minutes",
    "5",
    "staff",
    "Số phút cho phép đi trễ / về sớm trước khi tính vi phạm chấm công",
  ],
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

  for (const { module, action, name } of permissions) {
    const code = `${module}.${action}`;
    await prisma.permission.upsert({
      where: { code },
      update: { module, action, name },
      create: { module, action, name, code },
    });
  }

  // System roles mirror the Keycloak realm roles: (re)set their permissions from code
  const allPermissions = await prisma.permission.findMany({ select: { id: true, code: true } });
  const permissionId = new Map(allPermissions.map((p) => [p.code, p.id]));
  for (const role of roles) {
    const { id } = await prisma.role.findUniqueOrThrow({ where: { code: role.code } });
    const ids = systemRolePermissionCodes(role.code, roleCapabilities)
      .map((code) => permissionId.get(code))
      .filter((v): v is number => v !== undefined);
    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId: id } }),
      prisma.rolePermission.createMany({
        data: ids.map((permissionId) => ({ roleId: id, permissionId })),
      }),
    ]);
  }

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

  // P4.6 (#11): a fresh tenant gets one default branch with its sales warehouse so the POS can
  // open a shift right away. Existing branches are never touched.
  let seededBranch = "";
  if ((await prisma.branch.count()) === 0) {
    const branch = await prisma.branch.create({
      data: { code: "CN01", name: "Chi nhánh chính", isDefault: true },
    });
    await prisma.warehouse.upsert({
      where: { code: "KHO-CN01" },
      update: {},
      create: { code: "KHO-CN01", name: "Kho Chi nhánh chính", branchId: branch.id },
    });
    seededBranch = ", default branch CN01 + warehouse KHO-CN01";
  }

  console.log(
    `Seeded ${roles.length} roles, ${permissions.length} permissions (admin: ${allPermissions.length}), ` +
      `${customerGroups.length} customer groups, ${transactionTypes.length} transaction types, ` +
      `${storeConfig.length} config keys, ${revenueExpenseCategories.length} revenue/expense categories, ` +
      `${productCategories.length} product categories, ${notificationTemplates.length} notification templates${seededBranch}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
