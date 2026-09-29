import { Command } from "commander";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Vault } from "@mycore/core";
import { getVaultPath } from "../utils.js";
import { run } from "../daemon.js";
import { promptSecret } from "../prompt.js";

export const initCommand = new Command("init")
  .description("Create a new vault")
  .option("-p, --path <path>", "Path to vault file")
  .action((o) => run(async () => {
    const path = getVaultPath(o.path);
    let passphrase = process.env.MYCORE_PASSPHRASE;
    if (!passphrase) {
      passphrase = await promptSecret("Choose a passphrase (8+ characters): ");
      if (passphrase !== await promptSecret("Repeat passphrase: ")) throw new Error("Passphrases do not match");
    }
    mkdirSync(dirname(path), { recursive: true });
    const { vault, recoveryPhrase } = await Vault.create(path, passphrase);
    vault.close();
    console.log(`Vault created: ${path}`);
    console.log(`(Keep ${path}.keys next to it; you need both files to unlock.)\n`);
    console.log("RECOVERY PHRASE - write it down and store it offline. It is shown once and cannot be recovered:\n");
    console.log(`  ${recoveryPhrase}\n`);
  })());
