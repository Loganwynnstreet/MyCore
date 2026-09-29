import { Command } from "commander";
import { Vault } from "@mycore/core";
import { getVaultPath, unlockVault } from "../utils.js";

export const getCommand = new Command("get")
  .description("Get a record by ID")
  .option("-p, --path <path>", "Path to vault file")
  .requiredOption("-i, --id <id>", "Record ID")
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
      const record = vault.get(options.id);
      if (!record) {
        console.error(`Record not found: ${options.id}`);
        vault.close();
        process.exit(1);
      }

      console.log(JSON.stringify(record, null, 2));
      vault.close();
    } catch (error) {
      vault.close();
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });
