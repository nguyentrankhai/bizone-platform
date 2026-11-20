import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BlockedUrlError,
  isPrivateAddress,
  safeFetch,
  TooLargeError,
  trustedHosts,
} from "@/lib/security/ssrf";

// QA-5 #155 — product photo downloads must not reach the internal network

describe("isPrivateAddress", () => {
  it("flags internal, link-local, CGNAT, multicast and v4-mapped addresses", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.20.0.5",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
      "::ffff:10.0.0.1",
    ])
      expect(isPrivateAddress(ip), ip).toBe(true);
  });

  it("lets public addresses through", () => {
    for (const ip of ["8.8.8.8", "203.162.4.191", "172.32.0.1", "2001:4860:4860::8888"])
      expect(isPrivateAddress(ip), ip).toBe(false);
  });
});

describe("trustedHosts", () => {
  it("trusts BizOne itself, MinIO and the configured extra hosts", () => {
    const t = trustedHosts({
      APP_URL: "https://app.bizone.vn",
      MINIO_ENDPOINT: "minio.internal",
      MINIO_PORT: "9000",
      OUTBOUND_TRUSTED_HOSTS: "cdn.local:8080, img.internal",
    } as unknown as NodeJS.ProcessEnv);
    expect([...t].sort()).toEqual([
      "app.bizone.vn",
      "cdn.local:8080",
      "img.internal",
      "minio.internal:9000",
    ]);
  });
});

describe("safeFetch", () => {
  let server: http.Server;
  let port = 0;
  const big = Buffer.alloc(64 * 1024, 1);
  const saved = { app: process.env.APP_URL, extra: process.env.OUTBOUND_TRUSTED_HOSTS };

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === "/img.png") {
        res.writeHead(200, { "content-type": "image/png" });
        return res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      }
      if (req.url === "/big-declared") {
        res.writeHead(200, { "content-type": "image/png", "content-length": String(big.length) });
        return res.end(big);
      }
      if (req.url === "/big-chunked") {
        res.writeHead(200, { "content-type": "image/png" });
        for (let i = 0; i < 4; i++) res.write(big);
        return res.end();
      }
      if (req.url === "/to-private") {
        res.writeHead(302, { location: `http://127.0.0.2:${port}/img.png` });
        return res.end();
      }
      if (req.url === "/loop") {
        res.writeHead(302, { location: "/loop" });
        return res.end();
      }
      res.writeHead(404).end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as AddressInfo).port;
    process.env.APP_URL = "http://app.example.test";
    process.env.OUTBOUND_TRUSTED_HOSTS = "";
  });

  afterAll(async () => {
    process.env.APP_URL = saved.app;
    process.env.OUTBOUND_TRUSTED_HOSTS = saved.extra;
    await new Promise((r) => server.close(r));
  });

  const opts = { maxBytes: 100 * 1024, timeoutMs: 5000 };

  it("refuses private IP literals and names resolving to private addresses", async () => {
    await expect(safeFetch(`http://127.0.0.1:${port}/img.png`, opts)).rejects.toBeInstanceOf(
      BlockedUrlError,
    );
    await expect(safeFetch(`http://localhost:${port}/img.png`, opts)).rejects.toBeInstanceOf(
      BlockedUrlError,
    );
    await expect(
      safeFetch("http://169.254.169.254/latest/meta-data/", opts),
    ).rejects.toBeInstanceOf(BlockedUrlError);
  });

  it("refuses non-http schemes", async () => {
    await expect(safeFetch("file:///etc/passwd", opts)).rejects.toBeInstanceOf(BlockedUrlError);
  });

  describe("on a trusted host", () => {
    beforeAll(() => {
      process.env.OUTBOUND_TRUSTED_HOSTS = `127.0.0.1:${port}`;
    });

    it("downloads", async () => {
      const r = await safeFetch(`http://127.0.0.1:${port}/img.png`, opts);
      expect(r.status).toBe(200);
      expect(r.contentType).toBe("image/png");
      expect(r.data.length).toBe(4);
    });

    it("cuts the body at maxBytes (declared or streamed)", async () => {
      await expect(
        safeFetch(`http://127.0.0.1:${port}/big-declared`, { ...opts, maxBytes: 1024 }),
      ).rejects.toBeInstanceOf(TooLargeError);
      await expect(safeFetch(`http://127.0.0.1:${port}/big-chunked`, opts)).rejects.toBeInstanceOf(
        TooLargeError,
      );
    });

    it("checks every redirect again", async () => {
      await expect(safeFetch(`http://127.0.0.1:${port}/to-private`, opts)).rejects.toBeInstanceOf(
        BlockedUrlError,
      );
      await expect(safeFetch(`http://127.0.0.1:${port}/loop`, opts)).rejects.toBeInstanceOf(
        BlockedUrlError,
      );
    });
  });
});
