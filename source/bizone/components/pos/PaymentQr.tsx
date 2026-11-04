"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { cn } from "@/lib/utils";

/** Renders a QR payload (VietQR) as an image */
export function PaymentQr({
  payload,
  size = 220,
  className,
}: {
  payload: string;
  size?: number;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(payload, { width: size, margin: 1, errorCorrectionLevel: "M" })
      .then((url) => !cancelled && setSrc(url))
      .catch(() => !cancelled && setSrc(null));
    return () => {
      cancelled = true;
    };
  }, [payload, size]);

  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- data URL, nothing to optimize
    <img
      src={src}
      width={size}
      height={size}
      alt="Mã QR thanh toán"
      className={cn("rounded-lg bg-white", className)}
    />
  ) : (
    <div
      style={{ width: size, height: size }}
      className={cn("animate-pulse rounded-lg bg-gray-100", className)}
    />
  );
}
