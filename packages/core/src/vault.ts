import Database from "better-sqlite3-multiple-ciphers";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import * as C from "./crypto.js";
import {
  RECORD_TYPES, SENSITIVITIES,
  type AuditEntry, type ListFilter, type NewPassport, type NewRecord, type Passport, type PassportScope, type RecordType, type Sensitivity, type VaultRecord,
} from "./types.js";
import { ScopedVault } from "./scoped.js";

const SCHEMA_VERSION = 3;
const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
const keyPath = (p: string) => `${p}.keys`;
const hex = (u: Uint8Array) => Buffer.from(u).toString("hex");

export interface CreateOptions {
  /** Cheaper KDF; for tests only. */
  fastKdf?: boolean;
}

export class Vault {
  private constructor(
    private db: Database.Database,
    private masterKey: Uint8Array,
    private keyFile: C.KeyFile,
    readonly path: string,
  ) {}

  /** Creates a new vault. The recovery phrase is returned once and never stored. */
  static async create(path: string, passphrase: string, opts: CreateOptions = {}) {
    if (existsSync(path) || existsSync(keyPath(path))) throw new Error(`Vault already exists: ${path}`);
    if (passphrase.length < 8) throw new Error("Passphrase must be at least 8 characters");
    const s = await C.ready();
    const masterKey = s.randombytes_buf(32);
    const kdf = C.newKdf(s, opts.fastKdf);
    const recovery = C.newRecoveryKey(s);
    const keyFile: C.KeyFile = {
      version: 1,
      kdf,
      byPassphrase: C.wrap(s, C.deriveKek(s, passphrase, kdf), masterKey),
      byRecovery: C.wrap(s, recovery.key, masterKey),
    };
    writeFileSync(keyPath(path), JSON.stringify(keyFile, null, 2));
    const vault = new Vault(Vault.openDb(path, masterKey), masterKey, keyFile, path);
    vault.migrate();
    vault.audit("vault.create", "owner");
    return { vault, recoveryPhrase: recovery.phrase };
  }

  static async open(path: string, passphrase: string): Promise<Vault> {
    const s = await C.ready();
    const keyFile = Vault.readKeyFile(path);
    const kek = C.deriveKek(s, passphrase, keyFile.kdf);
    return Vault.unlock(path, keyFile, () => C.unwrap(s, kek, keyFile.byPassphrase));
  }

  static async openWithRecovery(path: string, phrase: string): Promise<Vault> {
    const s = await C.ready();
    const keyFile = Vault.readKeyFile(path);
    const rk = C.recoveryKeyFromPhrase(phrase);
    return Vault.unlock(path, keyFile, () => C.unwrap(s, rk, keyFile.byRecovery));
  }

  private static readKeyFile(path: string): C.KeyFile {
    if (!existsSync(path) || !existsSync(keyPath(path))) throw new Error(`Vault not found: ${path}`);
    return JSON.parse(readFileSync(keyPath(path), "utf8")) as C.KeyFile;
  }

  private static unlock(path: string, keyFile: C.KeyFile, getKey: () => Uint8Array): Vault {
    let masterKey: Uint8Array;
    try {
      masterKey = getKey();
    } catch {
      throw new Error("Wrong passphrase or recovery phrase");
    }
    const vault = new Vault(Vault.openDb(path, masterKey), masterKey, keyFile, path);
    vault.migrate();
    vault.audit("vault.unlock", "owner");
    return vault;
  }

  private static openDb(path: string, masterKey: Uint8Array) {
    const db = new Database(path);
    db.pragma("cipher='sqlcipher'");
    db.pragma("legacy=4");
    db.pragma(`key="x'${hex(masterKey)}'"`);
    try {
      db.prepare("SELECT count(*) FROM sqlite_master").get();
    } catch {
      db.close();
      throw new Error("Vault file is corrupt or the key does not match");
    }
    db.pragma("journal_mode=WAL");
    db.pragma("foreign_keys=ON");
    return db;
  }

  private migrate() {
    const v = this.db.pragma("user_version", { simple: true }) as number;
    if (v > SCHEMA_VERSION) throw new Error(`Vault schema v${v} is newer than supported v${SCHEMA_VERSION}`);
    if (v < 1) {
      this.db.exec(`
        CREATE TABLE records (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          data TEXT NOT NULL,
          tags TEXT NOT NULL DEFAULT '[]',
          sensitivity TEXT NOT NULL DEFAULT 'personal',
          status TEXT NOT NULL DEFAULT 'active',
          source TEXT NOT NULL DEFAULT 'user',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX records_type ON records(type, status);
        CREATE VIRTUAL TABLE records_fts USING fts5(id UNINDEXED, body);
        CREATE TABLE audit (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ts TEXT NOT NULL,
          actor TEXT NOT NULL,
          action TEXT NOT NULL,
          record_id TEXT,
          detail TEXT
        );
        PRAGMA user_version = 1;
      `);
    }
    if (v < 2) {
      this.db.exec(`
        CREATE TABLE passports (
          id TEXT PRIMARY KEY,
          label TEXT NOT NULL,
          scopes TEXT NOT NULL,
          created_at TEXT NOT NULL,
          expires_at TEXT,
          revoked_at TEXT
        );
        CREATE INDEX passports_revoked ON passports(revoked_at);
        PRAGMA user_version = 2;
      `);
    }
    if (v < 3) {
      // Passports created under v2 have no token and can never authenticate; re-grant them.
      this.db.exec(`
        ALTER TABLE passports ADD COLUMN token_hash TEXT;
        CREATE UNIQUE INDEX passports_token ON passports(token_hash);
        PRAGMA user_version = ${SCHEMA_VERSION};
      `);
    }
  }

  // ---- records ---------------------------------------------------------

  add(input: NewRecord, actor = "owner"): VaultRecord {
    if (!RECORD_TYPES.includes(input.type)) throw new Error(`Unknown record type: ${input.type}`);
    const sensitivity = input.sensitivity ?? "personal";
    if (!SENSITIVITIES.includes(sensitivity)) throw new Error(`Unknown sensitivity: ${sensitivity}`);
    const now = new Date().toISOString();
    const rec: VaultRecord = {
      id: randomUUID(),
      type: input.type,
      data: input.data,
      tags: [...new Set(input.tags ?? [])],
      sensitivity,
      status: input.status ?? "active",
      source: input.source ?? actor,
      createdAt: now,
      updatedAt: now,
    };
    this.db.transaction(() => {
      this.insertRecord(rec);
      this.audit("record.add", actor, rec.id, rec.type);
    })();
    return rec;
  }

  private insertRecord(rec: VaultRecord) {
    this.db.prepare(
      `INSERT INTO records (id,type,data,tags,sensitivity,status,source,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).run(rec.id, rec.type, JSON.stringify(rec.data), JSON.stringify(rec.tags), rec.sensitivity,
      rec.status, rec.source, rec.createdAt, rec.updatedAt);
    if (rec.status === "active") this.index(rec);
  }

  /** Runs `fn` atomically; any throw rolls everything back. */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  /**
   * Every record matching the filter, with no row limit. Use this for export/backup;
   * `list` is capped and would silently truncate.
   */
  all(f: Omit<ListFilter, "limit"> = {}): VaultRecord[] {
    const { where, args } = this.filterSql(f);
    return this.db.prepare(`SELECT * FROM records ${where} ORDER BY created_at, id`).all(...args).map(toRecord);
  }

  /**
   * Restores records (e.g. from an export), keeping their ids and timestamps.
   * Idempotent: ids already present are skipped. All-or-nothing: one invalid
   * record aborts the whole batch.
   */
  importRecords(records: unknown[], actor = "import"): { added: number; skipped: number } {
    return this.transaction(() => {
      let added = 0, skipped = 0;
      for (const [i, raw] of records.entries()) {
        const rec = parseRecord(raw, i);
        if (this.db.prepare("SELECT 1 FROM records WHERE id=?").get(rec.id)) { skipped++; continue; }
        this.insertRecord(rec);
        added++;
      }
      this.audit("records.import", actor, undefined, `added=${added} skipped=${skipped}`);
      return { added, skipped };
    });
  }

  get(id: string, actor = "owner"): VaultRecord | undefined {
    const row = this.db.prepare("SELECT * FROM records WHERE id=?").get(id);
    if (row) this.audit("record.get", actor, id);
    return row ? toRecord(row) : undefined;
  }

  update(id: string, patch: Partial<Pick<NewRecord, "data" | "tags" | "sensitivity">>, actor = "owner"): VaultRecord {
    const cur = this.db.prepare("SELECT * FROM records WHERE id=?").get(id);
    if (!cur) throw new Error(`No such record: ${id}`);
    const rec = toRecord(cur);
    if (patch.sensitivity && !SENSITIVITIES.includes(patch.sensitivity)) throw new Error("Unknown sensitivity");
    const next: VaultRecord = {
      ...rec,
      data: patch.data ?? rec.data,
      tags: patch.tags ? [...new Set(patch.tags)] : rec.tags,
      sensitivity: patch.sensitivity ?? rec.sensitivity,
      updatedAt: new Date().toISOString(),
    };
    this.db.transaction(() => {
      this.db.prepare("UPDATE records SET data=?,tags=?,sensitivity=?,updated_at=? WHERE id=?")
        .run(JSON.stringify(next.data), JSON.stringify(next.tags), next.sensitivity, next.updatedAt, id);
      this.db.prepare("DELETE FROM records_fts WHERE id=?").run(id);
      if (next.status === "active") this.index(next);
      this.audit("record.update", actor, id);
    })();
    return next;
  }

  remove(id: string, actor = "owner"): boolean {
    return this.db.transaction(() => {
      const n = this.db.prepare("DELETE FROM records WHERE id=?").run(id).changes;
      this.db.prepare("DELETE FROM records_fts WHERE id=?").run(id);
      if (n) this.audit("record.remove", actor, id);
      return n > 0;
    })();
  }

  /** Approve a pending record written by an AI. */
  approve(id: string): VaultRecord {
    return this.db.transaction(() => {
      const n = this.db.prepare("UPDATE records SET status='active', updated_at=? WHERE id=? AND status='pending'")
        .run(new Date().toISOString(), id).changes;
      if (!n) throw new Error(`No pending record: ${id}`);
      const rec = toRecord(this.db.prepare("SELECT * FROM records WHERE id=?").get(id));
      this.index(rec);
      this.audit("record.approve", "owner", id);
      return rec;
    })();
  }

  list(f: ListFilter = {}): VaultRecord[] {
    const { where, args } = this.filterSql(f);
    const rows = this.db.prepare(
      `SELECT * FROM records ${where} ORDER BY updated_at DESC LIMIT ?`,
    ).all(...args, f.limit ?? 100);
    return rows.map(toRecord);
  }

  /** Full-text search over record contents. Query is treated as plain words, not FTS syntax. */
  search(query: string, f: ListFilter = {}): VaultRecord[] {
    const terms = query.match(/[\p{L}\p{N}]+/gu);
    if (!terms) return [];
    const match = terms.map((t) => `"${t}"*`).join(" ");
    const { where, args } = this.filterSql(f, "r.");
    const rows = this.db.prepare(
      `SELECT r.* FROM records_fts JOIN records r ON r.id = records_fts.id
       ${where} AND records_fts MATCH ?
       ORDER BY rank LIMIT ?`,
    ).all(...args, match, f.limit ?? 20);
    return rows.map(toRecord);
  }

  private filterSql(f: ListFilter, p = "") {
    const w: string[] = [];
    const args: unknown[] = [];
    if (f.type) { w.push(`${p}type=?`); args.push(f.type); }
    if (f.ids) {
      w.push(`${p}id IN (${f.ids.map(() => "?").join(",") || "NULL"})`);
      args.push(...f.ids);
    }
    if (f.types) {
      // An empty list matches nothing (fail closed).
      w.push(`${p}type IN (${f.types.map(() => "?").join(",") || "NULL"})`);
      args.push(...f.types);
    }
    if (f.tagsAny) {
      w.push(`EXISTS (SELECT 1 FROM json_each(${p}tags) WHERE value IN (${f.tagsAny.map(() => "?").join(",") || "NULL"}))`);
      args.push(...f.tagsAny);
    }
    w.push(`${p}status=?`); args.push(f.status ?? "active");
    if (f.tag) { w.push(`EXISTS (SELECT 1 FROM json_each(${p}tags) WHERE value=?)`); args.push(f.tag); }
    if (f.maxSensitivity) {
      const allowed = SENSITIVITIES.slice(0, SENSITIVITIES.indexOf(f.maxSensitivity) + 1);
      w.push(`${p}sensitivity IN (${allowed.map(() => "?").join(",")})`);
      args.push(...allowed);
    }
    return { where: `WHERE ${w.join(" AND ")}`, args };
  }

  private index(rec: VaultRecord) {
    const body = [...flatten(rec.data), ...rec.tags, rec.type].join(" ");
    this.db.prepare("INSERT INTO records_fts (id, body) VALUES (?,?)").run(rec.id, body);
  }

  // ---- audit -----------------------------------------------------------

  audit(action: string, actor: string, recordId?: string, detail?: string) {
    this.db.prepare("INSERT INTO audit (ts,actor,action,record_id,detail) VALUES (?,?,?,?,?)")
      .run(new Date().toISOString(), actor, action, recordId ?? null, detail ?? null);
  }

  auditLog(limit = 100): AuditEntry[] {
    return this.db.prepare("SELECT * FROM audit ORDER BY id DESC LIMIT ?").all(limit).map((r: any) => ({
      id: r.id, ts: r.ts, actor: r.actor, action: r.action, recordId: r.record_id, detail: r.detail,
    }));
  }

  // ---- passports --------------------------------------------------------

  /** Creates a passport. The bearer token is returned once; only its hash is stored. */
  createPassport(input: NewPassport): { passport: Passport; token: string } {
    const scopes = validateScopes(input.scopes);
    if (input.expiresAt && Number.isNaN(Date.parse(input.expiresAt))) throw new Error("Invalid expiry date");
    const now = new Date().toISOString();
    const token = `mcp_${randomBytes(32).toString("base64url")}`;
    const passport: Passport = {
      id: randomUUID(),
      label: input.label,
      scopes,
      createdAt: now,
      expiresAt: input.expiresAt ?? null,
      revokedAt: null,
    };
    this.db.transaction(() => {
      this.db.prepare(
        `INSERT INTO passports (id,label,scopes,created_at,expires_at,revoked_at,token_hash)
         VALUES (?,?,?,?,?,?,?)`,
      ).run(passport.id, passport.label, JSON.stringify(scopes), now, passport.expiresAt, null, hashToken(token));
      this.audit("passport.create", "owner", passport.id, passport.label);
    })();
    return { passport, token };
  }

  /**
   * Exchanges a bearer token for a scoped view of the vault. All access through the
   * returned view is limited by, and audited under, the passport.
   */
  authenticate(token: string): ScopedVault {
    const row = this.db.prepare("SELECT * FROM passports WHERE token_hash=?").get(hashToken(token));
    const passport = row ? toPassport(row) : undefined;
    if (!passport || !isActive(passport)) {
      this.audit("passport.auth_failed", "unknown");
      throw new Error("Invalid, revoked or expired passport");
    }
    return new ScopedVault(this, passport);
  }

  getPassport(id: string): Passport | undefined {
    const row = this.db.prepare("SELECT * FROM passports WHERE id=?").get(id);
    return row ? toPassport(row) : undefined;
  }

  listPassports(includeRevoked = false): Passport[] {
    const rows = includeRevoked
      ? this.db.prepare("SELECT * FROM passports ORDER BY created_at DESC").all()
      : this.db.prepare("SELECT * FROM passports WHERE revoked_at IS NULL ORDER BY created_at DESC").all();
    return rows.map(toPassport);
  }

  revokePassport(id: string): Passport {
    const cur = this.db.prepare("SELECT * FROM passports WHERE id=?").get(id);
    if (!cur) throw new Error(`No such passport: ${id}`);
    const passport = toPassport(cur);
    if (passport.revokedAt) throw new Error(`Passport already revoked: ${id}`);
    const now = new Date().toISOString();
    this.db.transaction(() => {
      this.db.prepare("UPDATE passports SET revoked_at=? WHERE id=?").run(now, id);
      this.audit("passport.revoke", "owner", id, passport.label);
    })();
    return { ...passport, revokedAt: now };
  }

  // ---- keys ------------------------------------------------------------

  async changePassphrase(newPassphrase: string, opts: CreateOptions = {}) {
    if (newPassphrase.length < 8) throw new Error("Passphrase must be at least 8 characters");
    const s = await C.ready();
    const kdf = C.newKdf(s, opts.fastKdf);
    this.keyFile = {
      ...this.keyFile, kdf,
      byPassphrase: C.wrap(s, C.deriveKek(s, newPassphrase, kdf), this.masterKey),
    };
    const tmp = `${keyPath(this.path)}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.keyFile, null, 2));
    renameSync(tmp, keyPath(this.path));
    this.audit("vault.change_passphrase", "owner");
  }

  close() {
    this.audit("vault.lock", "owner");
    this.db.close();
    this.masterKey.fill(0);
  }
}

function toRecord(r: any): VaultRecord {
  return {
    id: r.id, type: r.type as RecordType, data: JSON.parse(r.data), tags: JSON.parse(r.tags),
    sensitivity: r.sensitivity as Sensitivity, status: r.status, source: r.source,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

function parseRecord(raw: unknown, i: number): VaultRecord {
  const bad = (m: string): never => { throw new Error(`Record #${i}: ${m}`); };
  if (!raw || typeof raw !== "object") return bad("not an object");
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !/^[0-9a-f-]{36}$/i.test(r.id)) bad("missing or invalid id");
  if (!RECORD_TYPES.includes(r.type as RecordType)) bad(`unknown type ${String(r.type)}`);
  if (!SENSITIVITIES.includes(r.sensitivity as Sensitivity)) bad("unknown sensitivity");
  if (r.status !== "active" && r.status !== "pending") bad("unknown status");
  if (!r.data || typeof r.data !== "object" || Array.isArray(r.data)) bad("data must be an object");
  if (!Array.isArray(r.tags) || r.tags.some((t) => typeof t !== "string")) bad("tags must be strings");
  const now = new Date().toISOString();
  const ts = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : now);
  return {
    id: r.id as string, type: r.type as RecordType, data: r.data as Record<string, unknown>,
    tags: [...new Set(r.tags as string[])], sensitivity: r.sensitivity as Sensitivity,
    status: r.status as VaultRecord["status"],
    source: typeof r.source === "string" ? r.source : "import",
    createdAt: ts(r.createdAt), updatedAt: ts(r.updatedAt),
  };
}

function isActive(p: Passport): boolean {
  return !p.revokedAt && !(p.expiresAt && Date.parse(p.expiresAt) <= Date.now());
}

/** Normalises scopes and fails closed: nothing is granted unless explicit. */
function validateScopes(s: PassportScope): PassportScope {
  const bad = (m: string) => { throw new Error(`Invalid passport scope: ${m}`); };
  for (const t of s.types ?? []) if (!RECORD_TYPES.includes(t)) bad(`unknown type ${t}`);
  if (s.maxSensitivity && !SENSITIVITIES.includes(s.maxSensitivity)) bad(`unknown sensitivity ${s.maxSensitivity}`);
  if (s.maxSensitivity === "secret") bad("passports can never access 'secret' records");
  if (!s.read && !s.write) bad("grant at least one of read or write");
  return {
    types: s.types, tags: s.tags,
    maxSensitivity: s.maxSensitivity ?? "personal",
    read: !!s.read, write: !!s.write,
  };
}

function toPassport(r: any): Passport {
  return {
    id: r.id,
    label: r.label,
    scopes: JSON.parse(r.scopes) as PassportScope,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    revokedAt: r.revoked_at,
  };
}

function* flatten(v: unknown): Generator<string> {
  if (v == null) return;
  if (typeof v === "object") { for (const x of Object.values(v)) yield* flatten(x); }
  else yield String(v);
}
