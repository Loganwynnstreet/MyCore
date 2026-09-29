import net from "node:net";
import { readFileSync } from "node:fs";
import { MAX_MESSAGE_BYTES, type Response } from "./protocol.js";
import { ownerSecretPath } from "./daemon.js";

export interface Credentials { token?: string; secret?: string }

/** Minimal request/response client; used by the CLI and the MCP bridge. */
export class DaemonClient {
  private constructor(private sock: net.Socket) {}

  static connect(address: string): Promise<DaemonClient> {
    return new Promise((resolve, reject) => {
      const sock = net.connect(address);
      sock.once("connect", () => resolve(new DaemonClient(sock)));
      sock.once("error", reject);
    });
  }

  private nextId = 1;

  request(op: string, args: Record<string, unknown> = {}, cred: Credentials = {}): Promise<Response> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      let buf = "";
      const onData = (c: Buffer) => {
        buf += c.toString("utf8");
        if (buf.length > MAX_MESSAGE_BYTES * 2) { cleanup(); reject(new Error("response too large")); return; }
        const i = buf.indexOf("\n");
        if (i < 0) return;
        cleanup();
        try { resolve(JSON.parse(buf.slice(0, i)) as Response); } catch (e) { reject(e); }
      };
      const onErr = (e: Error) => { cleanup(); reject(e); };
      const cleanup = () => { this.sock.off("data", onData); this.sock.off("error", onErr); };
      this.sock.on("data", onData);
      this.sock.on("error", onErr);
      this.sock.write(JSON.stringify({ id, op, args, ...cred }) + "\n");
    });
  }

  /** Sends raw bytes (for protocol tests). */
  raw(data: string) { this.sock.write(data); }
  onceData(): Promise<string> { return new Promise((r) => this.sock.once("data", (c) => r(c.toString("utf8")))); }

  close() { this.sock.destroy(); }
}

export const readOwnerSecret = (runDir: string) => readFileSync(ownerSecretPath(runDir), "utf8").trim();
