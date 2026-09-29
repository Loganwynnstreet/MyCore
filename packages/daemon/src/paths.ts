import { homedir } from "node:os";
import { join } from "node:path";

/** Default locations, overridable by env so tests and multiple vaults do not collide. */
export const defaultVaultPath = () => process.env.MYCORE_VAULT ?? join(homedir(), ".mycore", "vault.mycore");
export const defaultRunDir = () => process.env.MYCORE_RUN_DIR ?? join(homedir(), ".mycore", "run");
export const defaultName = () => process.env.MYCORE_NAME ?? "default";

export type Channel = "ai" | "admin";

export function addressFor(channel: Channel, runDir: string, name = "default"): string {
  return process.platform === "win32"
    ? "\\\\.\\pipe\\mycore-" + name + "-" + channel
    : join(runDir, `${name}-${channel}.sock`);
}

export const ownerSecretPath = (runDir: string) => join(runDir, "owner.key");
