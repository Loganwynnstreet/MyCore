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
  tag?: string;
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
