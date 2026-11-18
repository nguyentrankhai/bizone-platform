import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import manifest from "@/app/manifest";
import {
  decodeSnapshot,
  encodeSnapshot,
  snapshotKey,
  SNAPSHOT_MAX_AGE_MS,
} from "@/lib/pwa/snapshot";
import { installMode, installSnoozed, isIos, INSTALL_SNOOZE_MS } from "@/lib/pwa/install";
import { periodRange, vnKey } from "@/lib/pwa/periods";
import { mobileLink } from "@/lib/pwa/links";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";

describe("P6.4 offline snapshot", () => {
  it("keys by tenant + branch so scopes never mix", () => {
    expect(snapshotKey("tenant_demo", "2", "dashboard")).toBe("bizone:pwa:tenant_demo:2:dashboard");
    expect(snapshotKey("tenant_demo", null, "dashboard")).toBe(
      "bizone:pwa:tenant_demo:default:dashboard",
    );
    expect(snapshotKey("a", "all", "x")).not.toBe(snapshotKey("b", "all", "x"));
  });

  it("round-trips dates (tRPC superjson shapes)", () => {
    const now = Date.UTC(2026, 10, 18, 3);
    const raw = encodeSnapshot({ createdAt: new Date(now), total: "125000.00", n: 3 }, now);
    const snap = decodeSnapshot<{ createdAt: Date; total: string; n: number }>(raw, now + 1000);
    expect(snap?.savedAt).toBe(now);
    expect(snap?.data.createdAt).toBeInstanceOf(Date);
    expect(snap?.data.createdAt.getTime()).toBe(now);
    expect(snap?.data.total).toBe("125000.00");
  });

  it("drops expired, empty and corrupt snapshots", () => {
    const now = Date.now();
    const raw = encodeSnapshot({ a: 1 }, now - SNAPSHOT_MAX_AGE_MS - 1);
    expect(decodeSnapshot(raw, now)).toBeNull();
    expect(decodeSnapshot(null, now)).toBeNull();
    expect(decodeSnapshot("{not json", now)).toBeNull();
    expect(decodeSnapshot('{"json":{"data":1}}', now)).toBeNull(); // no savedAt
  });
});

describe("P6.4 install prompt", () => {
  it("detects iPhone and iPadOS (desktop UA + touch)", () => {
    expect(isIos(IPHONE)).toBe(true);
    expect(isIos(IPAD_DESKTOP_UA, 5)).toBe(true);
    expect(isIos(IPAD_DESKTOP_UA, 0)).toBe(false); // a real Mac
    expect(isIos(ANDROID)).toBe(false);
  });

  it("picks the install mode", () => {
    const base = { standalone: false, hasPrompt: false, userAgent: ANDROID };
    expect(installMode({ ...base, standalone: true, hasPrompt: true })).toBe("installed");
    expect(installMode({ ...base, hasPrompt: true })).toBe("prompt");
    expect(installMode({ ...base, userAgent: IPHONE })).toBe("ios");
    expect(installMode(base)).toBe("unavailable");
  });

  it("snoozes the banner for 7 days", () => {
    const now = Date.now();
    expect(installSnoozed(null, now)).toBe(false);
    expect(installSnoozed(now - 1000, now)).toBe(true);
    expect(installSnoozed(now - INSTALL_SNOOZE_MS - 1, now)).toBe(false);
  });
});

describe("P6.4 report periods (VN dates)", () => {
  // 2026-11-18 17:30 UTC = 2026-11-19 00:30 in Vietnam
  const lateUtc = new Date("2026-11-18T17:30:00Z");

  it("uses the Vietnamese calendar day", () => {
    expect(vnKey(lateUtc)).toBe("2026-11-19");
    expect(periodRange("today", lateUtc)).toEqual({ from: "2026-11-19", to: "2026-11-19" });
  });

  it("builds inclusive ranges", () => {
    const now = new Date("2026-11-18T03:00:00Z");
    expect(periodRange("7d", now)).toEqual({ from: "2026-11-12", to: "2026-11-18" });
    expect(periodRange("30d", now)).toEqual({ from: "2026-10-20", to: "2026-11-18" });
    expect(periodRange("month", now)).toEqual({ from: "2026-11-01", to: "2026-11-18" });
    expect(periodRange("month", new Date("2027-01-01T01:00:00Z"))).toEqual({
      from: "2027-01-01",
      to: "2027-01-01",
    });
  });
});

describe("P6.4 notification links → mobile screens", () => {
  const cases: [string, string][] = [
    ["/orders/42", "/mobile/orders/42"],
    ["/orders?status=pending", "/mobile/orders?status=pending"],
    ["/orders", "/mobile/orders"],
    ["/dashboard", "/mobile/dashboard"],
    ["/reports?tab=profit", "/mobile/reports"],
    ["/notifications", "/mobile/notifications"],
    ["/notifications/settings", "/notifications/settings"],
    ["/warehouse", "/warehouse"],
    ["/orders/42/edit", "/orders/42/edit"],
  ];

  it.each(cases)("%s → %s", (from, to) => {
    expect(mobileLink(from)).toBe(to);
  });

  it("the service worker copy follows the same rules", () => {
    const src = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
    const fn = src.match(/function mobileLink\(link\) \{[\s\S]*?\n\}/)?.[0];
    expect(fn).toBeTruthy();
    const swMobileLink = new Function(`${fn}; return mobileLink;`)() as (l: string) => string;
    for (const [from, to] of cases) expect(swMobileLink(from)).toBe(to);
  });
});

describe("P6.4 web app manifest", () => {
  const m = manifest();

  it("is installable: name, standalone, start_url in scope, theme", () => {
    expect(m.name).toBeTruthy();
    expect(m.short_name).toBe("BizOne");
    expect(m.display).toBe("standalone");
    expect(m.start_url?.startsWith("/mobile/")).toBe(true);
    expect(m.scope).toBe("/");
    expect(m.theme_color).toBe("#2563EB");
  });

  it("ships 192 / 512 and a maskable icon that exist with the declared size", async () => {
    const icons = m.icons ?? [];
    expect(icons.some((i) => i.sizes === "192x192")).toBe(true);
    expect(icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable")).toBe(true);
    for (const icon of icons) {
      const file = new URL(`../public${icon.src}`, import.meta.url).pathname;
      const meta = await sharp(file).metadata();
      expect(`${meta.width}x${meta.height}`).toBe(icon.sizes);
    }
  });

  it("the service worker precaches only files that exist", () => {
    const src = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
    for (const f of ["/offline.html", "/icons/icon-192.png", "/icons/badge-96.png"]) {
      expect(src).toContain(`"${f}"`);
      expect(() => readFileSync(new URL(`../public${f}`, import.meta.url))).not.toThrow();
    }
  });
});
