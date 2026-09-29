import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { Vault } from "@mycore/core";

const DEFAULT_VAULT_PATH = join(homedir(), ".mycore", "vault.mycore");

export function getVaultPath(path?: string): string {
  return path ?? DEFAULT_VAULT_PATH;
}

export async function unlockVault(path: string): Promise<Vault> {
  const passphrase = await readPassphrase();
  return await Vault.open(path, passphrase);
}

async function readPassphrase(): Promise<string> {
  // For now, use environment variable. In production, use a proper TTY prompt
  const passphrase = process.env.MYCORE_PASSPHRASE;
  if (!passphrase) {
    throw new Error("Passphrase required. Set MYCORE_PASSPHRASE environment variable.");
  }
  return passphrase;
}

export function parseJsonArg(arg: string): Record<string, unknown> {
  try {
    return JSON.parse(arg);
  } catch {
    throw new Error(`Invalid JSON: ${arg}`);
  }
}

export function parseTagsArg(arg: string): string[] {
  return arg.split(",").map(t => t.trim()).filter(Boolean);
}
