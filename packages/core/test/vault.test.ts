import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Vault, exportRecords } from "../src/index.js";

const fast = { fastKdf: true };
let dir: string, path: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "mycore-")); path = join(dir, "t.mycore"); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("vault crypto", () => {
  it("round-trips with passphrase and rejects a wrong one", async () => {
    const { vault } = await Vault.create(path, "correct horse", fast);
    vault.add({ type: "memory", data: { text: "my secret cat is Biscuit" } });
    vault.close();
    await expect(Vault.open(path, "wrong passphrase")).rejects.toThrow(/Wrong passphrase/);
    const v = await Vault.open(path, "correct horse");
    expect(v.list({ type: "memory" })).toHaveLength(1);
    v.close();
  });

  it("file contains no plaintext", async () => {
    const { vault } = await Vault.create(path, "correct horse", fast);
    vault.add({ type: "memory", data: { text: "Biscuit-the-cat" } });
    vault.close();
    expect(readFileSync(path).includes("Biscuit")).toBe(false);
    expect(readFileSync(path).subarray(0, 15).toString()).not.toBe("SQLite format 3");
  });

  it("recovers with the recovery phrase and can change passphrase", async () => {
    const { vault, recoveryPhrase } = await Vault.create(path, "correct horse", fast);
    vault.add({ type: "profile", data: { key: "name", value: "Logan" } });
    vault.close();
    expect(recoveryPhrase.split(" ")).toHaveLength(24);
    const v = await Vault.openWithRecovery(path, recoveryPhrase);
    await v.changePassphrase("new passphrase!", fast);
    v.close();
    await expect(Vault.open(path, "correct horse")).rejects.toThrow();
    const v2 = await Vault.open(path, "new passphrase!");
    expect(v2.list()).toHaveLength(1);
    v2.close();
    await expect(Vault.openWithRecovery(path, "abandon ".repeat(23) + "art")).rejects.toThrow();
  });

  it("refuses to overwrite an existing vault", async () => {
    (await Vault.create(path, "correct horse", fast)).vault.close();
    await expect(Vault.create(path, "another one!!", fast)).rejects.toThrow(/already exists/);
  });
});

describe("records", () => {
  let v: Vault;
  beforeEach(async () => { v = (await Vault.create(path, "correct horse", fast)).vault; });
  afterEach(() => v.close());

  it("adds, updates, searches and removes", () => {
    const r = v.add({ type: "person", data: { name: "Alice Nguyen", relation: "sister" }, tags: ["family"] });
    expect(v.search("alice")[0]?.id).toBe(r.id);
    expect(v.search("sist")[0]?.id).toBe(r.id);
    v.update(r.id, { data: { name: "Alicia Nguyen", relation: "sister" } });
    expect(v.search("alice")).toHaveLength(0);
    expect(v.search("alicia")).toHaveLength(1);
    expect(v.list({ tag: "family" })).toHaveLength(1);
    expect(v.remove(r.id)).toBe(true);
    expect(v.search("alicia")).toHaveLength(0);
  });

  it("filters by sensitivity ceiling", () => {
    v.add({ type: "memory", data: { text: "public bio" }, sensitivity: "public" });
    v.add({ type: "memory", data: { text: "medical note" }, sensitivity: "private" });
    v.add({ type: "memory", data: { text: "bank pin" }, sensitivity: "secret" });
    expect(v.list({ maxSensitivity: "personal" })).toHaveLength(1);
    expect(v.list({ maxSensitivity: "private" })).toHaveLength(2);
    expect(v.search("bank", { maxSensitivity: "private" })).toHaveLength(0);
  });

  it("hides pending records until approved", () => {
    const r = v.add({ type: "memory", data: { text: "AI says hi" } }, "claude");
    const p = v.add({ type: "memory", data: { text: "AI proposal" }, status: "pending" }, "claude");
    expect(v.list()).toHaveLength(1);
    expect(v.search("proposal")).toHaveLength(0);
    expect(v.list({ status: "pending" })).toHaveLength(1);
    v.approve(p.id);
    expect(v.search("proposal")).toHaveLength(1);
    expect(() => v.approve(r.id)).toThrow();
  });

  it("is safe against FTS syntax and records an audit trail", () => {
    v.add({ type: "memory", data: { text: "hello world" } });
    expect(v.search("\" OR * NEAR(")).toEqual([]);
    expect(v.auditLog().map((a) => a.action)).toContain("record.add");
  });

  it("rejects unknown types", () => {
    expect(() => v.add({ type: "bogus" as any, data: {} })).toThrow();
  });
});

describe("passports", () => {
  let v: Vault;
  beforeEach(async () => { v = (await Vault.create(path, "correct horse", fast)).vault; });
  afterEach(() => v.close());

  const grant = (scopes: any, extra: any = {}) => v.createPassport({ label: "AI", scopes, ...extra });

  it("issues a one-time token and stores only its hash", () => {
    const { passport, token } = grant({ read: true });
    expect(token.startsWith("mcp_")).toBe(true);
    expect(JSON.stringify(v.listPassports())).not.toContain(token);
    expect(v.authenticate(token).label).toBe("AI");
    expect(passport.id).not.toBe(token);
  });

  it("rejects unknown, revoked and expired tokens", () => {
    expect(() => v.authenticate("mcp_nope")).toThrow(/Invalid/);
    const { passport, token } = grant({ read: true });
    v.revokePassport(passport.id);
    expect(() => v.authenticate(token)).toThrow(/Invalid/);
    const exp = grant({ read: true }, { expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect(() => v.authenticate(exp.token)).toThrow(/Invalid/);
    expect(() => v.revokePassport(passport.id)).toThrow(/already revoked/);
    expect(() => v.revokePassport("nope")).toThrow();
  });

  it("revocation takes effect on already-open sessions", () => {
    const { passport, token } = grant({ read: true });
    const s = v.authenticate(token);
    v.add({ type: "memory", data: { text: "x" } });
    expect(s.list()).toHaveLength(1);
    v.revokePassport(passport.id);
    expect(() => s.list()).toThrow(/revoked/);
  });

  it("validates scopes and fails closed", () => {
    expect(() => grant({})).toThrow(/read or write/);
    expect(() => grant({ read: true, maxSensitivity: "secret" })).toThrow(/secret/);
    expect(() => grant({ read: true, types: ["bogus"] })).toThrow(/unknown type/);
    expect(() => grant({ read: true }, { expiresAt: "not-a-date" })).toThrow();
  });

  it("enforces multiple types, tags and the default sensitivity ceiling", () => {
    v.add({ type: "memory", data: { text: "m" }, tags: ["work"] });
    v.add({ type: "person", data: { name: "p" }, tags: ["work"] });
    v.add({ type: "event", data: { title: "e" }, tags: ["work"] });
    v.add({ type: "memory", data: { text: "untagged" } });
    v.add({ type: "memory", data: { text: "priv" }, tags: ["work"], sensitivity: "private" });
    const s = v.authenticate(grant({ read: true, types: ["memory", "person"], tags: ["work"] }).token);
    expect(s.list().map((r) => r.type).sort()).toEqual(["memory", "person"]);
    expect(s.list({ type: "event" })).toHaveLength(0);
    expect(s.list({ types: ["event"] as any })).toHaveLength(2); // caller-supplied `types` is overridden
    expect(s.list({ maxSensitivity: "secret" }).some((r) => r.sensitivity !== "public" && r.sensitivity !== "personal")).toBe(false);
  });

  it("never serves secret records or pending records, even if requested", () => {
    v.add({ type: "memory", data: { text: "pin 1234" }, sensitivity: "secret" });
    v.add({ type: "memory", data: { text: "queued" }, status: "pending" });
    const s = v.authenticate(grant({ read: true, maxSensitivity: "private" }).token);
    expect(s.list({ maxSensitivity: "secret", status: "pending" })).toHaveLength(0);
    expect(s.search("pin", { maxSensitivity: "secret" })).toHaveLength(0);
    expect(s.search("queued", { status: "pending" })).toHaveLength(0);
  });

  it("get() cannot reach out-of-scope records", () => {
    const secret = v.add({ type: "memory", data: { text: "s" }, sensitivity: "secret" });
    const person = v.add({ type: "person", data: { name: "p" } });
    const ok = v.add({ type: "memory", data: { text: "ok" } });
    const s = v.authenticate(grant({ read: true, types: ["memory"] }).token);
    expect(s.get(secret.id)).toBeUndefined();
    expect(s.get(person.id)).toBeUndefined();
    expect(s.get(ok.id)?.id).toBe(ok.id);
  });

  it("requires explicit read/write grants and queues writes as pending", () => {
    const ro = v.authenticate(grant({ read: true }).token);
    expect(() => ro.add({ type: "memory", data: { text: "x" } })).toThrow(/writes/);
    const wo = v.authenticate(grant({ write: true, types: ["memory"], tags: ["ai"] }).token);
    expect(() => wo.list()).toThrow(/reads/);
    expect(() => wo.add({ type: "person", data: {} })).toThrow(/type/);
    expect(() => wo.add({ type: "memory", data: {}, tags: ["other"] })).toThrow(/tag/);
    expect(() => wo.add({ type: "memory", data: {}, tags: ["ai"], sensitivity: "private" })).toThrow(/ceiling/);
    const rec = wo.add({ type: "memory", data: { text: "learned" }, tags: ["ai"] });
    expect(rec.status).toBe("pending");
    expect(rec.source).toMatch(/^passport:/);
    expect(v.list()).toHaveLength(0);
    expect(v.list({ status: "pending" })).toHaveLength(1);
  });

  it("audits scoped access and failed authentication", () => {
    const s = v.authenticate(grant({ read: true }).token);
    s.list();
    expect(() => v.authenticate("mcp_bad")).toThrow();
    const actions = v.auditLog().map((a) => a.action);
    expect(actions).toContain("scoped.list");
    expect(actions).toContain("passport.auth_failed");
  });
});

describe("export / restore", () => {
  it("exports beyond the 100-row list cap and round-trips into a fresh vault", async () => {
    const { vault: a } = await Vault.create(path, "correct horse", fast);
    for (let i = 0; i < 250; i++) a.add({ type: "memory", data: { text: `m${i}` }, tags: [i % 2 ? "odd" : "even"] });
    a.add({ type: "person", data: { name: "P" } });
    a.add({ type: "memory", data: { text: "pin" }, sensitivity: "secret" });
    a.add({ type: "memory", data: { text: "queued" }, status: "pending" });
    const env = exportRecords(a);
    expect(env.count).toBe(251); // secret and pending excluded by default
    expect(env.containsSecrets).toBe(false);
    expect(exportRecords(a, { types: ["memory", "person"], tags: ["odd"] }).count).toBe(125);
    expect(() => exportRecords(a, { maxSensitivity: "secret" })).toThrow(/includeSecret/);
    const full = exportRecords(a, { includeSecret: true, includePending: true });
    expect(full.count).toBe(253);

    const path2 = join(dir, "b.mycore");
    const { vault: b } = await Vault.create(path2, "correct horse", fast);
    expect(b.importRecords(full.records)).toEqual({ added: 253, skipped: 0 });
    expect(b.importRecords(full.records)).toEqual({ added: 0, skipped: 253 }); // idempotent
    expect(b.all({ status: "active" }).length + b.all({ status: "pending" }).length).toBe(253);
    expect(b.search("m249")).toHaveLength(1);
    a.close(); b.close();
  });

  it("import is all-or-nothing and validates records", async () => {
    const { vault } = await Vault.create(path, "correct horse", fast);
    const good = { id: randomUUID(), type: "memory", data: { text: "ok" }, tags: [], sensitivity: "personal", status: "active" };
    const badType = { ...good, id: randomUUID(), type: "nope" };
    expect(() => vault.importRecords([good, badType])).toThrow(/Record #1/);
    expect(vault.all()).toHaveLength(0);
    expect(() => vault.importRecords([{ ...good, data: [] }])).toThrow(/data/);
    expect(() => vault.importRecords([{ ...good, id: "../x" }])).toThrow(/id/);
    vault.close();
  });
});
