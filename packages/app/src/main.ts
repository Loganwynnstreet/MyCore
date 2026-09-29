import { app, BrowserWindow, ipcMain, shell } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ADMIN_OPS, DaemonClient, addressFor, defaultName, defaultRunDir, readOwnerSecret,
} from "@mycore/daemon/client";

/**
 * The desktop app never touches the vault. It is an owner-side client of the daemon:
 * it holds no key and loads no native code, and the renderer can only reach a fixed
 * allow-list of admin operations through this process.
 */

const here = dirname(fileURLToPath(import.meta.url));
const rendererDir = join(here, "..", "renderer");
const daemonBin = join(here, "..", "..", "daemon", "dist", "bin.js");

let startedDaemon: ChildProcess | null = null;

const adminAddress = () => addressFor("admin", defaultRunDir(), defaultName());

async function canConnect(): Promise<boolean> {
  try { (await DaemonClient.connect(adminAddress())).close(); return true; } catch { return false; }
}

/** Starts mycored (under the system Node, whose ABI matches the vault engine) if it is not running. */
async function ensureDaemon(): Promise<void> {
  if (await canConnect()) return;
  if (!existsSync(daemonBin)) throw new Error("Daemon is not built. Run: npm run build");
  startedDaemon = spawn("node", [daemonBin], { stdio: "ignore", windowsHide: true });
  startedDaemon.once("exit", () => { startedDaemon = null; });
  for (let i = 0; i < 50; i++) {
    if (await canConnect()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("The MyCore daemon did not start. Is Node.js installed?");
}

async function adminCall(op: string, args: Record<string, unknown>) {
  await ensureDaemon();
  let secret: string;
  try { secret = readOwnerSecret(defaultRunDir()); } catch { throw new Error("Daemon secret unavailable"); }
  const client = await DaemonClient.connect(adminAddress());
  try {
    const res = await client.request(op, args, { secret });
    return res.ok
      ? { ok: true as const, result: res.result }
      : { ok: false as const, error: res.error, message: res.message ?? res.error };
  } finally {
    client.close();
  }
}

function registerIpc() {
  ipcMain.handle("mycore:call", async (event, op: unknown, args: unknown) => {
    // Only our own window may call, and only known operations with plain-object args.
    if (event.senderFrame?.url && !event.senderFrame.url.startsWith("file://")) throw new Error("forbidden");
    if (typeof op !== "string" || !(ADMIN_OPS as readonly string[]).includes(op)) throw new Error("unknown operation");
    if (args === null || typeof args !== "object" || Array.isArray(args)) throw new Error("bad arguments");
    try {
      return await adminCall(op, args as Record<string, unknown>);
    } catch (e) {
      return { ok: false as const, error: "app_error", message: e instanceof Error ? e.message : "error" };
    }
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1080, height: 760, minWidth: 900, minHeight: 620,
    title: "MyCore", backgroundColor: "#f6f1e9", autoHideMenuBar: true,
    webPreferences: {
      preload: join(here, "..", "preload.cjs"),
      contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true,
    },
  });
  // The window shows our own page and nothing else.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  void win.loadFile(join(rendererDir, "index.html"));
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

// If we launched the daemon we lock and stop it on exit; a daemon that was already running is left alone.
app.on("before-quit", () => {
  if (startedDaemon) { startedDaemon.kill(); startedDaemon = null; }
});
