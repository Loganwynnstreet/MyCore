import { Command } from "commander";
import { Vault } from "@mycore/core";
import { getVaultPath, unlockVault } from "../utils.js";

export const listCommand = new Command("list")
  .description("List records in the vault")
  .option("-p, --path <path>", "Path to vault file")
  .option("-t, --type <type>", "Filter by record type")
  .option("--tag <tag>", "Filter by tag")
  .option("-s, --sensitivity <sensitivity>", "Maximum sensitivity level")
  .option("-l, --limit <limit>", "Maximum number of results", "100")
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
      const filter: any = {};
      if (options.type) filter.type = options.type;
      if (options.tag) filter.tag = options.tag;
      if (options.sensitivity) filter.maxSensitivity = options.sensitivity;
      if (options.limit) filter.limit = parseInt(options.limit, 10);

      const results = vault.list(filter);
      console.log(JSON.stringify(results, null, 2));
      vault.close();
    } catch (error) {
      vault.close();
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });
