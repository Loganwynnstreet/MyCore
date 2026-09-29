/** Wire protocol: newline-delimited JSON, one response per request. */

export const MAX_MESSAGE_BYTES = 1024 * 1024;

export type Channel = "ai" | "admin";

export const AI_OPS = ["search", "list", "get", "add"] as const;
export const ADMIN_OPS = [
  "status", "unlock", "lock", "pending", "approve", "reject", "grant", "revoke", "passports", "audit",
] as const;

export interface Request {
  id: string | number;
  op: string;
  /** Passport bearer token (ai channel). */
  token?: string;
  /** Owner secret (admin channel). */
  secret?: string;
  args: Record<string, unknown>;
}

export type Response =
  | { id: string | number | null; ok: true; result: unknown }
  | { id: string | number | null; ok: false; error: string; message?: string };

const ALLOWED_KEYS = new Set(["id", "op", "token", "secret", "args"]);

/** Strict parse: unknown fields, wrong types and non-objects are all rejected. */
export function parseRequest(line: string): Request {
  let raw: unknown;
  try { raw = JSON.parse(line); } catch { throw new ProtocolError("bad_request", "invalid JSON"); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ProtocolError("bad_request", "request must be an object");
  const r = raw as Record<string, unknown>;
  for (const k of Object.keys(r)) if (!ALLOWED_KEYS.has(k)) throw new ProtocolError("bad_request", `unknown field: ${k}`);
  if (typeof r.id !== "string" && typeof r.id !== "number") throw new ProtocolError("bad_request", "id required");
  if (typeof r.op !== "string") throw new ProtocolError("bad_request", "op required");
  if (r.token !== undefined && typeof r.token !== "string") throw new ProtocolError("bad_request", "token must be a string");
  if (r.secret !== undefined && typeof r.secret !== "string") throw new ProtocolError("bad_request", "secret must be a string");
  const args = r.args ?? {};
  if (typeof args !== "object" || Array.isArray(args) || args === null) throw new ProtocolError("bad_request", "args must be an object");
  return { id: r.id, op: r.op, token: r.token as string | undefined, secret: r.secret as string | undefined, args: args as Record<string, unknown> };
}

export class ProtocolError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

// ---- argument helpers (throw ProtocolError on bad input) ----
export const str = (a: Record<string, unknown>, k: string, required = true): string | undefined => {
  const v = a[k];
  if (v === undefined || v === null) { if (required) throw new ProtocolError("bad_request", `${k} required`); return undefined; }
  if (typeof v !== "string") throw new ProtocolError("bad_request", `${k} must be a string`);
  return v;
};
export const strList = (a: Record<string, unknown>, k: string): string[] | undefined => {
  const v = a[k];
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) throw new ProtocolError("bad_request", `${k} must be a string array`);
  return v as string[];
};
export const int = (a: Record<string, unknown>, k: string): number | undefined => {
  const v = a[k];
  if (v === undefined) return undefined;
  if (!Number.isInteger(v) || (v as number) < 1) throw new ProtocolError("bad_request", `${k} must be a positive integer`);
  return v as number;
};
