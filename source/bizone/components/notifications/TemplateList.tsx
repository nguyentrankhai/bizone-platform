"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";
import {
  apiContext,
  errorMessage,
  type ApiAuth,
  type RouterOutputs,
} from "@/components/inventory/shared";
import { ErrorBox, btnPrimary, useLoad } from "@/components/staff/shared";
import { cn } from "@/lib/utils";
import { CHANNEL_LABEL, NotificationHeader } from "./shared";
import { TemplateForm } from "./TemplateForm";

type Template = RouterOutputs["notification"]["templates"][number];

/** Notification templates CRUD (API-Design §14 notification-templates) */
export function TemplateList({ auth }: { auth: ApiAuth }) {
  const toast = useToast();
  const list = useLoad("templates", () =>
    trpc.notification.templates.query(undefined, apiContext(auth)),
  );
  const [editing, setEditing] = useState<Template | null | undefined>(undefined);

  async function remove(t: Template) {
    if (!confirm(`Xoá mẫu "${t.templateName}"?`)) return;
    try {
      await trpc.notification.deleteTemplate.mutate({ id: t.id }, apiContext(auth));
      toast.success("Đã xoá mẫu");
      list.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <div className="space-y-5">
      <NotificationHeader subtitle="Mẫu nội dung email / SMS với biến {{tên_biến}} — dùng cho thông báo và nhắc nợ, nhắc đơn" />
      <div className="flex justify-end">
        <button className={btnPrimary} onClick={() => setEditing(null)}>
          <Plus className="h-4 w-4" /> Thêm mẫu
        </button>
      </div>
      <ErrorBox message={list.error} />
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3">Mẫu</th>
              <th className="px-4 py-3">Kênh</th>
              <th className="px-4 py-3">Nội dung</th>
              <th className="px-4 py-3">Đang dùng cho</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((t) => (
              <tr key={t.id} className="border-t border-slate-100 align-top">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-800">{t.templateName}</p>
                  <p className="font-mono text-xs text-slate-400">{t.templateCode}</p>
                  {!t.isActive && (
                    <span className="mt-1 inline-block rounded bg-slate-100 px-1.5 text-xs text-slate-500">
                      Đang tắt
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "rounded px-2 py-0.5 text-xs",
                      t.channel === "email"
                        ? "bg-blue-50 text-blue-700"
                        : "bg-violet-50 text-violet-700",
                    )}
                  >
                    {CHANNEL_LABEL[t.channel] ?? t.channel}
                  </span>
                </td>
                <td className="max-w-[320px] px-4 py-3 text-slate-600">
                  {t.subject && <p className="truncate font-medium text-slate-700">{t.subject}</p>}
                  <p className="line-clamp-2 whitespace-pre-line">{t.content}</p>
                </td>
                <td className="w-[240px] px-4 py-3 text-xs text-slate-500">
                  {t.usedBy.length ? (
                    <span title={t.usedBy.join(", ")} className="line-clamp-3">
                      {t.usedBy.join(", ")}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-2 py-2">
                  <div className="flex justify-end">
                    <button
                      onClick={() => setEditing(t)}
                      aria-label={`Sửa ${t.templateCode}`}
                      className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => remove(t)}
                      aria-label={`Xoá ${t.templateCode}`}
                      className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing !== undefined && (
        <TemplateForm
          auth={auth}
          template={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            list.reload();
          }}
        />
      )}
    </div>
  );
}
