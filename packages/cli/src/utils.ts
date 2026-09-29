import { Vault } from "@mycore/core";
import { defaultVaultPath } from "@mycore/daemon";
import { promptSecret } from "./prompt.js";

export function getVaultPath(path?: string): string {
  return path ?? defaultVaultPath();
}

export async function unlockVault(path: string): Promise<Vault> {
  const passphrase = await readPassphrase();
  return await Vault.open(path, passphrase);
}

/** Prompts on the terminal. MYCORE_PASSPHRASE still works for scripts but leaks via the environment. */
export async function readPassphrase(): Promise<string> {
  const fromEnv = process.env.MYCORE_PASSPHRASE;
  if (fromEnv) return fromEnv;
  const passphrase = await promptSecret("Passphrase: ");
  if (!passphrase) throw new Error("A passphrase is required");
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
