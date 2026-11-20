import { describe, expect, it } from "vitest";
import { appRouter } from "@/server/routers";
import {
  isAudited,
  PERSONAL_MUTATIONS,
  SELF_AUDITED_MUTATIONS,
} from "@/server/middleware/auditLog";

/** P6.6 — "audit log cho mọi CRUD": every tRPC mutation is audited or explicitly exempted. */
describe("audit coverage", () => {
  const procedures = (
    appRouter as unknown as { _def: { procedures: Record<string, { _def: { type: string } }> } }
  )._def.procedures;
  const mutations = Object.entries(procedures)
    .filter(([, p]) => p._def.type === "mutation")
    .map(([path]) => path);

  it("finds the mutations", () => {
    expect(mutations.length).toBeGreaterThan(100);
  });

  it("audits every mutation (middleware or service) unless it only touches the caller's inbox", () => {
    const exempt = new Set([...SELF_AUDITED_MUTATIONS, ...PERSONAL_MUTATIONS]);
    const missing = mutations.filter((m) => !isAudited(m) && !exempt.has(m));
    expect(missing).toEqual([]);
  });

  it("keeps the exemption lists current", () => {
    const all = new Set(mutations);
    expect([...SELF_AUDITED_MUTATIONS, ...PERSONAL_MUTATIONS].filter((m) => !all.has(m))).toEqual(
      [],
    );
    expect(SELF_AUDITED_MUTATIONS.filter((m) => isAudited(m))).toEqual([]);
  });
});
