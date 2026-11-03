"use client";

import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatCard } from "@/components/ui/StatCard";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import { Input } from "@/components/forms/Input";
import { Select } from "@/components/forms/Select";
import { NumericKeypad } from "@/components/forms/NumericKeypad";
import { Button } from "@/components/ui/button";
import {
  DollarSign,
  ShoppingCart,
  Users,
  Package,
  Search,
} from "lucide-react";

interface Product {
  id: number;
  name: string;
  sku: string;
  price: string;
  stock: number;
  status: string;
}

const PRODUCTS: Product[] = Array.from({ length: 35 }, (_, i) => ({
  id: i + 1,
  name: `Sản phẩm ${i + 1}`,
  sku: `SKU-${String(i + 1).padStart(4, "0")}`,
  price: `${((i + 1) * 125000).toLocaleString("vi-VN")}đ`,
  stock: Math.floor(Math.random() * 200),
  status: i % 5 === 0 ? "Ngừng bán" : "Đang bán",
}));

const COLUMNS: Column<Product>[] = [
  { key: "id", label: "ID", sortable: true, className: "w-16" },
  { key: "name", label: "Tên sản phẩm", sortable: true },
  { key: "sku", label: "SKU" },
  { key: "price", label: "Giá bán", sortable: true },
  { key: "stock", label: "Tồn kho", sortable: true },
  {
    key: "status",
    label: "Trạng thái",
    render: (row) => (
      <span
        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
          row.status === "Đang bán"
            ? "bg-emerald-100 text-emerald-700"
            : "bg-gray-100 text-gray-500"
        }`}
      >
        {row.status}
      </span>
    ),
  },
];

function UIKitInner() {
  const { success, error, info, warning } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [keypadValue, setKeypadValue] = useState("0");
  const [inputValue, setInputValue] = useState("");

  return (
    <AppLayout>
      <div className="max-w-5xl space-y-10">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">UI Kit — BizOne</h1>
          <p className="mt-1 text-sm text-gray-500">Thư viện components dùng cho toàn hệ thống</p>
        </div>

        {/* StatCards */}
        <section>
          <h2 className="mb-4 text-base font-semibold text-gray-700">StatCard</h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              title="Doanh thu hôm nay"
              value="48.250.000đ"
              trend={{ value: "12.5% so với hôm qua", up: true }}
              icon={<DollarSign className="h-5 w-5" />}
            />
            <StatCard
              title="Đơn hàng hôm nay"
              value="42"
              trend={{ value: "8% so với hôm qua", up: true }}
              icon={<ShoppingCart className="h-5 w-5" />}
            />
            <StatCard
              title="Khách hàng mới"
              value="12"
              trend={{ value: "3 khách", up: true }}
              icon={<Users className="h-5 w-5" />}
            />
            <StatCard
              title="SP đã bán"
              value="86"
              trend={{ value: "5% so với hôm qua", up: false }}
              icon={<Package className="h-5 w-5" />}
            />
          </div>
        </section>

        {/* DataTable */}
        <section>
          <h2 className="mb-4 text-base font-semibold text-gray-700">DataTable (sort + search + phân trang)</h2>
          <DataTable
            columns={COLUMNS}
            data={PRODUCTS}
            searchable
            searchPlaceholder="Tìm theo tên, SKU..."
            pageSize={10}
          />
        </section>

        {/* Forms */}
        <section>
          <h2 className="mb-4 text-base font-semibold text-gray-700">Form Fields</h2>
          <Card>
            <CardBody className="grid grid-cols-2 gap-5">
              <Input
                label="Tên sản phẩm"
                placeholder="Nhập tên sản phẩm..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                required
                leftIcon={<Search className="h-4 w-4" />}
              />
              <Input
                label="Mã SKU"
                placeholder="VD: SKU-0001"
                hint="Mã SKU phải là duy nhất"
              />
              <Input
                label="Lỗi nhập liệu"
                placeholder="Trường bắt buộc"
                error="Vui lòng nhập tên sản phẩm"
                required
              />
              <Input label="Đã vô hiệu hoá" placeholder="Không thể chỉnh sửa" disabled />
              <Select
                label="Danh mục"
                placeholder="-- Chọn danh mục --"
                options={[
                  { value: "1", label: "Đồ uống" },
                  { value: "2", label: "Thực phẩm" },
                  { value: "3", label: "Điện tử" },
                ]}
              />
              <Select
                label="Trạng thái"
                options={[
                  { value: "active", label: "Đang bán" },
                  { value: "inactive", label: "Ngừng bán" },
                ]}
              />
            </CardBody>
          </Card>
        </section>

        {/* Numeric Keypad */}
        <section>
          <h2 className="mb-4 text-base font-semibold text-gray-700">NumericKeypad (POS)</h2>
          <div className="flex gap-6 items-start">
            <div className="w-60">
              <div className="mb-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-right">
                <p className="text-xs text-gray-400">Số tiền</p>
                <p className="text-2xl font-bold text-blue-600">
                  {Number(keypadValue).toLocaleString("vi-VN")}đ
                </p>
              </div>
              <NumericKeypad value={keypadValue} onChange={setKeypadValue} />
            </div>
          </div>
        </section>

        {/* Toasts */}
        <section>
          <h2 className="mb-4 text-base font-semibold text-gray-700">Toast Notifications</h2>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => success("Lưu thành công!")}>Success Toast</Button>
            <Button variant="destructive" onClick={() => error("Có lỗi xảy ra!")}>Error Toast</Button>
            <Button variant="outline" onClick={() => info("Thông tin cập nhật")}>Info Toast</Button>
            <Button variant="secondary" onClick={() => warning("Tồn kho sắp hết!")}>Warning Toast</Button>
          </div>
        </section>

        {/* Modal */}
        <section>
          <h2 className="mb-4 text-base font-semibold text-gray-700">Modal / Dialog</h2>
          <Button onClick={() => setModalOpen(true)}>Mở Modal</Button>
          <Modal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            title="Thêm sản phẩm mới"
            size="md"
            footer={
              <>
                <Button variant="outline" onClick={() => setModalOpen(false)}>
                  Huỷ
                </Button>
                <Button onClick={() => { success("Đã lưu!"); setModalOpen(false); }}>
                  Lưu
                </Button>
              </>
            }
          >
            <div className="space-y-4">
              <Input label="Tên sản phẩm" placeholder="Nhập tên..." required />
              <Input label="Giá bán" placeholder="0" type="number" />
              <Select
                label="Danh mục"
                placeholder="-- Chọn --"
                options={[
                  { value: "1", label: "Đồ uống" },
                  { value: "2", label: "Thực phẩm" },
                ]}
              />
            </div>
          </Modal>
        </section>
      </div>
    </AppLayout>
  );
}

export default function UIKitPage() {
  return (
    <ToastProvider>
      <UIKitInner />
    </ToastProvider>
  );
}
