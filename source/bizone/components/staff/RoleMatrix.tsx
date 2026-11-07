"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  apiContext,
  errorMessage,
  type ApiAuth,
  type RouterOutputs,
} from "@/components/inventory/shared";
import {
  ErrorBox,
  Field,
  btnPrimary,
  btnSecondary,
  inputCls,
  roleBadgeClass,
  useLoad,
} from "./shared";

type RoleRow = RouterOutputs["staff"]["role"]["list"][number];

interface Draft {
  id: number | null;
  name: string;
  description: string;
  permissions: string[];
}

export function RoleMatrix({ auth }: { auth: ApiAuth }) {
  const ctx = apiContext(auth);
  const data = useLoad(JSON.stringify(auth), async () => {
    const [roles, catalog] = await Promise.all([
      trpc.staff.role.list.query(undefined, ctx),
      trpc.staff.role.permissions.query(undefined, ctx),
    ]);
    return { roles, catalog };
  });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const roles = data.data?.roles ?? [];
  const catalog = data.data?.catalog ?? [];
  const selected: RoleRow | undefined = roles.find((r) => r.id === selectedId) ?? roles[0];
  const editing = draft !== null;
  const shown = draft?.permissions ?? selected?.permissions ?? [];

  const startNew = (from?: RoleRow) =>
    setDraft({
      id: null,
      name: from ? `${from.name} (bản sao)` : "",
      description: from?.description ?? "",
      permissions: from ? [...from.permissions] : [],
    });

  const toggle = (code: string) =>
    draft &&
    setDraft({
      ...draft,
      permissions: draft.permissions.includes(code)
        ? draft.permissions.filter((p) => p !== code)
        : [...draft.permissions, code],
    });

  async function run(fn: () => Promise<{ id: number } | void>) {
    setBusy(true);
    setError("");
    try {
      const r = await fn();
      setDraft(null);
      if (r?.id) setSelectedId(r.id);
      data.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    run(() => {
      const input = {
        name: draft!.name,
        description: draft!.description || undefined,
        permissions: draft!.permissions,
      };
      return draft!.id
        ? trpc.staff.role.update.mutate({ id: draft!.id, ...input }, ctx)
        : trpc.staff.role.create.mutate(input, ctx);
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-2">
        {roles.map((r) => (
          <button
            key={r.id}
            onClick={() => {
              setSelectedId(r.id);
              setDraft(null);
            }}
            className={`w-full rounded-lg border p-3 text-left ${
              selected?.id === r.id && !editing
                ? "border-primary bg-blue-50/60"
                : "border-slate-200 bg-white hover:bg-slate-50"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${roleBadgeClass(r.code)}`}>
                {r.name}
              </span>
              <span className="text-xs text-slate-400">{r.userCount} NV</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {r.description ?? (r.isSystem ? "" : "Vai trò tuỳ chỉnh")}
            </p>
          </button>
        ))}
        <button className={`${btnSecondary} w-full`} onClick={() => startNew()}>
          + Thêm vai trò
        </button>
      </aside>

      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
        <ErrorBox message={error || data.error} />
        {editing ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tên vai trò *" htmlFor="rl-name">
              <input
                id="rl-name"
                className={inputCls}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>
            <Field label="Mô tả" htmlFor="rl-desc">
              <input
                id="rl-desc"
                className={inputCls}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </Field>
          </div>
        ) : (
          selected && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="mr-auto">
                <h2 className="text-lg font-semibold text-slate-800">{selected.name}</h2>
                <p className="text-sm text-slate-500">
                  {selected.isSystem
                    ? "Vai trò hệ thống — quyền gắn với vai trò Keycloak, không sửa được."
                    : `${selected.userCount} nhân viên đang dùng`}
                </p>
              </div>
              <button className={btnSecondary} onClick={() => startNew(selected)}>
                Sao chép quyền
              </button>
              {!selected.isSystem && (
                <>
                  <button
                    className={btnSecondary}
                    onClick={() =>
                      setDraft({
                        id: selected.id,
                        name: selected.name,
                        description: selected.description ?? "",
                        permissions: [...selected.permissions],
                      })
                    }
                  >
                    Sửa
                  </button>
                  <button
                    className={`${btnSecondary} text-red-600`}
                    disabled={busy}
                    onClick={() =>
                      run(() => trpc.staff.role.delete.mutate({ id: selected.id }, ctx))
                    }
                  >
                    Xoá
                  </button>
                </>
              )}
            </div>
          )
        )}

        <div className="grid gap-3 md:grid-cols-2">
          {catalog.map((group) => (
            <fieldset key={group.module} className="rounded-md border border-slate-200 p-3">
              <legend className="px-1 text-sm font-semibold text-slate-700">{group.label}</legend>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {group.permissions.map((p) => (
                  <label
                    key={p.code}
                    className={`flex min-h-9 items-center gap-2 rounded px-1 text-sm ${p.active ? "text-slate-700" : "text-slate-400"}`}
                    title={p.active ? p.code : `${p.code} — module chưa xây dựng`}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-blue-600"
                      checked={shown.includes(p.code)}
                      disabled={!editing}
                      onChange={() => toggle(p.code)}
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>

        {editing && (
          <div className="flex justify-end gap-2">
            <button className={btnSecondary} onClick={() => setDraft(null)}>
              Huỷ
            </button>
            <button className={btnPrimary} disabled={busy || !draft.name} onClick={save}>
              {draft.id ? "Lưu vai trò" : "Tạo vai trò"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
