import { Command } from "commander";
import { Vault } from "@mycore/core";
import { getVaultPath, unlockVault } from "../utils.js";

export const passportsCommand = new Command("passports")
  .description("List all passports")
  .option("-p, --path <path>", "Path to vault file")
  .option("--revoked", "Include revoked passports")
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
      const passports = vault.listPassports(options.revoked);
      console.log(JSON.stringify(passports, null, 2));
      vault.close();
    } catch (error) {
      vault.close();
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });
