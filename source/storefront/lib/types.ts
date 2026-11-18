/** Shapes returned by BizOne's store API (P6.1) */

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages?: number;
}

export interface StoreInfo {
  name: string;
  slug: string;
  hotline: string;
  address: string;
  shippingFee: number;
  freeShippingFrom: number | null;
  paymentMethods: { code: "cod" | "payhub"; label: string }[];
  paymentMinutes: number;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  parentId: number | null;
  productCount: number;
}

export interface ProductCard {
  id: number;
  slug: string;
  name: string;
  sku: string;
  unit: string;
  image: string | null;
  category: { name: string; slug: string } | null;
  price: number;
  maxPrice: number;
  salePrice: number | null;
  saleLabel: string | null;
  hasVariants: boolean;
  /** null = not tracked (always available) */
  stock: number | null;
}

export type ProductList = Paged<ProductCard> & { totalPages: number };

export interface ProductVariant {
  id: number;
  sku: string;
  name: string;
  attributes: { name: string; value: string }[];
  price: number;
  salePrice: number | null;
  image: string | null;
  stock: number | null;
}

export interface ProductDetail {
  id: number;
  slug: string;
  name: string;
  sku: string;
  description: string | null;
  unit: string;
  images: string[];
  category: { name: string; slug: string } | null;
  price: number;
  salePrice: number | null;
  saleLabel: string | null;
  stock: number | null;
  variants: ProductVariant[];
}

export interface QuoteLine {
  productId: number;
  variantId: number | null;
  slug: string;
  name: string;
  sku: string;
  unit: string;
  unitPrice: number;
  quantity: number;
  discountAmount: number;
  totalAmount: number;
  gift: boolean;
  promotions: string[];
  stock: number | null;
}

export interface Quote {
  lines: QuoteLine[];
  subtotal: number;
  lineDiscount: number;
  promotions: { label: string; discount: number }[];
  memberDiscountPercent: number;
  memberDiscount: number;
  coupon: { code: string; name: string; discount: number } | null;
  couponError: string | null;
  goodsTotal: number;
  shippingFee: number;
  shippingDiscount: number;
  total: number;
  freeShippingFrom: number | null;
  stockProblems: string[];
}

export interface CustomerProfile {
  id: number;
  code: string;
  fullName: string;
  phone: string;
  email: string | null;
  ranking: "silver" | "gold" | "vip" | "diamond";
  memberDiscountPercent: number;
  pointMultiplier: number;
  totalPoints: number;
  totalSpent: number;
  addresses: { id: number; address: string; isDefault: boolean }[];
}

export interface PointEntry {
  id: number;
  points: number;
  type: string;
  notes: string | null;
  createdAt: string;
}

export interface OrderSummary {
  code: string;
  status: string;
  statusLabel: string;
  totalAmount: number;
  paymentMethod: string | null;
  paymentStatus: string;
  itemCount: number;
  createdAt: string;
}

export interface OrderDetail {
  code: string;
  status: string;
  statusLabel: string;
  createdAt: string;
  contact: { name: string | null; phone: string | null; address: string | null };
  note: string | null;
  items: {
    productId: number;
    slug: string;
    name: string;
    variant: string | null;
    image: string | null;
    unit: string;
    quantity: number;
    unitPrice: number;
    discountAmount: number;
    totalAmount: number;
  }[];
  subtotal: number;
  shippingFee: number;
  discountAmount: number;
  totalAmount: number;
  paymentMethod: string | null;
  paymentStatus: string;
  paymentDueAt: string | null;
  payment: {
    status: string;
    txnCode: string | null;
    paymentUrl: string | null;
    paidAt: string | null;
  } | null;
  shippingProvider: string | null;
  trackingCode: string | null;
  canCancel: boolean;
  canPay: boolean;
  tracking: { status: string; label: string; note: string | null; at: string }[];
}

export interface CreatedOrder {
  order: OrderDetail;
  payment: { paymentUrl: string; txnCode: string | null } | null;
  paymentError: string | null;
}

export const RANKING_LABEL: Record<CustomerProfile["ranking"], string> = {
  silver: "Bạc",
  gold: "Vàng",
  vip: "VIP",
  diamond: "Kim cương",
};
