import { Command } from "commander";
import type { VaultRecord } from "@mycore/core";
import { adminCall, run } from "../daemon.js";
import { promptSecret } from "../prompt.js";

export const unlockCommand = new Command("unlock")
  .description("Unlock the vault in the running daemon (prompts for the passphrase)")
  .action(run(async () => {
    const passphrase = await promptSecret("Passphrase: ");
    if (!passphrase) throw new Error("A passphrase is required");
    await adminCall("unlock", { passphrase });
    console.log("Vault unlocked.");
  }));

export const lockCommand = new Command("lock")
  .description("Lock the vault in the running daemon")
  .action(run(async () => {
    await adminCall("lock");
    console.log("Vault locked.");
  }));

export const statusCommand = new Command("status")
  .description("Show whether the daemon's vault is locked")
  .action(run(async () => {
    const s = await adminCall<{ locked: boolean }>("status");
    console.log(s.locked ? "locked" : "unlocked");
  }));

export const pendingCommand = new Command("pending")
  .description("List records written by AIs that await your approval")
  .action(run(async () => {
    const recs = await adminCall<VaultRecord[]>("pending");
    if (recs.length === 0) return console.log("Nothing pending.");
    for (const r of recs) {
      console.log(`${r.id}  ${r.type}  from ${r.source}  ${r.createdAt}`);
      console.log(`  ${JSON.stringify(r.data)}`);
    }
  }));

export const approveCommand = new Command("approve")
  .description("Approve a pending record so it becomes part of your vault")
  .argument("<id>", "record id")
  .action((id: string) => run(async () => {
    await adminCall("approve", { id });
    console.log(`Approved ${id}`);
  })());

export const rejectCommand = new Command("reject")
  .description("Discard a pending record")
  .argument("<id>", "record id")
  .action((id: string) => run(async () => {
    await adminCall("reject", { id });
    console.log(`Rejected ${id}`);
  })());
