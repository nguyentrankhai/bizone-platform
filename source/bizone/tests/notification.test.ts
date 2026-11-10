import { describe, expect, it } from "vitest";
import {
  emailHtml,
  normalizePhone,
  renderTemplate,
  smsText,
  splitList,
  templateVariables,
  VN_PHONE,
} from "@/lib/notifications/template";
import {
  AUDIENCES,
  eventOptions,
  isVisibleTo,
  parseNotifyChannel,
  notifyChannel,
  type NotificationViewer,
} from "@/lib/notifications/events";
import { scheduledPeriod } from "@/lib/notifications/schedule";
import {
  createTemplateSchema,
  updateSettingSchema,
  campaignAudienceSchema,
  emailListSchema,
} from "@/lib/validators/notification";
import { mergeSettings } from "@/server/services/notification.service";

describe("templates", () => {
  it("renders variables, unknown → empty", () => {
    expect(
      renderTemplate("Đơn {{ order_code }} - {{total}} {{x}}", { order_code: "DH1", total: 5 }),
    ).toBe("Đơn DH1 - 5 ");
    expect(templateVariables("{{a}} {{b}} {{a}}")).toEqual(["a", "b"]);
  });

  it("email html escapes content and links URLs", () => {
    const html = emailHtml('<b>x</b> "q"\nhttp://localhost:3000/orders/1', "Shop & Co");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt; &quot;q&quot;<br>");
    expect(html).toContain('<a href="http://localhost:3000/orders/1"');
    expect(html).toContain("Shop &amp; Co");
  });

  it("sms text is one line and unaccented unless unicode", () => {
    expect(smsText("Đơn mới\n  đã giao", false)).toBe("Don moi da giao");
    expect(smsText("Đơn mới\nđã giao", true)).toBe("Đơn mới đã giao");
    expect(smsText("Tổng – 75.000₫ “ok” ★", false)).toBe('Tong - 75.000d "ok"');
  });

  it("VN phone numbers", () => {
    expect(normalizePhone("+84 901 234 567")).toBe("0901234567");
    expect(normalizePhone("84901234567")).toBe("0901234567");
    expect(VN_PHONE.test("0901234567")).toBe(true);
    expect(VN_PHONE.test("0201234567")).toBe(false);
    expect(VN_PHONE.test("090123456")).toBe(false);
    expect(splitList("a@x.vn, b@x.vn;a@x.vn\n")).toEqual(["a@x.vn", "b@x.vn"]);
  });
});

describe("visibility", () => {
  const viewer: NotificationViewer = {
    userId: 7,
    audiences: ["order:read", "inventory:read"],
    branchIds: [1],
    mutedInApp: ["low_stock"],
  };
  const n = { type: "order_new", audience: "order:read", userId: null, branchId: 1 };

  it("audience + branch", () => {
    expect(isVisibleTo(n, viewer)).toBe(true);
    expect(isVisibleTo({ ...n, branchId: 2 }, viewer)).toBe(false);
    expect(isVisibleTo({ ...n, branchId: null }, viewer)).toBe(true);
    expect(isVisibleTo({ ...n, branchId: 2 }, { ...viewer, branchIds: null })).toBe(true);
    expect(isVisibleTo({ ...n, audience: "crm:manage_debt" }, viewer)).toBe(false);
  });

  it("personal notifications only for their user; muted types hidden", () => {
    expect(isVisibleTo({ ...n, type: "shift_reminder", audience: null, userId: 7 }, viewer)).toBe(
      true,
    );
    expect(isVisibleTo({ ...n, type: "shift_reminder", audience: null, userId: 8 }, viewer)).toBe(
      false,
    );
    expect(isVisibleTo({ ...n, type: "low_stock", audience: "inventory:read" }, viewer)).toBe(
      false,
    );
  });

  it("audience list and channel names", () => {
    expect(AUDIENCES).toContain("order:read");
    expect(AUDIENCES).not.toContain(null);
    expect(parseNotifyChannel(notifyChannel("tenant_demo"))).toBe("tenant_demo");
    expect(parseNotifyChannel("bizone:pos:tenant_demo:1")).toBeNull();
  });
});

describe("settings", () => {
  it("defaults when the store has no row", () => {
    const s = mergeSettings("order_new", null);
    expect(s).toMatchObject({
      inApp: true,
      email: false,
      push: true,
      emailTemplate: "order_new_email",
    });
    expect(s.customized).toBe(false);
  });

  it("options are clamped / defaulted", () => {
    expect(eventOptions("shift_reminder", { minutesBefore: 1000 })).toEqual({ minutesBefore: 240 });
    expect(eventOptions("report_scheduled", { frequency: "hourly", format: "pdf" })).toEqual({
      frequency: "weekly",
      reportType: "revenue",
      format: "pdf",
    });
  });

  it("validators", () => {
    const ok = updateSettingSchema.safeParse({
      eventType: "order_new",
      inApp: true,
      email: true,
      sms: true,
      push: false,
      emailTo: [" QuanLy@Shop.vn "],
      smsTo: ["+84901234567"],
      emailTemplate: "order_new_email",
      smsTemplate: "order_new_sms",
    });
    expect(ok.success && ok.data.emailTo[0]).toBe("quanly@shop.vn");
    expect(ok.success && ok.data.smsTo[0]).toBe("0901234567");
    expect(updateSettingSchema.safeParse({ ...ok.data, eventType: "nope" }).success).toBe(false);
    expect(updateSettingSchema.safeParse({ ...ok.data, smsTo: ["123"] }).success).toBe(false);
    expect(
      createTemplateSchema.safeParse({
        templateCode: "x_mail",
        templateName: "X",
        channel: "email",
        content: "hi",
      }).success,
    ).toBe(false); // email needs a subject
    expect(
      createTemplateSchema.safeParse({
        templateCode: "Bad Code",
        templateName: "X",
        channel: "sms",
        content: "hi",
      }).success,
    ).toBe(false);
    expect(
      emailListSchema.safeParse(["a@x.vn", "b@x.vn", "c@x.vn", "d@x.vn", "e@x.vn", "f@x.vn"])
        .success,
    ).toBe(false);
    expect(campaignAudienceSchema.parse({})).toEqual({
      rankings: [],
      groupIds: [],
      minSpent: null,
      birthdayMonth: null,
    });
  });
});

describe("scheduled report period (VN time)", () => {
  it("daily = yesterday", () => {
    // 2026-11-10 08:00 VN
    expect(scheduledPeriod("daily", new Date("2026-11-10T01:00:00Z"))).toEqual({
      from: "2026-11-09",
      to: "2026-11-09",
    });
  });
  it("weekly only on Monday, previous Mon–Sun", () => {
    expect(scheduledPeriod("weekly", new Date("2026-11-10T01:00:00Z"))).toBeNull(); // Tuesday
    expect(scheduledPeriod("weekly", new Date("2026-11-09T00:30:00Z"))).toEqual({
      from: "2026-11-02",
      to: "2026-11-08",
    });
  });
  it("monthly only on the 1st, previous month", () => {
    expect(scheduledPeriod("monthly", new Date("2026-12-01T00:00:00Z"))).toEqual({
      from: "2026-11-01",
      to: "2026-11-30",
    });
    // 2026-11-30 23:30 UTC is already 2026-12-01 in VN
    expect(scheduledPeriod("monthly", new Date("2026-11-30T23:30:00Z"))?.to).toBe("2026-11-30");
    expect(scheduledPeriod("monthly", new Date("2026-11-10T01:00:00Z"))).toBeNull();
  });
});
