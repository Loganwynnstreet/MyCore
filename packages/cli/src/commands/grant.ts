import { Command } from "commander";
import { RECORD_TYPES, SENSITIVITIES, type Passport, type PassportScope, type RecordType, type Sensitivity } from "@mycore/core";
import { adminCall, run } from "../daemon.js";
import { parseTagsArg } from "../utils.js";

const list = (v: string) => parseTagsArg(v);

export const grantCommand = new Command("grant")
  .description("Create a passport (scoped access token) for an AI. The token is shown once.")
  .requiredOption("-l, --label <label>", "Name for this passport, e.g. 'Claude desktop'")
  .option("--read", "Allow reading records")
  .option("--write", "Allow proposing records (always held as pending until you approve)")
  .option("--types <types>", `Only these record types (${RECORD_TYPES.join(", ")})`, list)
  .option("--tags <tags>", "Only records with at least one of these tags", list)
  .option("--max-sensitivity <level>", `Highest sensitivity to allow: ${SENSITIVITIES.filter((s) => s !== "secret").join(", ")}`, "personal")
  .option("--expires <date>", "Expiry (ISO 8601 date)")
  .action((o) => run(async () => {
    for (const t of o.types ?? []) if (!(RECORD_TYPES as readonly string[]).includes(t)) throw new Error(`Unknown type: ${t}`);
    if (!(SENSITIVITIES as readonly string[]).includes(o.maxSensitivity)) throw new Error(`Unknown sensitivity: ${o.maxSensitivity}`);
    if (!o.read && !o.write) throw new Error("Grant at least one of --read or --write");
    const scopes: PassportScope = {
      read: !!o.read, write: !!o.write,
      types: o.types as RecordType[] | undefined,
      tags: o.tags as string[] | undefined,
      maxSensitivity: o.maxSensitivity as Sensitivity,
    };
    const { passport, token } = await adminCall<{ passport: Passport; token: string }>("grant", {
      label: o.label, scopes, expiresAt: o.expires,
    });
    console.log(`Passport ${passport.id} created for "${passport.label}".`);
    console.log(`Token (shown once; store it in the AI's MYCORE_TOKEN):\n\n  ${token}\n`);
  })());
