import type { Vault } from "./vault.js";
import { SENSITIVITIES, type RecordType, type Sensitivity, type VaultRecord } from "./types.js";

export interface ExportOptions {
  types?: RecordType[];
  tags?: string[];
  /** Highest sensitivity to include. Defaults to `private`; `secret` needs `includeSecret`. */
  maxSensitivity?: Sensitivity;
  /** Explicit opt-in: the export is plaintext, so secrets are excluded by default. */
  includeSecret?: boolean;
  /** Include records awaiting approval. */
  includePending?: boolean;
}

export interface ExportEnvelope {
  format: "mycore-export";
  version: 1;
  exportedAt: string;
  count: number;
  /** True when secret records were included; the file must be protected accordingly. */
  containsSecrets: boolean;
  records: VaultRecord[];
}

/** Exports every matching record (not capped) as a versioned, re-importable envelope. */
export function exportRecords(vault: Vault, o: ExportOptions = {}): ExportEnvelope {
  if (o.maxSensitivity === "secret" && !o.includeSecret) {
    throw new Error("Exporting 'secret' records requires includeSecret");
  }
  const max: Sensitivity = o.includeSecret ? "secret" : (o.maxSensitivity ?? "private");
  if (!SENSITIVITIES.includes(max)) throw new Error(`Unknown sensitivity: ${max}`);
  const filter = { types: o.types, tagsAny: o.tags, maxSensitivity: max };
  const records = vault.all({ ...filter, status: "active" });
  if (o.includePending) records.push(...vault.all({ ...filter, status: "pending" }));
  vault.audit("records.export", "owner", undefined, `count=${records.length} secrets=${!!o.includeSecret}`);
  return {
    format: "mycore-export", version: 1, exportedAt: new Date().toISOString(),
    count: records.length, containsSecrets: !!o.includeSecret, records,
  };
}
