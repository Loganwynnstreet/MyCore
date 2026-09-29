import { Command } from "commander";
import { Vault } from "@mycore/core";
import { getVaultPath, unlockVault } from "../utils.js";

export const revokeCommand = new Command("revoke")
  .description("Revoke a passport")
  .option("-p, --path <path>", "Path to vault file")
  .requiredOption("-i, --id <id>", "Passport ID")
  .action(async (options) => {
    const path = getVaultPath(options.path);
    let vault: Vault;

    try {
      vault = await unlockVault(path);
    } catch (error) {
      console.error(`Error unlocking vault: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }

    try {
      const passport = vault.revokePassport(options.id);
      console.log(`Passport revoked: ${passport.label} (${passport.id})`);
      console.log(`Revoked at: ${passport.revokedAt}`);
      vault.close();
    } catch (error) {
      vault.close();
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });
