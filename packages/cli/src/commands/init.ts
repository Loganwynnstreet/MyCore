import { Command } from "commander";
import { Vault } from "@mycore/core";
import { getVaultPath } from "../utils.js";

export const initCommand = new Command("init")
  .description("Initialize a new vault")
  .option("-p, --path <path>", "Path to vault file")
  .action(async (options) => {
    const path = getVaultPath(options.path);
    const passphrase = process.env.MYCORE_PASSPHRASE;
    if (!passphrase) {
      console.error("Error: Passphrase required. Set MYCORE_PASSPHRASE environment variable.");
      process.exit(1);
    }
    if (passphrase.length < 8) {
      console.error("Error: Passphrase must be at least 8 characters.");
      process.exit(1);
    }

    try {
      const { vault, recoveryPhrase } = await Vault.create(path, passphrase);
      console.log(`Vault created at: ${path}`);
      console.log(`Recovery phrase: ${recoveryPhrase}`);
      console.log("IMPORTANT: Save this recovery phrase in a secure location. It cannot be recovered!");
      vault.close();
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });
