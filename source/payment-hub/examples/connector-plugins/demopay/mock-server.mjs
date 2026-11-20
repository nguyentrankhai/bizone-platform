// DemoPay mock PSP — lets a plugin developer (and the P7.1 e2e test) run the whole flow locally:
//   node examples/connector-plugins/demopay/mock-server.mjs   (PORT=4510, DEMOPAY_SECRET=demo-secret)
// Endpoints: see plugin/index.mjs. GET /pay/{order_id} shows a page with "Pay" / "Fail" buttons;
// POST /simulate/{order_id}?status=PAID|FAILED[&callback=0] does the same without a browser
// (tests; callback=0 = "lost IPN", the Hub must find the result by querying).
// The callback is sent to the order's notify_url, then the browser goes back to return_url.

import { createHmac, randomUUID } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 4510);
const SECRET = process.env.DEMOPAY_SECRET ?? "demo-secret";
const orders = new Map();
const sign = (...parts) => createHmac("sha256", SECRET).update(parts.join("|")).digest("hex");

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "content-type": type });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
}

async function readJson(req) {
  let text = "";
  for await (const chunk of req) text += chunk;
  return text ? JSON.parse(text) : {};
}

function signed(o) {
  const out = {
    order_id: o.order_id,
    txn_id: o.txn_id ?? "",
    amount: String(o.amount),
    status: o.status,
    paid_at: o.paid_at ?? "",
  };
  return { ...out, signature: sign(out.order_id, out.txn_id, out.amount, out.status) };
}

async function complete(o, status, notify = true) {
  o.status = status;
  o.txn_id = `DP${Date.now()}`;
  if (status === "PAID") o.paid_at = new Date().toISOString();
  const payload = signed(o);
  let callback = null;
  if (notify && o.notify_url) {
    try {
      const r = await fetch(o.notify_url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      callback = { status: r.status, body: await r.text() };
    } catch (e) {
      callback = { error: String(e?.message ?? e) };
    }
  }
  console.log(`[demopay] ${o.order_id} → ${status}; callback ${JSON.stringify(callback)}`);
  return { payload, callback };
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { status: "ok" });

    if (req.method === "POST" && url.pathname === "/orders") {
      const b = await readJson(req);
      if (b.signature !== sign(b.merchant, b.order_id, b.amount)) {
        return send(res, 200, { code: "97", message: "invalid signature" });
      }
      if (!(b.amount >= 1000))
        return send(res, 200, { code: "21", message: "Số tiền tối thiểu 1.000₫" });
      orders.set(b.order_id, { ...b, status: "PENDING" });
      return send(res, 200, {
        code: "00",
        pay_url: `http://localhost:${PORT}/pay/${encodeURIComponent(b.order_id)}`,
        qr: `DEMOPAY|${b.order_id}|${b.amount}`,
      });
    }

    const status = url.pathname.match(/^\/orders\/([^/]+)$/);
    if (req.method === "GET" && status) {
      const id = decodeURIComponent(status[1]);
      const o = orders.get(id);
      if (!o) return send(res, 200, { code: "01", message: "order not found" });
      if (url.searchParams.get("signature") !== sign(url.searchParams.get("merchant"), id)) {
        return send(res, 200, { code: "97", message: "invalid signature" });
      }
      return send(res, 200, { code: "00", ...signed(o) });
    }

    if (req.method === "POST" && url.pathname === "/refunds") {
      const b = await readJson(req);
      if (b.signature !== sign(b.merchant, b.txn_id, b.amount)) {
        return send(res, 200, { code: "97", message: "invalid signature" });
      }
      const refundId = `RF${randomUUID().slice(0, 8)}`;
      return send(res, 200, {
        code: "00",
        refund_id: refundId,
        signature: sign(refundId, b.amount),
      });
    }

    const sim = url.pathname.match(/^\/simulate\/([^/]+)$/);
    if (req.method === "POST" && sim) {
      const o = orders.get(decodeURIComponent(sim[1]));
      if (!o) return send(res, 404, { error: "order not found" });
      const notify = url.searchParams.get("callback") !== "0";
      return send(res, 200, await complete(o, url.searchParams.get("status") ?? "PAID", notify));
    }

    const pay = url.pathname.match(/^\/pay\/([^/]+)(\/(paid|failed))?$/);
    if (pay) {
      const o = orders.get(decodeURIComponent(pay[1]));
      if (!o) return send(res, 404, "Không tìm thấy đơn", "text/plain; charset=utf-8");
      if (pay[3]) {
        const { payload } = await complete(o, pay[3] === "paid" ? "PAID" : "FAILED");
        const back = new URL(o.return_url);
        for (const [k, v] of Object.entries(payload)) back.searchParams.set(k, v);
        res.writeHead(302, { location: back.toString() });
        return res.end();
      }
      return send(
        res,
        200,
        `<!doctype html><meta charset="utf-8"><title>DemoPay</title>
<body style="font-family:sans-serif;max-width:420px;margin:40px auto">
<h1>DemoPay</h1><p>Đơn ${o.order_id} — ${Number(o.amount).toLocaleString("vi-VN")} ₫</p>
<p><a href="/pay/${encodeURIComponent(o.order_id)}/paid">Thanh toán</a> ·
<a href="/pay/${encodeURIComponent(o.order_id)}/failed">Huỷ / thất bại</a></p></body>`,
        "text/html; charset=utf-8",
      );
    }
    send(res, 404, { error: "not found" });
  } catch (e) {
    send(res, 500, { error: String(e?.message ?? e) });
  }
}).listen(PORT, () => console.log(`[demopay] mock PSP on http://localhost:${PORT}`));
