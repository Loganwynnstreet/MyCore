import { Command } from "commander";
import { adminCall, run } from "../daemon.js";

export const revokeCommand = new Command("revoke")
  .description("Revoke a passport immediately")
  .argument("<passport-id>", "passport id (see `mycore passports`)")
  .action((id: string) => run(async () => {
    await adminCall("revoke", { id });
    console.log(`Revoked ${id}`);
  })());
