"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { trpc } from "@/lib/trpc";
import {
  apiContext,
  errorMessage,
  fmtDate,
  fmtMoney,
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
  vnToday,
} from "./shared";

type StaffRow = RouterOutputs["staff"]["list"]["items"][number];
type RoleRow = RouterOutputs["staff"]["role"]["list"][number];
type BranchRow = RouterOutputs["staff"]["branches"][number];
type Assignment = { roleId: number; branchId: number };

function avatarText(name: string) {
  return name.trim().split(/\s+/).pop()?.[0]?.toUpperCase() ?? "?";
}

/** Role × branch picker shared by the create and edit-roles forms */
function RoleAssignments({
  roles,
  branches,
  value,
  onChange,
}: {
  roles: RoleRow[];
  branches: BranchRow[];
  value: Assignment[];
  onChange: (v: Assignment[]) => void;
}) {
  if (branches.length === 0) {
    return (
      <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
        Chưa có chi nhánh hoạt động — cần tạo chi nhánh trước khi phân quyền.
      </p>
    );
  }
  const has = (a: Assignment) =>
    value.some((v) => v.roleId === a.roleId && v.branchId === a.branchId);
  const toggle = (a: Assignment) =>
    onChange(
      has(a)
        ? value.filter((v) => !(v.roleId === a.roleId && v.branchId === a.branchId))
        : [...value, a],
    );
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Vai trò</th>
            {branches.map((b) => (
              <th key={b.id} className="px-3 py-2 text-center font-medium whitespace-nowrap">
                {b.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {roles.map((r) => (
            <tr key={r.id} className="border-t border-slate-100">
              <td className="px-3 py-2">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${roleBadgeClass(r.code)}`}
                >
                  {r.name}
                </span>
                {!r.isSystem && <span className="ml-1 text-xs text-slate-400">tuỳ chỉnh</span>}
              </td>
              {branches.map((b) => (
                <td key={b.id} className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-blue-600"
                    aria-label={`${r.name} tại ${b.name}`}
                    checked={has({ roleId: r.id, branchId: b.id })}
                    onChange={() => toggle({ roleId: r.id, branchId: b.id })}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CreateStaffModal({
  auth,
  roles,
  branches,
  onClose,
  onSaved,
}: {
  auth: ApiAuth;
  roles: RoleRow[];
  branches: BranchRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    username: "",
    fullName: "",
    email: "",
    phone: "",
    password: "",
    temporaryPassword: true,
  });
  const seller = roles.find((r) => r.code === "seller");
  const [assignments, setAssignments] = useState<Assignment[]>(
    seller && branches[0] ? [{ roleId: seller.id, branchId: branches[0].id }] : [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    try {
      await trpc.staff.create.mutate(
        {
          username: form.username,
          fullName: form.fullName,
          email: form.email || undefined,
          phone: form.phone || undefined,
          password: form.password,
          temporaryPassword: form.temporaryPassword,
          roles: assignments,
        },
        apiContext(auth),
      );
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: k === "temporaryPassword" ? e.target.checked : e.target.value });

  return (
    <Modal
      open
      onClose={onClose}
      title="Thêm nhân viên"
      size="lg"
      footer={
        <>
          <button className={btnSecondary} onClick={onClose}>
            Huỷ
          </button>
          <button
            className={btnPrimary}
            onClick={save}
            disabled={
              saving || !form.username || !form.fullName || !form.password || !assignments.length
            }
          >
            {saving ? "Đang lưu..." : "Tạo nhân viên"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <ErrorBox message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Họ tên *" htmlFor="sf-name">
            <input
              id="sf-name"
              className={inputCls}
              value={form.fullName}
              onChange={set("fullName")}
            />
          </Field>
          <Field label="Tên đăng nhập *" htmlFor="sf-user" hint="Dùng để đăng nhập Keycloak">
            <input
              id="sf-user"
              className={inputCls}
              autoComplete="off"
              value={form.username}
              onChange={set("username")}
            />
          </Field>
          <Field label="Email" htmlFor="sf-email">
            <input
              id="sf-email"
              type="email"
              className={inputCls}
              value={form.email}
              onChange={set("email")}
            />
          </Field>
          <Field label="Số điện thoại" htmlFor="sf-phone">
            <input id="sf-phone" className={inputCls} value={form.phone} onChange={set("phone")} />
          </Field>
          <Field label="Mật khẩu ban đầu *" htmlFor="sf-pass" hint="Tối thiểu 8 ký tự">
            <input
              id="sf-pass"
              type="password"
              autoComplete="new-password"
              className={inputCls}
              value={form.password}
              onChange={set("password")}
            />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-5 w-5 accent-blue-600"
              checked={form.temporaryPassword}
              onChange={set("temporaryPassword")}
            />
            Bắt đổi mật khẩu lần đăng nhập đầu
          </label>
        </div>
        <Field label="Phân quyền theo chi nhánh *">
          <RoleAssignments
            roles={roles}
            branches={branches}
            value={assignments}
            onChange={setAssignments}
          />
        </Field>
      </div>
    </Modal>
  );
}

function EditStaffModal({
  auth,
  staff,
  roles,
  branches,
  onClose,
  onSaved,
}: {
  auth: ApiAuth;
  staff: StaffRow;
  roles: RoleRow[];
  branches: BranchRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    fullName: staff.fullName,
    email: staff.email ?? "",
    phone: staff.phone ?? "",
  });
  const [assignments, setAssignments] = useState<Assignment[]>(
    staff.userRoles.map((ur) => ({ roleId: ur.role.id, branchId: ur.branch.id })),
  );
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const ctx = apiContext(auth);

  async function run(fn: () => Promise<unknown>, done: string, close = true) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      if (close) onSaved();
      else setNotice(done);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    run(async () => {
      await trpc.staff.update.mutate(
        {
          id: staff.id,
          fullName: form.fullName,
          email: form.email || null,
          phone: form.phone || null,
        },
        ctx,
      );
      await trpc.staff.setRoles.mutate({ id: staff.id, roles: assignments }, ctx);
    }, "Đã lưu");

  return (
    <Modal
      open
      onClose={onClose}
      title={`Sửa nhân viên — ${staff.username}`}
      size="lg"
      footer={
        <>
          <button
            className={staff.isActive ? `${btnSecondary} text-red-600` : btnSecondary}
            disabled={busy}
            onClick={() =>
              run(
                () => trpc.staff.setActive.mutate({ id: staff.id, active: !staff.isActive }, ctx),
                "",
              )
            }
          >
            {staff.isActive ? "Cho nghỉ việc" : "Kích hoạt lại"}
          </button>
          <div className="flex-1" />
          <button className={btnSecondary} onClick={onClose}>
            Huỷ
          </button>
          <button className={btnPrimary} onClick={save} disabled={busy || !assignments.length}>
            {busy ? "Đang lưu..." : "Lưu"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <ErrorBox message={error} />
        {notice && (
          <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Họ tên" htmlFor="ef-name">
            <input
              id="ef-name"
              className={inputCls}
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            />
          </Field>
          <Field label="Email" htmlFor="ef-email">
            <input
              id="ef-email"
              className={inputCls}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label="Số điện thoại" htmlFor="ef-phone">
            <input
              id="ef-phone"
              className={inputCls}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Phân quyền theo chi nhánh">
          <RoleAssignments
            roles={roles}
            branches={branches}
            value={assignments}
            onChange={setAssignments}
          />
        </Field>
        <Field
          label="Đặt lại mật khẩu"
          htmlFor="ef-pass"
          hint="Nhân viên phải đổi lại khi đăng nhập"
        >
          <div className="flex gap-2">
            <input
              id="ef-pass"
              type="password"
              autoComplete="new-password"
              className={inputCls}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              className={btnSecondary}
              disabled={busy || password.length < 8}
              onClick={() =>
                run(
                  () =>
                    trpc.staff.resetPassword
                      .mutate({ id: staff.id, password, temporary: true }, ctx)
                      .then(() => setPassword("")),
                  "Đã đặt lại mật khẩu",
                  false,
                )
              }
            >
              Đặt lại
            </button>
          </div>
        </Field>
      </div>
    </Modal>
  );
}

export function StaffTable({ auth }: { auth: ApiAuth }) {
  const [search, setSearch] = useState("");
  const [roleId, setRoleId] = useState<number | "">("");
  const [status, setStatus] = useState<"" | "active" | "inactive">("active");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const ctx = apiContext(auth);
  const today = vnToday();

  const query = {
    page,
    pageSize: 20,
    search: search.trim() || undefined,
    roleId: roleId || undefined,
    status: status || undefined,
  };
  const list = useLoad(JSON.stringify([query, auth]), () => trpc.staff.list.query(query, ctx));
  const meta = useLoad(JSON.stringify(auth), async () => {
    const [roles, branches] = await Promise.all([
      trpc.staff.role.list.query(undefined, ctx),
      trpc.staff.branches.query(undefined, ctx),
    ]);
    return { roles, branches };
  });
  const sales = useLoad(JSON.stringify([auth, today]), () =>
    trpc.staff.sales.query({ from: `${today.slice(0, 8)}01`, to: today }, ctx),
  );
  const salesOf = (id: number) => sales.data?.rows.find((r) => r.user.id === id);

  const roles = meta.data?.roles ?? [];
  const branches = meta.data?.branches ?? [];
  const items = list.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          className={`${inputCls} sm:max-w-xs`}
          placeholder="Tìm tên, SĐT, email..."
          aria-label="Tìm nhân viên"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <select
          className={`${inputCls} sm:w-44`}
          aria-label="Lọc vai trò"
          value={roleId}
          onChange={(e) => {
            setRoleId(e.target.value ? Number(e.target.value) : "");
            setPage(1);
          }}
        >
          <option value="">Tất cả vai trò</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <select
          className={`${inputCls} sm:w-44`}
          aria-label="Lọc trạng thái"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as typeof status);
            setPage(1);
          }}
        >
          <option value="">Tất cả trạng thái</option>
          <option value="active">Đang làm việc</option>
          <option value="inactive">Đã nghỉ</option>
        </select>
        <div className="sm:flex-1" />
        <button className={btnPrimary} onClick={() => setCreating(true)}>
          + Thêm nhân viên
        </button>
      </div>

      <ErrorBox message={list.error || meta.error} />

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Nhân viên</th>
              <th className="px-4 py-3 text-left font-medium whitespace-nowrap">Liên hệ</th>
              <th className="min-w-56 px-4 py-3 text-left font-medium">Vai trò · Chi nhánh</th>
              <th className="px-4 py-3 text-right font-medium whitespace-nowrap">Doanh số tháng</th>
              <th className="px-4 py-3 text-left font-medium whitespace-nowrap">Trạng thái</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {list.loading && !list.data && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-slate-400">
                  Đang tải...
                </td>
              </tr>
            )}
            {!list.loading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-slate-400">
                  Không có nhân viên phù hợp
                </td>
              </tr>
            )}
            {items.map((s) => {
              const perf = salesOf(s.id);
              return (
                <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-700">
                        {avatarText(s.fullName)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-800">{s.fullName}</p>
                        <p className="truncate text-xs text-slate-500">{s.username}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <p>{s.phone ?? "—"}</p>
                    <p className="text-xs text-slate-500">{s.email ?? ""}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {s.userRoles.length === 0 && (
                        <span className="text-xs text-slate-400">Chưa phân quyền trong BizOne</span>
                      )}
                      {s.userRoles.map((ur) => (
                        <span
                          key={`${ur.role.id}-${ur.branch.id}`}
                          className={`rounded px-2 py-0.5 text-xs font-medium ${roleBadgeClass(ur.role.code)}`}
                        >
                          {ur.role.name} · {ur.branch.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p className="font-medium text-slate-800">{fmtMoney(perf?.revenue ?? 0)}</p>
                    <p className="text-xs text-slate-500">{perf?.invoices ?? 0} HĐ</p>
                  </td>
                  <td className="px-4 py-3">
                    {s.isActive ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Đang làm
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        Đã nghỉ
                      </span>
                    )}
                    <p className="mt-1 text-xs text-slate-400">Từ {fmtDate(s.createdAt)}</p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      className="h-9 rounded-md px-3 text-sm text-primary hover:bg-blue-50"
                      onClick={() => setEditing(s)}
                      aria-label={`Sửa ${s.fullName}`}
                    >
                      Sửa
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {list.data && list.data.meta.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <button className={btnSecondary} disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ‹ Trước
          </button>
          <span className="text-slate-500">
            {page}/{list.data.meta.totalPages}
          </span>
          <button
            className={btnSecondary}
            disabled={page >= list.data.meta.totalPages}
            onClick={() => setPage(page + 1)}
          >
            Sau ›
          </button>
        </div>
      )}

      {creating && (
        <CreateStaffModal
          auth={auth}
          roles={roles}
          branches={branches}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            list.reload();
          }}
        />
      )}
      {editing && (
        <EditStaffModal
          auth={auth}
          staff={editing}
          roles={roles}
          branches={branches}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            list.reload();
          }}
        />
      )}
    </div>
  );
}
