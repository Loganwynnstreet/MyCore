import { Command } from "commander";
import { Vault } from "@mycore/core";
import { getVaultPath, unlockVault, parseJsonArg } from "../utils.js";

export const grantCommand = new Command("grant")
  .description("Create a new passport with scoped access")
  .option("-p, --path <path>", "Path to vault file")
  .requiredOption("-l, --label <label>", "Passport label")
  .requiredOption("-s, --scopes <json>", "Scopes as JSON (e.g., '{\"types\":[\"memory\"],\"maxSensitivity\":\"personal\"}')")
  .option("--expires <date>", "Expiration date (ISO 8601)")
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
      const scopes = parseJsonArg(options.scopes);
      const { passport, token } = vault.createPassport({
        label: options.label,
        scopes: scopes as any,
        expiresAt: options.expires || null,
      });

      console.log(`Passport created with ID: ${passport.id}`);
      console.log(`Token (shown once, store it securely): ${token}`);
      console.log(`Label: ${passport.label}`);
      console.log(`Scopes: ${JSON.stringify(passport.scopes, null, 2)}`);
      console.log(`Expires: ${passport.expiresAt || "never"}`);
      vault.close();
    } catch (error) {
      vault.close();
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });
