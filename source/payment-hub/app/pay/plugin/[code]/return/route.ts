import { connection, type NextRequest } from "next/server";
import { handlePluginReturn } from "@/server/routes/plugin-ipn";
import { renderPayPage } from "@/server/routes/pay-page";

/** Customer's browser back from a connector plugin's PSP (P7.1) — verified, never applied. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  await connection();
  const { code } = await params;
  try {
    return await handlePluginReturn(req, code);
  } catch (e) {
    console.error(`[plugin-return:${code}] error:`, e instanceof Error ? e.message : e);
    return renderPayPage(
      { title: "Có lỗi xảy ra", message: "Vui lòng thử lại sau.", tone: "error" },
      500,
    );
  }
}
