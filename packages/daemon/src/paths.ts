import { homedir } from "node:os";
import { join } from "node:path";

/** Default locations, overridable by env so tests and multiple vaults do not collide. */
export const defaultVaultPath = () => process.env.MYCORE_VAULT ?? join(homedir(), ".mycore", "vault.mycore");
export const defaultRunDir = () => process.env.MYCORE_RUN_DIR ?? join(homedir(), ".mycore", "run");
export const defaultName = () => process.env.MYCORE_NAME ?? "default";
