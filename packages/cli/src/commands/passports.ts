import { Command } from "commander";
import type { Passport } from "@mycore/core";
import { adminCall, run } from "../daemon.js";

export const passportsCommand = new Command("passports")
  .description("List passports")
  .option("--revoked", "Include revoked passports")
  .action((o) => run(async () => {
    const ps = await adminCall<Passport[]>("passports", { includeRevoked: !!o.revoked });
    if (ps.length === 0) return console.log("No passports.");
    for (const p of ps) {
      const state = p.revokedAt ? "revoked" : p.expiresAt && Date.parse(p.expiresAt) <= Date.now() ? "expired" : "active";
      const s = p.scopes;
      console.log(`${p.id}  ${p.label}  [${state}]  ${s.read ? "read " : ""}${s.write ? "write " : ""}types=${s.types?.join(",") ?? "all"} tags=${s.tags?.join(",") ?? "all"} max=${s.maxSensitivity}`);
    }
  })());
