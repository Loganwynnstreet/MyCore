import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Vault } from "../src/index.js";

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

  it("creates and lists passports", () => {
    const passport = v.createPassport({
      label: "Claude AI",
      scopes: { types: ["memory"], maxSensitivity: "personal", read: true, write: false },
    });
    expect(passport.id).toBeDefined();
    expect(passport.label).toBe("Claude AI");
    expect(passport.scopes.types).toEqual(["memory"]);
    expect(passport.revokedAt).toBeNull();

    const passports = v.listPassports();
    expect(passports).toHaveLength(1);
    expect(passports[0].id).toBe(passport.id);
  });

  it("revokes passports", () => {
    const passport = v.createPassport({
      label: "Test AI",
      scopes: { types: ["memory"], maxSensitivity: "personal" },
    });
    expect(v.validatePassport(passport.id)).toBe(true);

    const revoked = v.revokePassport(passport.id);
    expect(revoked.revokedAt).toBeDefined();
    expect(v.validatePassport(passport.id)).toBe(false);

    const active = v.listPassports();
    expect(active).toHaveLength(0);

    const all = v.listPassports(true);
    expect(all).toHaveLength(1);
    expect(all[0].revokedAt).toBeDefined();
  });

  it("handles passport expiration", () => {
    const expiredDate = new Date(Date.now() - 1000).toISOString();
    const futureDate = new Date(Date.now() + 100000).toISOString();

    const expired = v.createPassport({
      label: "Expired",
      scopes: { types: ["memory"] },
      expiresAt: expiredDate,
    });

    const valid = v.createPassport({
      label: "Valid",
      scopes: { types: ["memory"] },
      expiresAt: futureDate,
    });

    expect(v.validatePassport(expired.id)).toBe(false);
    expect(v.validatePassport(valid.id)).toBe(true);
  });

  it("applies passport scopes to filters", () => {
    v.add({ type: "memory", data: { text: "public" }, sensitivity: "public" });
    v.add({ type: "memory", data: { text: "secret" }, sensitivity: "secret" });
    v.add({ type: "person", data: { name: "Alice" } });

    const passport = v.createPassport({
      label: "Limited",
      scopes: { types: ["memory"], maxSensitivity: "personal" },
    });

    const filter = v.applyPassport({ type: "memory" }, passport.id);
    expect(filter.type).toBe("memory");
    expect(filter.maxSensitivity).toBe("personal");

    const results = v.list(filter);
    expect(results).toHaveLength(1);
    expect(results[0].sensitivity).toBe("public");
  });

  it("rejects invalid passport IDs", () => {
    expect(() => v.revokePassport("nonexistent")).toThrow();
    expect(() => v.applyPassport({}, "nonexistent")).toThrow();
  });

  it("rejects passport operations on already revoked passports", () => {
    const passport = v.createPassport({
      label: "Test",
      scopes: { types: ["memory"] },
    });
    v.revokePassport(passport.id);
    expect(() => v.revokePassport(passport.id)).toThrow();
  });
});
