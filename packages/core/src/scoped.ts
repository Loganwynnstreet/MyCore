import type { Vault } from "./vault.js";
import {
  SENSITIVITIES,
  type ListFilter, type NewRecord, type Passport, type Sensitivity, type VaultRecord,
} from "./types.js";

const MAX_LIMIT = 200;
/** Hard ceiling regardless of what a stored passport says: `secret` is never served. */
const HARD_CEILING = "private" as const;

/**
 * A view of the vault restricted by a passport. This is the only sanctioned way for
 * an AI-facing surface (MCP, etc.) to touch vault data. Every method re-checks that
 * the passport is still valid, so revocation takes effect immediately, and every
 * call is audited under the passport.
 */
export class ScopedVault {
  constructor(private vault: Vault, private passport: Passport) {}

  get actor() { return `passport:${this.passport.id}`; }
  get label() { return this.passport.label; }

  list(f: ListFilter = {}): VaultRecord[] {
    const scoped = this.readFilter(f);
    const out = this.vault.list(scoped);
    this.vault.audit("scoped.list", this.actor, undefined, `${out.length}`);
    return out;
  }

  search(query: string, f: ListFilter = {}): VaultRecord[] {
    const scoped = this.readFilter(f);
    const out = this.vault.search(query, scoped);
    this.vault.audit("scoped.search", this.actor, undefined, `${out.length}`);
    return out;
  }

  /** Returns undefined for records that do not exist *or* are outside the scope. */
  get(id: string): VaultRecord | undefined {
    const [rec] = this.vault.list({ ...this.readFilter({}), ids: [id], limit: 1 });
    this.vault.audit("scoped.get", this.actor, id, rec ? "ok" : "denied");
    return rec;
  }

  /** Writes are always queued as `pending` for the owner to approve. */
  add(input: Omit<NewRecord, "status" | "source">): VaultRecord {
    const s = this.check().scopes;
    if (!s.write) throw new Error("Passport does not allow writes");
    if (s.types && !s.types.includes(input.type)) throw new Error(`Passport cannot write type: ${input.type}`);
    const sensitivity = input.sensitivity ?? "personal";
    if (rank(sensitivity) > ceilingOf(s.maxSensitivity)) throw new Error("Sensitivity exceeds passport ceiling");
    const tags = input.tags ?? [];
    if (s.tags && !tags.some((t) => s.tags!.includes(t))) throw new Error("Record must carry a tag permitted by the passport");
    return this.vault.add({ ...input, tags, sensitivity, status: "pending", source: this.actor }, this.actor);
  }

  private check(): Passport {
    const p = this.vault.getPassport(this.passport.id);
    if (!p || p.revokedAt || (p.expiresAt && Date.parse(p.expiresAt) <= Date.now())) {
      throw new Error("Invalid, revoked or expired passport");
    }
    return p;
  }

  private readFilter(f: ListFilter): ListFilter {
    const s = this.check().scopes;
    if (!s.read) throw new Error("Passport does not allow reads");
    const ceiling = ceilingOf(s.maxSensitivity);
    const requested = f.maxSensitivity ? rank(f.maxSensitivity) : ceiling;
    return {
      ...f,
      status: "active", // pending records are never visible through a passport
      types: s.types,
      tagsAny: s.tags,
      maxSensitivity: SENSITIVITIES[Math.min(requested, ceiling)],
      limit: Math.min(f.limit ?? 50, MAX_LIMIT),
    };
  }
}

const rank = (s: Sensitivity) => SENSITIVITIES.indexOf(s);
const ceilingOf = (s: Sensitivity | undefined) => Math.min(rank(s ?? "personal"), rank(HARD_CEILING));
