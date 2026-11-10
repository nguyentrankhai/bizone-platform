import { connection, type NextRequest } from "next/server";
import { handleMomoRedirect } from "@/server/routes/momo-redirect";
import { renderPayPage } from "@/server/routes/pay-page";

export async function GET(req: NextRequest): Promise<Response> {
  await connection();
  try {
    return await handleMomoRedirect(req);
  } catch (e) {
    console.error("[momo-return] error:", e instanceof Error ? e.message : e);
    return renderPayPage(
      { title: "Có lỗi xảy ra", message: "Vui lòng thử lại sau.", tone: "error" },
      500,
    );
  }
}
