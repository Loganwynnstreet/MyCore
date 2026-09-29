import { Command } from "commander";
import type { AuditEntry } from "@mycore/core";
import { adminCall, run } from "../daemon.js";

export const auditCommand = new Command("audit")
  .description("Show recent vault activity, including everything AIs did")
  .option("-n, --limit <n>", "Number of entries", "50")
  .action((o) => run(async () => {
    const limit = Number(o.limit);
    if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit must be a positive integer");
    const log = await adminCall<AuditEntry[]>("audit", { limit });
    for (const e of log) console.log(`${e.ts}  ${e.actor.padEnd(46)} ${e.action}${e.detail ? `  ${e.detail}` : ""}`);
  })());
