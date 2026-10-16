export { Daemon, type DaemonOptions } from "./daemon.js";
export { addressFor, ownerSecretPath } from "./paths.js";
export { DaemonClient, readOwnerSecret, type Credentials } from "./client.js";
export { MAX_MESSAGE_BYTES, AI_OPS, ADMIN_OPS, type Response, type Channel } from "./protocol.js";
export { defaultVaultPath, defaultRunDir, defaultName } from "./paths.js";
