#!/usr/bin/env node
import { Daemon } from "./daemon.js";
import { defaultName, defaultRunDir, defaultVaultPath } from "./paths.js";

const vaultPath = defaultVaultPath();
const idleMin = Number(process.env.MYCORE_IDLE_MINUTES ?? 30);
if (!Number.isFinite(idleMin) || idleMin <= 0) {
  console.error("MYCORE_IDLE_MINUTES must be a positive number");
  process.exit(1);
}

const daemon = new Daemon({ vaultPath, runDir: defaultRunDir(), name: defaultName(), idleMs: idleMin * 60_000 });
await daemon.start();
console.error(`mycored running (locked). vault=${vaultPath} idle-lock=${idleMin}m. Unlock with: mycore unlock`);

const shutdown = async () => { await daemon.stop(); process.exit(0); };
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
