"use client";

import { useState } from "react";
import { Ban, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";
import {
  apiContext,
  errorMessage,
  type ApiAuth,
  type RouterOutputs,
} from "@/components/inventory/shared";
import { ErrorBox, btnPrimary, btnSecondary, useLoad } from "@/components/staff/shared";
import { DeliveryLog } from "@/components/notifications/DeliveryLog";
import { Modal } from "@/components/ui/Modal";
import { MarketingHeader, RANKING_LABEL, StatusPill, fmtDT } from "./shared";
import { CampaignForm } from "./CampaignForm";

type Campaign = RouterOutputs["campaign"]["list"]["items"][number];

const STATUS: Record<
  string,
  { label: string; tone: "green" | "amber" | "slate" | "red" | "blue" }
> = {
  draft: { label: "Nháp", tone: "slate" },
  scheduled: { label: "Hẹn gửi", tone: "blue" },
  sending: { label: "Đang gửi", tone: "amber" },
  completed: { label: "Đã gửi", tone: "green" },
  cancelled: { label: "Đã huỷ", tone: "red" },
};

export function audienceText(a: Campaign["audience"]): string {
  const parts = [
    a.rankings.length ? `Hạng ${a.rankings.map((r) => RANKING_LABEL[r] ?? r).join(", ")}` : null,
    a.groupIds.length ? `${a.groupIds.length} nhóm KH` : null,
    a.minSpent !== null ? `Chi tiêu ≥ ${a.minSpent.toLocaleString("vi-VN")}₫` : null,
    a.birthdayMonth !== null ? `Sinh nhật tháng ${a.birthdayMonth}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Mọi khách hàng";
}

/** Marketing campaigns SMS / Email (SRS-MKT-06) */
export function CampaignList({ auth }: { auth: ApiAuth }) {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const list = useLoad(`campaigns-${page}`, () =>
    trpc.campaign.list.query({ page, limit: 20 }, apiContext(auth)),
  );
  const [editing, setEditing] = useState<Campaign | null | undefined>(undefined);
  const [log, setLog] = useState<Campaign | null>(null);

  async function act(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      toast.success(ok);
      list.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const data = list.data;
  return (
    <div className="space-y-5">
      <MarketingHeader
        title="Chiến dịch SMS / Email"
        subtitle="Gửi tin hàng loạt tới nhóm khách hàng theo hạng, nhóm, chi tiêu, tháng sinh"
        actions={
          <button className={btnPrimary} onClick={() => setEditing(null)}>
            <Plus className="h-4 w-4" /> Tạo chiến dịch
          </button>
        }
      />
      <ErrorBox message={list.error} />
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3">Chiến dịch</th>
              <th className="px-4 py-3">Đối tượng</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3 text-right">Đã gửi / lỗi</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {data?.items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Chưa có chiến dịch
                </td>
              </tr>
            )}
            {data?.items.map((c) => {
              const st = STATUS[c.status] ?? STATUS.draft;
              return (
                <tr key={c.id} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{c.name}</p>
                    <p className="text-xs text-slate-500">
                      {c.channel === "email" ? "Email" : "SMS"} · tạo {fmtDT(c.createdAt)}
                      {c.createdByUser ? ` · ${c.createdByUser.fullName}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{audienceText(c.audience)}</td>
                  <td className="px-4 py-3">
                    <StatusPill tone={st.tone}>{st.label}</StatusPill>
                    {c.status === "scheduled" && (
                      <p className="mt-1 text-xs text-slate-500">{fmtDT(c.scheduledAt)}</p>
                    )}
                    {c.completedAt && (
                      <p className="mt-1 text-xs text-slate-500">{fmtDT(c.completedAt)}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {c.status === "draft" ? (
                      "—"
                    ) : (
                      <button className="text-primary hover:underline" onClick={() => setLog(c)}>
                        {c.sentCount}/{c.totalRecipients}
                        {c.failedCount > 0 && (
                          <span className="text-red-600"> · {c.failedCount} lỗi</span>
                        )}
                      </button>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex justify-end">
                      {c.status === "draft" && (
                        <>
                          <IconBtn label="Sửa" onClick={() => setEditing(c)}>
                            <Pencil className="h-4 w-4" />
                          </IconBtn>
                          <IconBtn
                            label="Gửi ngay"
                            onClick={() =>
                              confirm(`Gửi chiến dịch "${c.name}" ngay bây giờ?`) &&
                              act(
                                () => trpc.campaign.send.mutate({ id: c.id }, apiContext(auth)),
                                "Đã bắt đầu gửi",
                              )
                            }
                          >
                            <Send className="h-4 w-4" />
                          </IconBtn>
                        </>
                      )}
                      {(c.status === "scheduled" || c.status === "sending") && (
                        <IconBtn
                          label="Huỷ gửi"
                          onClick={() =>
                            confirm("Huỷ chiến dịch? Tin đã gửi không thu hồi được.") &&
                            act(
                              () => trpc.campaign.cancel.mutate({ id: c.id }, apiContext(auth)),
                              "Đã huỷ chiến dịch",
                            )
                          }
                        >
                          <Ban className="h-4 w-4" />
                        </IconBtn>
                      )}
                      {(c.status === "draft" ||
                        (c.status === "cancelled" && c.sentCount === 0)) && (
                        <IconBtn
                          label="Xoá"
                          danger
                          onClick={() =>
                            confirm(`Xoá chiến dịch "${c.name}"?`) &&
                            act(
                              () => trpc.campaign.delete.mutate({ id: c.id }, apiContext(auth)),
                              "Đã xoá",
                            )
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconBtn>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {data && data.meta.totalPages > 1 && (
        <div className="flex justify-end gap-2">
          <button className={btnSecondary} disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Trước
          </button>
          <button
            className={btnSecondary}
            disabled={page >= data.meta.totalPages}
            onClick={() => setPage(page + 1)}
          >
            Sau
          </button>
        </div>
      )}
      <p className="text-xs text-slate-500">
        Kênh Zalo OA chưa hỗ trợ. Tin quảng cáo SMS cần brandname đã đăng ký với nhà mạng.
      </p>

      {editing !== undefined && (
        <CampaignForm
          auth={auth}
          campaign={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            list.reload();
          }}
        />
      )}
      {log && (
        <Modal open onClose={() => setLog(null)} size="xl" title={`Kết quả gửi — ${log.name}`}>
          <div className="max-h-[70vh] overflow-y-auto">
            <DeliveryLog auth={auth} campaignId={log.id} />
          </div>
        </Modal>
      )}
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={
        danger
          ? "flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
          : "flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
      }
    >
      {children}
    </button>
  );
}
