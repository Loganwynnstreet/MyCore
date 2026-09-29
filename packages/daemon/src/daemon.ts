import net from "node:net";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { Vault, type ListFilter, type RecordType, type Sensitivity, type ScopedVault, type VaultRecord } from "@mycore/core";
import {
  AI_OPS, ADMIN_OPS, MAX_MESSAGE_BYTES, ProtocolError, int, parseRequest, str, strList,
  type Channel, type Request, type Response,
} from "./protocol.js";

export interface DaemonOptions {
  vaultPath: string;
  /** Directory for the owner secret (and Unix sockets). Should be private to the user. */
  runDir: string;
  /** Distinguishes pipe names; defaults to "default". */
  name?: string;
  /** Lock after this many ms without a valid request. Default 30 minutes. */
  idleMs?: number;
}

export function addressFor(channel: Channel, runDir: string, name = "default"): string {
  return process.platform === "win32"
    ? `\\\\.\\pipe\\mycore-${name}-${channel}`
    : join(runDir, `${name}-${channel}.sock`);
}

export const ownerSecretPath = (runDir: string) => join(runDir, "owner.key");

const sha = (s: string) => createHash("sha256").update(s).digest();
const safeEqual = (a: string, b: string) => timingSafeEqual(sha(a), sha(b));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Failed-attempt backoff: free for two failures, then 100ms doubling to a 5s cap. */
class Backoff {
  private n = 0;
  delay() { return this.n < 3 ? 0 : Math.min(100 * 2 ** (this.n - 3), 5000); }
  fail() { this.n++; }
  reset() { this.n = 0; }
}

export class Daemon {
  private vault: Vault | null = null;
  private servers: net.Server[] = [];
  private sockets = new Set<net.Socket>();
  private secret = randomBytes(32).toString("hex");
  private idleTimer: NodeJS.Timeout | null = null;
  private backoff: Record<Channel, Backoff> = { ai: new Backoff(), admin: new Backoff() };
  private idleMs: number;
  readonly addresses: Record<Channel, string>;

  constructor(private o: DaemonOptions) {
    this.idleMs = o.idleMs ?? 30 * 60_000;
    this.addresses = {
      ai: addressFor("ai", o.runDir, o.name),
      admin: addressFor("admin", o.runDir, o.name),
    };
  }

  get locked() { return this.vault === null; }

  async start(): Promise<void> {
    mkdirSync(this.o.runDir, { recursive: true, mode: 0o700 });
    // Never disturb a daemon that is already running (its socket and owner secret stay intact).
    for (const address of Object.values(this.addresses)) {
      if (await isListening(address)) throw new Error("mycored is already running for this vault");
    }
    try {
      for (const channel of ["ai", "admin"] as const) {
        const address = this.addresses[channel];
        if (process.platform !== "win32") rmSync(address, { force: true }); // stale socket from a crash
        const server = net.createServer((sock) => this.onConnection(channel, sock));
        await new Promise<void>((resolve, reject) => {
          server.once("error", reject);
          server.listen(address, () => resolve());
        });
        // NOTE: Windows named pipes get Node's default DACL; we cannot tighten it from here.
        // The admin channel is guarded by the owner secret and the ai channel by passport tokens.
        if (process.platform !== "win32") chmodSync(address, 0o600);
        this.servers.push(server);
      }
    } catch (e) {
      await Promise.all(this.servers.map((s) => new Promise<void>((r) => s.close(() => r()))));
      this.servers = [];
      throw e;
    }
    // Only publish the secret once we own the sockets.
    const secretFile = ownerSecretPath(this.o.runDir);
    writeFileSync(secretFile, this.secret, { mode: 0o600 });
    restrictToCurrentUser(secretFile);
  }

  async stop(): Promise<void> {
    this.lock();
    for (const s of this.sockets) s.destroy();
    await Promise.all(this.servers.map((s) => new Promise<void>((r) => s.close(() => r()))));
    this.servers = [];
    rmSync(ownerSecretPath(this.o.runDir), { force: true });
    if (process.platform !== "win32") for (const a of Object.values(this.addresses)) rmSync(a, { force: true });
  }

  private lock() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    if (this.vault) { try { this.vault.close(); } catch { /* already closed */ } }
    this.vault = null;
  }

  private touch() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.lock(), this.idleMs);
    this.idleTimer.unref();
  }

  // ---- transport ----------------------------------------------------------

  private onConnection(channel: Channel, sock: net.Socket) {
    this.sockets.add(sock);
    sock.on("close", () => this.sockets.delete(sock));
    sock.on("error", () => sock.destroy());
    let buf = "";
    let chain: Promise<void> = Promise.resolve();
    sock.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      if (Buffer.byteLength(buf) > MAX_MESSAGE_BYTES) {
        sock.end(JSON.stringify({ id: null, ok: false, error: "too_large" }) + "\n");
        sock.destroy();
        return;
      }
      let i: number;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        if (!line.trim()) continue;
        chain = chain.then(async () => {
          const res = await this.respond(channel, line);
          if (!sock.destroyed) sock.write(JSON.stringify(res) + "\n");
        });
      }
    });
  }

  private async respond(channel: Channel, line: string): Promise<Response> {
    let id: Request["id"] | null = null;
    try {
      const req = parseRequest(line);
      id = req.id;
      const result = channel === "ai" ? await this.handleAi(req) : await this.handleAdmin(req);
      return { id, ok: true, result };
    } catch (e) {
      if (e instanceof ProtocolError) return { id, ok: false, error: e.code, message: e.message };
      // Anything else is unexpected: do not leak internals.
      return { id, ok: false, error: "request_failed", message: e instanceof Error ? e.message.slice(0, 200) : "error" };
    }
  }

  private async authFailed(channel: Channel): Promise<never> {
    const b = this.backoff[channel];
    b.fail();
    const d = b.delay();
    if (d) await sleep(d);
    throw new ProtocolError("unauthorized", "unauthorized");
  }

  // ---- ai channel: passport-scoped access only -------------------------------

  private async handleAi(req: Request): Promise<unknown> {
    if (!(AI_OPS as readonly string[]).includes(req.op)) throw new ProtocolError("unknown_op", req.op);
    if (!this.vault) throw new ProtocolError("vault_locked", "vault is locked; ask the owner to unlock it");
    if (!req.token) return this.authFailed("ai");
    let scoped: ScopedVault;
    try {
      scoped = this.vault.authenticate(req.token);
    } catch {
      return this.authFailed("ai");
    }
    this.backoff.ai.reset();
    this.touch();
    const a = req.args;
    const filter = (): ListFilter => ({
      type: str(a, "type", false) as RecordType | undefined,
      tag: str(a, "tag", false),
      limit: int(a, "limit"),
    });
    switch (req.op) {
      case "search": return scoped.search(str(a, "query")!, filter()).map(publicRecord);
      case "list": return scoped.list(filter()).map(publicRecord);
      case "get": { const r = scoped.get(str(a, "id")!); return r ? publicRecord(r) : null; }
      case "add": {
        if (!a.data || typeof a.data !== "object" || Array.isArray(a.data)) throw new ProtocolError("bad_request", "data must be an object");
        const rec = scoped.add({
          type: str(a, "type")! as RecordType,
          data: a.data as Record<string, unknown>,
          tags: strList(a, "tags"),
          sensitivity: str(a, "sensitivity", false) as Sensitivity | undefined,
        });
        return { id: rec.id, status: "pending" }; // never echoes the record back
      }
    }
    throw new ProtocolError("unknown_op", req.op);
  }

  // ---- admin channel: owner only ---------------------------------------------

  private async handleAdmin(req: Request): Promise<unknown> {
    if (!req.secret || !safeEqual(req.secret, this.secret)) return this.authFailed("admin");
    if (!(ADMIN_OPS as readonly string[]).includes(req.op)) throw new ProtocolError("unknown_op", req.op);
    const a = req.args;
    if (req.op === "status") return { locked: this.locked };
    if (req.op === "lock") { this.lock(); return { locked: true }; }
    if (req.op === "unlock") {
      if (this.vault) throw new ProtocolError("already_unlocked", "vault is already unlocked");
      try {
        this.vault = await Vault.open(this.o.vaultPath, str(a, "passphrase")!);
      } catch {
        return this.authFailed("admin"); // wrong passphrase shares the admin backoff
      }
      this.backoff.admin.reset();
      this.touch();
      return { locked: false };
    }
    this.backoff.admin.reset();
    const v = this.vault;
    if (!v) throw new ProtocolError("vault_locked", "vault is locked");
    this.touch();
    switch (req.op) {
      case "pending": return v.list({ status: "pending", limit: int(a, "limit") ?? 200 });
      case "approve": return v.approve(str(a, "id")!);
      case "reject": {
        const id = str(a, "id")!;
        if (!v.list({ status: "pending", ids: [id], limit: 1 }).length) throw new ProtocolError("not_pending", "no such pending record");
        v.remove(id);
        return { removed: id };
      }
      case "grant": {
        if (!a.scopes || typeof a.scopes !== "object" || Array.isArray(a.scopes)) throw new ProtocolError("bad_request", "scopes must be an object");
        return v.createPassport({ label: str(a, "label")!, scopes: a.scopes as any, expiresAt: str(a, "expiresAt", false) ?? null });
      }
      case "revoke": return v.revokePassport(str(a, "id")!);
      case "passports": return v.listPassports(a.includeRevoked === true);
      case "audit": return v.auditLog(int(a, "limit") ?? 100);
    }
    throw new ProtocolError("unknown_op", req.op);
  }
}

/** What an AI may see of a record: no status, nothing internal. */
function publicRecord(r: VaultRecord) {
  return {
    id: r.id, type: r.type, data: r.data, tags: r.tags, sensitivity: r.sensitivity,
    source: r.source, createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

function isListening(address: string): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect(address);
    sock.once("connect", () => { sock.destroy(); resolve(true); });
    sock.once("error", () => resolve(false));
  });
}

function restrictToCurrentUser(file: string) {
  if (process.platform !== "win32") return;
  try {
    const user = process.env.USERNAME;
    if (user) execFileSync("icacls", [file, "/inheritance:r", "/grant:r", `${user}:F`], { stdio: "ignore" });
  } catch { /* best effort; the secret is still random and per-run */ }
}
