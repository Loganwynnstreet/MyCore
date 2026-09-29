import { Command } from "commander";
import { Vault } from "@mycore/core";
import { getVaultPath, unlockVault } from "../utils.js";

export const auditCommand = new Command("audit")
  .description("View audit log")
  .option("-p, --path <path>", "Path to vault file")
  .option("-l, --limit <limit>", "Maximum number of entries", "100")
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
      const limit = parseInt(options.limit, 10);
      const log = vault.auditLog(limit);
      console.log(JSON.stringify(log, null, 2));
      vault.close();
    } catch (error) {
      vault.close();
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });
