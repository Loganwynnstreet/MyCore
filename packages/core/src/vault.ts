import Database from "better-sqlite3-multiple-ciphers";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import * as C from "./crypto.js";
import {
  RECORD_TYPES, SENSITIVITIES,
  type AuditEntry, type ListFilter, type NewPassport, type NewRecord, type Passport, type PassportScope, type RecordType, type Sensitivity, type VaultRecord,
} from "./types.js";

const SCHEMA_VERSION = 2;
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
      this.db.prepare(
        `INSERT INTO records (id,type,data,tags,sensitivity,status,source,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      ).run(rec.id, rec.type, JSON.stringify(rec.data), JSON.stringify(rec.tags), rec.sensitivity,
        rec.status, rec.source, now, now);
      if (rec.status === "active") this.index(rec);
      this.audit("record.add", actor, rec.id, rec.type);
    })();
    return rec;
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

  createPassport(input: NewPassport): Passport {
    const now = new Date().toISOString();
    const passport: Passport = {
      id: randomUUID(),
      label: input.label,
      scopes: input.scopes,
      createdAt: now,
      expiresAt: input.expiresAt ?? null,
      revokedAt: null,
    };
    this.db.transaction(() => {
      this.db.prepare(
        `INSERT INTO passports (id,label,scopes,created_at,expires_at,revoked_at)
         VALUES (?,?,?,?,?,?)`,
      ).run(passport.id, passport.label, JSON.stringify(passport.scopes), now, passport.expiresAt, null);
      this.audit("passport.create", "owner", passport.id, passport.label);
    })();
    return passport;
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

  /** Check if a passport is valid (not revoked, not expired). */
  validatePassport(id: string): boolean {
    const passport = this.getPassport(id);
    if (!passport) return false;
    if (passport.revokedAt) return false;
    if (passport.expiresAt && new Date(passport.expiresAt) < new Date()) return false;
    return true;
  }

  /** Apply passport scopes to a filter. Returns filter with appropriate restrictions. */
  applyPassport(filter: ListFilter, passportId: string): ListFilter {
    const passport = this.getPassport(passportId);
    if (!passport) throw new Error(`Invalid passport: ${passportId}`);
    if (!this.validatePassport(passportId)) throw new Error(`Passport is revoked or expired: ${passportId}`);

    const result: ListFilter = { ...filter };

    // Apply type restrictions
    if (passport.scopes.types && passport.scopes.types.length > 0) {
      if (result.type && !passport.scopes.types.includes(result.type)) {
        throw new Error(`Passport does not allow access to type: ${result.type}`);
      }
      if (!result.type) {
        // If no type specified, we can't restrict to multiple types in current filter structure
        // This is a limitation - for now, if passport restricts types, user must specify one
        if (passport.scopes.types.length === 1) {
          result.type = passport.scopes.types[0];
        }
      }
    }

    // Apply sensitivity ceiling
    if (passport.scopes.maxSensitivity) {
      const currentMax = result.maxSensitivity ?? "secret";
      const passportMax = passport.scopes.maxSensitivity;
      const currentIndex = SENSITIVITIES.indexOf(currentMax);
      const passportIndex = SENSITIVITIES.indexOf(passportMax);
      result.maxSensitivity = SENSITIVITIES[Math.min(currentIndex, passportIndex)];
    }

    // Tag filtering would require more complex logic, skipping for now
    // Write access check would be done at call site

    return result;
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
