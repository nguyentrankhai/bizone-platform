"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload, X, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ProductFormData {
  name: string;
  sku: string;
  barcode: string;
  categoryId: number | null;
  description: string;
  costPrice: number;
  sellingPrice: number;
  taxRate: number;
  unit: string;
  minStock: number;
  maxStock: number | null;
  status: "active" | "inactive" | "discontinued";
  units: UnitRow[];
  variants: VariantRow[];
}

interface UnitRow {
  unitName: string;
  conversionRate: number;
  barcode: string;
  sellingPrice: number | null;
  costPrice: number | null;
  isBase: boolean;
}

interface VariantRow {
  sku: string;
  barcode: string;
  sellingPrice: number;
  costPrice: number;
  attributes: { attributeName: string; attributeValue: string }[];
}

interface CategoryOption {
  id: number;
  name: string;
}

interface ProductFormProps {
  initialData?: Partial<ProductFormData>;
  categories: CategoryOption[];
  isEdit?: boolean;
  onSave: (data: ProductFormData) => Promise<void>;
  loading?: boolean;
}

const DEFAULT_DATA: ProductFormData = {
  name: "",
  sku: "",
  barcode: "",
  categoryId: null,
  description: "",
  costPrice: 0,
  sellingPrice: 0,
  taxRate: 0,
  unit: "cái",
  minStock: 0,
  maxStock: null,
  status: "active",
  units: [],
  variants: [],
};

const TABS = ["Thông tin cơ bản", "Đơn vị tính", "Biến thể", "Hình ảnh"] as const;
type Tab = (typeof TABS)[number];

export function ProductForm({
  initialData,
  categories,
  isEdit = false,
  onSave,
  loading = false,
}: ProductFormProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("Thông tin cơ bản");
  const [form, setForm] = useState<ProductFormData>({ ...DEFAULT_DATA, ...initialData });
  const [errors, setErrors] = useState<Partial<Record<keyof ProductFormData, string>>>({});
  const [saving, setSaving] = useState(false);

  function set<K extends keyof ProductFormData>(key: K, value: ProductFormData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function validate(): boolean {
    const errs: typeof errors = {};
    if (!form.name.trim()) errs.name = "Tên sản phẩm không được để trống";
    if (!form.sku.trim()) errs.sku = "SKU không được để trống";
    if (!form.unit.trim()) errs.unit = "Đơn vị tính không được để trống";
    if (form.sellingPrice < 0) errs.sellingPrice = "Giá bán phải >= 0";
    if (form.costPrice < 0) errs.costPrice = "Giá vốn phải >= 0";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  }

  function addUnit() {
    set("units", [
      ...form.units,
      {
        unitName: "",
        conversionRate: 1,
        barcode: "",
        sellingPrice: null,
        costPrice: null,
        isBase: false,
      },
    ]);
  }

  function removeUnit(i: number) {
    set(
      "units",
      form.units.filter((_, idx) => idx !== i),
    );
  }

  function updateUnit(i: number, key: keyof UnitRow, value: unknown) {
    set(
      "units",
      form.units.map((u, idx) => (idx === i ? { ...u, [key]: value } : u)),
    );
  }

  function addVariant() {
    set("variants", [
      ...form.variants,
      {
        sku: `${form.sku}-V${form.variants.length + 1}`,
        barcode: "",
        sellingPrice: form.sellingPrice,
        costPrice: form.costPrice,
        attributes: [],
      },
    ]);
  }

  function removeVariant(i: number) {
    set(
      "variants",
      form.variants.filter((_, idx) => idx !== i),
    );
  }

  function updateVariant(i: number, key: keyof VariantRow, value: unknown) {
    set(
      "variants",
      form.variants.map((v, idx) => (idx === i ? { ...v, [key]: value } : v)),
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-5 py-3 text-sm font-medium transition-colors",
              tab === t
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-500 hover:text-gray-700",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="p-6">
        {/* ── Tab: Thông tin cơ bản ── */}
        {tab === "Thông tin cơ bản" && (
          <div className="grid grid-cols-2 gap-6">
            {/* Left column */}
            <div className="flex flex-col gap-4">
              <Field label="Tên sản phẩm" required error={errors.name}>
                <input
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Nhập tên sản phẩm"
                  className={inputCls(!!errors.name)}
                />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Mã SKU" required error={errors.sku}>
                  <input
                    value={form.sku}
                    onChange={(e) => set("sku", e.target.value)}
                    placeholder="VD: SP-001"
                    className={inputCls(!!errors.sku)}
                  />
                </Field>
                <Field label="Mã vạch">
                  <input
                    value={form.barcode}
                    onChange={(e) => set("barcode", e.target.value)}
                    placeholder="Quét hoặc nhập thủ công"
                    className={inputCls(false)}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Danh mục">
                  <select
                    value={form.categoryId ?? ""}
                    onChange={(e) =>
                      set("categoryId", e.target.value ? Number(e.target.value) : null)
                    }
                    className={inputCls(false)}
                  >
                    <option value="">-- Chọn danh mục --</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Đơn vị tính" required error={errors.unit}>
                  <input
                    value={form.unit}
                    onChange={(e) => set("unit", e.target.value)}
                    placeholder="VD: cái, hộp, kg"
                    className={inputCls(!!errors.unit)}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Giá bán (đ)" error={errors.sellingPrice}>
                  <input
                    type="number"
                    min={0}
                    value={form.sellingPrice}
                    onChange={(e) => set("sellingPrice", Number(e.target.value))}
                    className={inputCls(!!errors.sellingPrice)}
                  />
                </Field>
                <Field label="Giá vốn (đ)" error={errors.costPrice}>
                  <input
                    type="number"
                    min={0}
                    value={form.costPrice}
                    onChange={(e) => set("costPrice", Number(e.target.value))}
                    className={inputCls(!!errors.costPrice)}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Thuế suất VAT (%)">
                  <select
                    value={form.taxRate}
                    onChange={(e) => set("taxRate", Number(e.target.value))}
                    className={inputCls(false)}
                  >
                    <option value={0}>Không chịu thuế (0%)</option>
                    <option value={5}>5%</option>
                    <option value={8}>8%</option>
                    <option value={10}>10%</option>
                  </select>
                </Field>
                <Field label="Trạng thái">
                  <select
                    value={form.status}
                    onChange={(e) => set("status", e.target.value as ProductFormData["status"])}
                    className={inputCls(false)}
                  >
                    <option value="active">Đang bán</option>
                    <option value="inactive">Ngừng bán</option>
                    <option value="discontinued">Hết hàng</option>
                  </select>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Tồn kho tối thiểu">
                  <input
                    type="number"
                    min={0}
                    value={form.minStock}
                    onChange={(e) => set("minStock", Number(e.target.value))}
                    className={inputCls(false)}
                  />
                </Field>
                <Field label="Tồn kho tối đa">
                  <input
                    type="number"
                    min={0}
                    value={form.maxStock ?? ""}
                    onChange={(e) =>
                      set("maxStock", e.target.value ? Number(e.target.value) : null)
                    }
                    placeholder="Không giới hạn"
                    className={inputCls(false)}
                  />
                </Field>
              </div>
            </div>

            {/* Right column */}
            <div className="flex flex-col gap-4">
              <Field label="Hình ảnh chính">
                <div className="flex h-36 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/40">
                  <div className="flex flex-col items-center gap-2 text-gray-400">
                    <Upload className="h-8 w-8" />
                    <span className="text-xs">Tải lên hoặc kéo thả</span>
                    <span className="text-xs">JPG, PNG, WEBP</span>
                  </div>
                </div>
              </Field>

              <Field label="Mô tả">
                <textarea
                  rows={6}
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="Nhập mô tả sản phẩm..."
                  className={cn(inputCls(false), "resize-none")}
                />
              </Field>
            </div>
          </div>
        )}

        {/* ── Tab: Đơn vị tính ── */}
        {tab === "Đơn vị tính" && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm text-gray-500">Đa đơn vị tính: thùng → 12 cái, bình → 3 hộp…</p>
              <button
                onClick={addUnit}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" /> Thêm đơn vị
              </button>
            </div>
            {form.units.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 py-10 text-center text-sm text-gray-400">
                Chưa có đơn vị tính nào. Nhấn &ldquo;Thêm đơn vị&rdquo; để bắt đầu.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {form.units.map((unit, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-6 items-center gap-3 rounded-lg border border-gray-200 p-3"
                  >
                    <div className="col-span-2">
                      <label className="mb-1 block text-xs text-gray-500">Tên đơn vị</label>
                      <input
                        value={unit.unitName}
                        onChange={(e) => updateUnit(i, "unitName", e.target.value)}
                        placeholder="VD: Thùng"
                        className={inputCls(false)}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-500">Tỷ lệ</label>
                      <input
                        type="number"
                        min={1}
                        value={unit.conversionRate}
                        onChange={(e) => updateUnit(i, "conversionRate", Number(e.target.value))}
                        className={inputCls(false)}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-500">Mã vạch</label>
                      <input
                        value={unit.barcode}
                        onChange={(e) => updateUnit(i, "barcode", e.target.value)}
                        className={inputCls(false)}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-500">Giá bán</label>
                      <input
                        type="number"
                        min={0}
                        value={unit.sellingPrice ?? ""}
                        onChange={(e) =>
                          updateUnit(
                            i,
                            "sellingPrice",
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                        className={inputCls(false)}
                      />
                    </div>
                    <div className="flex items-end justify-end pb-1">
                      <button
                        onClick={() => removeUnit(i)}
                        className="rounded p-1.5 text-red-500 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Biến thể ── */}
        {tab === "Biến thể" && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm text-gray-500">Biến thể sản phẩm theo màu sắc, kích cỡ, v.v.</p>
              <button
                onClick={addVariant}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" /> Thêm biến thể
              </button>
            </div>
            {form.variants.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 py-10 text-center text-sm text-gray-400">
                Chưa có biến thể. Nhấn &ldquo;Thêm biến thể&rdquo; để bắt đầu.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {form.variants.map((v, i) => (
                  <div key={i} className="rounded-lg border border-gray-200 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">Biến thể #{i + 1}</span>
                      <button
                        onClick={() => removeVariant(i)}
                        className="rounded p-1.5 text-red-500 hover:bg-red-50"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <label className="mb-1 block text-xs text-gray-500">SKU *</label>
                        <input
                          value={v.sku}
                          onChange={(e) => updateVariant(i, "sku", e.target.value)}
                          className={inputCls(false)}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-gray-500">Mã vạch</label>
                        <input
                          value={v.barcode}
                          onChange={(e) => updateVariant(i, "barcode", e.target.value)}
                          className={inputCls(false)}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-gray-500">Giá bán</label>
                        <input
                          type="number"
                          min={0}
                          value={v.sellingPrice}
                          onChange={(e) => updateVariant(i, "sellingPrice", Number(e.target.value))}
                          className={inputCls(false)}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-gray-500">Giá vốn</label>
                        <input
                          type="number"
                          min={0}
                          value={v.costPrice}
                          onChange={(e) => updateVariant(i, "costPrice", Number(e.target.value))}
                          className={inputCls(false)}
                        />
                      </div>
                    </div>
                    {/* Attributes */}
                    <div className="mt-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs text-gray-500">Thuộc tính</span>
                        <button
                          onClick={() =>
                            updateVariant(i, "attributes", [
                              ...v.attributes,
                              { attributeName: "", attributeValue: "" },
                            ])
                          }
                          className="text-xs text-blue-600 hover:underline"
                        >
                          + Thêm
                        </button>
                      </div>
                      {v.attributes.map((attr, ai) => (
                        <div key={ai} className="mb-2 flex gap-2">
                          <input
                            value={attr.attributeName}
                            onChange={(e) => {
                              const attrs = [...v.attributes];
                              attrs[ai] = { ...attrs[ai], attributeName: e.target.value };
                              updateVariant(i, "attributes", attrs);
                            }}
                            placeholder="Màu sắc"
                            className={cn(inputCls(false), "flex-1")}
                          />
                          <input
                            value={attr.attributeValue}
                            onChange={(e) => {
                              const attrs = [...v.attributes];
                              attrs[ai] = { ...attrs[ai], attributeValue: e.target.value };
                              updateVariant(i, "attributes", attrs);
                            }}
                            placeholder="Đỏ"
                            className={cn(inputCls(false), "flex-1")}
                          />
                          <button
                            onClick={() =>
                              updateVariant(
                                i,
                                "attributes",
                                v.attributes.filter((_, xi) => xi !== ai),
                              )
                            }
                            className="rounded p-1.5 text-gray-400 hover:text-red-500"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Hình ảnh ── */}
        {tab === "Hình ảnh" && (
          <div>
            <div className="mb-4 flex h-48 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/40">
              <div className="flex flex-col items-center gap-3 text-gray-400">
                <Upload className="h-10 w-10" />
                <div className="text-center">
                  <p className="font-medium text-gray-600">Kéo thả ảnh vào đây</p>
                  <p className="text-sm">hoặc nhấn để chọn ảnh (JPG, PNG, WEBP, tối đa 5MB)</p>
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-400">
              Có thể tải lên nhiều ảnh. Ảnh đầu tiên sẽ là ảnh đại diện.
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
        <button
          onClick={() => router.back()}
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Huỷ bỏ
        </button>
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {(saving || loading) && <Loader2 className="h-4 w-4 animate-spin" />}
          {isEdit ? "Lưu thay đổi" : "Lưu sản phẩm"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

function inputCls(hasError: boolean) {
  return cn(
    "w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors",
    "focus:ring-2 focus:ring-blue-100",
    hasError ? "border-red-400 focus:border-red-500" : "border-gray-200 focus:border-blue-400",
  );
}
