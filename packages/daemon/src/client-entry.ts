/** Native-free entry point: safe to load from Electron or any process that must not load the vault engine. */
export { DaemonClient, readOwnerSecret, type Credentials } from "./client.js";
export { addressFor, ownerSecretPath, defaultVaultPath, defaultRunDir, defaultName, type Channel } from "./paths.js";
export { ADMIN_OPS, type Response } from "./protocol.js";
