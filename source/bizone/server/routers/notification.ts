import { z } from "zod";
import { router, permissionProcedure, staffSelfProcedure } from "@/server/trpc";
import {
  createTemplateSchema,
  listDeliveriesSchema,
  listNotificationsSchema,
  notificationIdsSchema,
  preferencesSchema,
  pushSubscribeSchema,
  sendTestSchema,
  updateSettingSchema,
  updateTemplateSchema,
} from "@/lib/validators/notification";
import { COMMON_VARIABLES, NOTIFICATION_EVENTS } from "@/lib/notifications/events";
import * as notifications from "@/server/services/notification.service";
import * as templates from "@/server/services/notificationTemplate.service";
import { listDeliveries } from "@/server/services/notificationDelivery.service";
import { emailProvider } from "@/server/services/email.service";
import { smsProvider } from "@/server/services/sms.service";
import { resolveDbUserId } from "@/server/services/user.service";

/**
 * Notification center (API-Design §16) + notification settings / templates (§14).
 * Self endpoints: any active staff member, on the notifications they may see.
 */
const self = staffSelfProcedure.use(async ({ ctx, next }) =>
  next({ ctx: { ...ctx, viewer: await notifications.notificationViewer(ctx.user!) } }),
);
const cfgRead = permissionProcedure("config:read");
const cfgWrite = permissionProcedure("config:write");

export const notificationRouter = router({
  list: self
    .input(listNotificationsSchema)
    .query(({ ctx, input }) => notifications.listNotifications(ctx.viewer, input)),
  unreadCount: self.query(async ({ ctx }) => ({
    unread: await notifications.unreadCount(ctx.viewer),
  })),
  markRead: self
    .input(notificationIdsSchema)
    .mutation(({ ctx, input }) => notifications.markRead(ctx.viewer, input.ids)),
  markUnread: self
    .input(notificationIdsSchema)
    .mutation(({ ctx, input }) => notifications.markUnread(ctx.viewer, input.ids)),
  markAllRead: self.mutation(({ ctx }) => notifications.markAllRead(ctx.viewer)),

  preferences: self.query(({ ctx }) => notifications.getPreferences(ctx.user!, ctx.viewer)),
  setPreferences: self
    .input(preferencesSchema)
    .mutation(({ ctx, input }) => notifications.setPreferences(ctx.viewer, input)),

  pushConfig: self.query(async ({ ctx }) => ({
    ...notifications.pushConfig(),
    devices: await notifications.mySubscriptions(ctx.viewer),
  })),
  pushSubscribe: self
    .input(pushSubscribeSchema)
    .mutation(({ ctx, input }) => notifications.subscribePush(ctx.user!, ctx.viewer, input)),
  pushUnsubscribe: self
    .input(z.object({ endpoint: z.string().min(10).max(1000) }))
    .mutation(({ ctx, input }) => notifications.unsubscribePush(ctx.viewer, input.endpoint)),

  // ─── Store configuration ───────────────────────────────────────────────────

  /** Event catalog + current settings + channel providers */
  settings: cfgRead.query(async () => ({
    events: NOTIFICATION_EVENTS,
    commonVariables: COMMON_VARIABLES,
    settings: await notifications.listSettings(),
    providers: {
      email: emailProvider(),
      sms: smsProvider(),
      push: notifications.pushConfig().publicKey ? "webpush" : "off",
    },
  })),
  updateSetting: cfgWrite
    .input(updateSettingSchema)
    .mutation(async ({ ctx, input }) =>
      notifications.updateSettings(input, await resolveDbUserId(ctx.user)),
    ),

  templates: cfgRead
    .input(z.object({ channel: z.enum(["email", "sms"]).optional() }).optional())
    .query(({ input }) => templates.listTemplates(input?.channel)),
  template: cfgRead
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ input }) => templates.getTemplate(input.id)),
  createTemplate: cfgWrite
    .input(createTemplateSchema)
    .mutation(({ input }) => templates.createTemplate(input)),
  updateTemplate: cfgWrite
    .input(updateTemplateSchema)
    .mutation(({ input }) => templates.updateTemplate(input)),
  deleteTemplate: cfgWrite
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input }) => templates.deleteTemplate(input.id)),
  previewTemplate: cfgRead
    .input(
      z.object({
        subject: z.string().max(500).nullable(),
        content: z.string().max(5000),
        vars: z.record(z.string(), z.string().max(500)).optional(),
      }),
    )
    .query(({ input }) => templates.previewTemplate(input)),
  sendTest: cfgWrite
    .input(sendTestSchema)
    .mutation(({ input }) => templates.sendTestTemplate(input)),

  deliveries: cfgRead.input(listDeliveriesSchema).query(({ input }) => listDeliveries(input)),
});
