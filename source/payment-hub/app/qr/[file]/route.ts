import type { NextRequest } from "next/server";
import { handleQrImage } from "@/server/routes/qr";

/** Public QR image (`image_url`), served from Redis only while the QR is valid. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ file: string }> },
): Promise<Response> {
  const { file } = await params;
  return handleQrImage(file);
}
