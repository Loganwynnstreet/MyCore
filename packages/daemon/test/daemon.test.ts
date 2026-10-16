import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Vault } from "@mycore/core";
import { Daemon, DaemonClient, readOwnerSecret } from "../src/index.js";

const PASS = "correct horse";
let dir: string, vaultPath: string, daemon: Daemon, secret: string;
const clients: DaemonClient[] = [];

async function setup(idleMs?: number) {
  dir = mkdtempSync(join(tmpdir(), "mycore-d-"));
  vaultPath = join(dir, "v.mycore");
  const { vault } = await Vault.create(vaultPath, PASS, { fastKdf: true });
  vault.add({ type: "memory", data: { text: "likes tea" }, tags: ["prefs"] });
  vault.add({ type: "memory", data: { text: "pin 1234" }, sensitivity: "secret" });
  vault.add({ type: "person", data: { name: "Alice" } });
  vault.close();
  daemon = new Daemon({ vaultPath, runDir: join(dir, "run"), name: randomUUID().slice(0, 8), idleMs });
  await daemon.start();
  secret = readOwnerSecret(join(dir, "run"));
}

const connect = async (ch: "ai" | "admin") => {
  const c = await DaemonClient.connect(daemon.addresses[ch]);
  clients.push(c);
  return c;
};

/** unlock + grant; returns a passport token. */
async function grant(scopes: object, extra: object = {}) {
  const admin = await connect("admin");
  const r: any = await admin.request("grant", { label: "test-ai", scopes, ...extra }, { secret });
  expect(r.ok).toBe(true);
  return r.result.token as string;
}
const unlock = async () => {
  const admin = await connect("admin");
  const r = await admin.request("unlock", { passphrase: PASS }, { secret });
  expect(r.ok).toBe(true);
};

beforeEach(async () => { await setup(); });
afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await daemon.stop();
  rmSync(dir, { recursive: true, force: true });
});

describe("lock model", () => {
  it("starts locked and the ai channel refuses everything", async () => {
    const ai = await connect("ai");
    const r: any = await ai.request("search", { query: "tea" }, { token: "mcp_whatever" });
    expect(r).toMatchObject({ ok: false, error: "vault_locked" });
  });

  it("unlock needs the owner secret and the right passphrase", async () => {
    const admin = await connect("admin");
    expect(await admin.request("unlock", { passphrase: PASS }, { secret: "nope" })).toMatchObject({ ok: false, error: "unauthorized" });
    expect(await admin.request("unlock", { passphrase: PASS })).toMatchObject({ ok: false, error: "unauthorized" });
    expect(await admin.request("unlock", { passphrase: "wrong wrong" }, { secret })).toMatchObject({ ok: false, error: "unauthorized" });
    expect(await admin.request("unlock", { passphrase: PASS }, { secret })).toMatchObject({ ok: true });
    expect(await admin.request("status", {}, { secret })).toMatchObject({ ok: true, result: { locked: false } });
    expect(await admin.request("lock", {}, { secret })).toMatchObject({ ok: true });
    expect(await admin.request("status", {}, { secret })).toMatchObject({ ok: true, result: { locked: true } });
  });

  it("locks itself after the idle timeout", async () => {
    await daemon.stop();
    rmSync(dir, { recursive: true, force: true });
    await setup(150);
    await unlock();
    const token = await grant({ read: true });
    const ai = await connect("ai");
    expect((await ai.request("list", {}, { token })).ok).toBe(true);
    await new Promise((r) => setTimeout(r, 400));
    expect(await ai.request("list", {}, { token })).toMatchObject({ ok: false, error: "vault_locked" });
  });
});

describe("ai channel", () => {
  it("serves only what the passport allows", async () => {
    await unlock();
    const token = await grant({ read: true, types: ["memory"] });
    const ai = await connect("ai");
    const list: any = await ai.request("list", {}, { token });
    expect(list.ok).toBe(true);
    expect(list.result.map((r: any) => r.data.text)).toEqual(["likes tea"]); // no secret, no person
    expect(list.result[0]).not.toHaveProperty("status");
    const s: any = await ai.request("search", { query: "pin" }, { token });
    expect(s.result).toEqual([]);
    const person: any = await ai.request("list", { type: "person" }, { token });
    expect(person.result).toEqual([]);
  });

  it("rejects missing, wrong and revoked tokens; revocation is immediate", async () => {
    await unlock();
    const admin = await connect("admin");
    const g: any = await admin.request("grant", { label: "x", scopes: { read: true } }, { secret });
    const ai = await connect("ai");
    expect((await ai.request("list", {}, { token: g.result.token })).ok).toBe(true);
    expect(await ai.request("list", {})).toMatchObject({ ok: false, error: "unauthorized" });
    expect(await ai.request("list", {}, { token: "mcp_guess" })).toMatchObject({ ok: false, error: "unauthorized" });
    await admin.request("revoke", { id: g.result.passport.id }, { secret });
    expect(await ai.request("list", {}, { token: g.result.token })).toMatchObject({ ok: false, error: "unauthorized" });
  });

  it("writes land as pending and are invisible to the writer", async () => {
    await unlock();
    const token = await grant({ read: true, write: true, types: ["memory"] });
    const ai = await connect("ai");
    const w: any = await ai.request("add", { type: "memory", data: { text: "learned x" } }, { token });
    expect(w).toMatchObject({ ok: true, result: { status: "pending" } });
    expect(w.result).not.toHaveProperty("data");
    expect(((await ai.request("search", { query: "learned" }, { token })) as any).result).toEqual([]);
    const admin = await connect("admin");
    const pend: any = await admin.request("pending", {}, { secret });
    expect(pend.result).toHaveLength(1);
    expect(pend.result[0].source).toMatch(/^passport:/);
    expect(await admin.request("approve", { id: w.result.id }, { secret })).toMatchObject({ ok: true });
    expect(((await ai.request("search", { query: "learned" }, { token })) as any).result).toHaveLength(1);
  });

  it("cannot reach admin operations, with or without the secret", async () => {
    await unlock();
    const token = await grant({ read: true });
    const ai = await connect("ai");
    for (const op of ["grant", "approve", "unlock", "audit", "status"]) {
      expect(await ai.request(op, {}, { token, secret })).toMatchObject({ ok: false, error: "unknown_op" });
    }
  });

  it("a token is useless on the admin channel", async () => {
    await unlock();
    const token = await grant({ read: true });
    const admin = await connect("admin");
    expect(await admin.request("grant", { label: "x", scopes: { read: true } }, { secret: token })).toMatchObject({ ok: false, error: "unauthorized" });
  });

  it("failed authentication is audited and backed off", async () => {
    await unlock();
    const ai = await connect("ai");
    for (let i = 0; i < 4; i++) await ai.request("list", {}, { token: "mcp_bad" });
    const t = Date.now();
    await ai.request("list", {}, { token: "mcp_bad" }); // 5th failure: >= 400ms delay
    expect(Date.now() - t).toBeGreaterThanOrEqual(350);
    const admin = await connect("admin");
    const log: any = await admin.request("audit", {}, { secret });
    expect(log.result.filter((e: any) => e.action === "passport.auth_failed").length).toBeGreaterThanOrEqual(5);
  });
});

describe("owner record ops", () => {
  it("lists, searches, adds, removes and masks secrets", async () => {
    await unlock();
    const a = await connect("admin");
    const all: any = await a.request("records", {}, { secret });
    expect(all.result).toHaveLength(3);
    const masked = all.result.find((r: any) => r.sensitivity === "secret");
    expect(masked.data).toBeNull();
    expect(JSON.stringify(all)).not.toContain("1234");
    expect(((await a.request("records", { query: "tea" }, { secret })) as any).result).toHaveLength(1);
    const added: any = await a.request("add_record", { type: "memory", data: { text: "new" }, tags: ["x"] }, { secret });
    expect(added.ok).toBe(true);
    expect(await a.request("remove_record", { id: added.result.id }, { secret })).toMatchObject({ ok: true, result: { removed: true } });
    const stats: any = await a.request("stats", {}, { secret });
    expect(stats.result.counts).toEqual({ memory: 2, person: 1 });
  });
});

describe("vault creation", () => {
  it("creates a vault through the admin channel only when none exists", async () => {
    const dir2 = mkdtempSync(join(tmpdir(), "mycore-c-"));
    const d = new Daemon({ vaultPath: join(dir2, "new.mycore"), runDir: join(dir2, "run"), name: randomUUID().slice(0, 8) });
    await d.start();
    const sec = readOwnerSecret(join(dir2, "run"));
    const a = await DaemonClient.connect(d.addresses.admin);
    try {
      expect(await a.request("status", {}, { secret: sec })).toMatchObject({ ok: true, result: { locked: true, exists: false } });
      const made: any = await a.request("create", { passphrase: "brand new pass" }, { secret: sec });
      expect(made.result.recoveryPhrase.split(" ")).toHaveLength(24);
      expect(await a.request("status", {}, { secret: sec })).toMatchObject({ result: { locked: false, exists: true } });
      expect(await a.request("create", { passphrase: "another pass!!" }, { secret: sec })).toMatchObject({ ok: false, error: "vault_exists" });
      expect(await a.request("create", { passphrase: "x" })).toMatchObject({ ok: false, error: "unauthorized" });
    } finally {
      a.close();
      await d.stop();
      rmSync(dir2, { recursive: true, force: true });
    }
  });
});

describe("protocol hardening", () => {
  it("rejects malformed requests", async () => {
    const ai = await connect("ai");
    for (const bad of ["not json", "[]", '{"id":1}', '{"id":1,"op":"list","extra":true}', '{"id":1,"op":"list","args":[]}']) {
      ai.raw(bad + "\n");
      const res = JSON.parse((await ai.onceData()).trim());
      expect(res).toMatchObject({ ok: false, error: "bad_request" });
    }
  });

  it("drops connections that send an oversized message", async () => {
    const ai = await connect("ai");
    const closed = new Promise<string>((r) => (ai as any).sock.once("data", (c: Buffer) => r(c.toString())));
    ai.raw("x".repeat(1024 * 1024 + 10));
    expect(JSON.parse((await closed).trim())).toMatchObject({ ok: false, error: "too_large" });
  });

  it("a second daemon refuses to start and does not break the first", async () => {
    const dup = new Daemon({ vaultPath, runDir: join(dir, "run"), name: (daemon as any).o.name });
    await expect(dup.start()).rejects.toThrow(/already running/);
    await unlock(); // the first daemon's secret is still valid
  });

  it("does not leave the owner secret readable after stop", async () => {
    await daemon.stop();
    expect(() => readOwnerSecret(join(dir, "run"))).toThrow();
    await daemon.start(); // afterEach stops it again
  });
});
