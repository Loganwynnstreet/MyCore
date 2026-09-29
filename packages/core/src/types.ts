export const RECORD_TYPES = [
  "profile", "person", "event", "memory", "ai_account", "usage", "conversation_ref",
] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

export const SENSITIVITIES = ["public", "personal", "private", "secret"] as const;
export type Sensitivity = (typeof SENSITIVITIES)[number];

/** `pending` = written by an AI, awaiting user approval. */
export type RecordStatus = "active" | "pending";

export interface VaultRecord {
  id: string;
  type: RecordType;
  data: Record<string, unknown>;
  tags: string[];
  sensitivity: Sensitivity;
  status: RecordStatus;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface NewRecord {
  type: RecordType;
  data: Record<string, unknown>;
  tags?: string[];
  sensitivity?: Sensitivity;
  status?: RecordStatus;
  source?: string;
}

export interface ListFilter {
  type?: RecordType;
  /** Match any of these types (combined with `type` by intersection). */
  types?: RecordType[];
  ids?: string[];
  tag?: string;
  /** Match records carrying at least one of these tags. */
  tagsAny?: string[];
  status?: RecordStatus;
  /** Highest sensitivity to include (inclusive). */
  maxSensitivity?: Sensitivity;
  limit?: number;
}

export interface AuditEntry {
  id: number;
  ts: string;
  actor: string;
  action: string;
  recordId: string | null;
  detail: string | null;
}

export interface PassportScope {
  /** Record types this passport can access */
  types?: RecordType[];
  /** Tags this passport can access */
  tags?: string[];
  /** Maximum sensitivity level (inclusive) */
  maxSensitivity?: Sensitivity;
  /** Read access */
  read?: boolean;
  /** Write access */
  write?: boolean;
}

export interface Passport {
  id: string;
  label: string;
  scopes: PassportScope;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface NewPassport {
  label: string;
  scopes: PassportScope;
  expiresAt?: string | null;
}
