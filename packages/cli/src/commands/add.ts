import { Command } from "commander";
import { Vault } from "@mycore/core";
import { getVaultPath, unlockVault, parseJsonArg, parseTagsArg } from "../utils.js";

export const addCommand = new Command("add")
  .description("Add a record to the vault")
  .option("-p, --path <path>", "Path to vault file")
  .requiredOption("-t, --type <type>", "Record type (profile, person, event, memory, ai_account, usage, conversation_ref)")
  .requiredOption("-d, --data <json>", "Record data as JSON")
  .option("--tags <tags>", "Comma-separated tags")
  .option("-s, --sensitivity <sensitivity>", "Sensitivity level (public, personal, private, secret)", "personal")
  .option("--source <source>", "Source of the record", "cli")
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
      const data = parseJsonArg(options.data);
      const tags = options.tags ? parseTagsArg(options.tags) : undefined;
      
      const record = vault.add({
        type: options.type as any,
        data,
        tags,
        sensitivity: options.sensitivity as any,
        source: options.source,
      });

      console.log(`Record added with ID: ${record.id}`);
      vault.close();
    } catch (error) {
      vault.close();
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });
