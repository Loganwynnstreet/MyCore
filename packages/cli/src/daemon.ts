import { DaemonClient, addressFor, defaultName, defaultRunDir, readOwnerSecret } from "@mycore/daemon";

/** Sends one owner (admin) request to the running daemon and returns its result. */
export async function adminCall<T = unknown>(op: string, args: Record<string, unknown> = {}): Promise<T> {
  const runDir = defaultRunDir();
  let secret: string;
  try {
    secret = readOwnerSecret(runDir);
  } catch {
    throw new Error("The daemon is not running. Start it with: mycored");
  }
  let client: DaemonClient;
  try {
    client = await DaemonClient.connect(addressFor("admin", runDir, defaultName()));
  } catch {
    throw new Error("Could not reach the daemon. Is mycored running?");
  }
  try {
    const res = await client.request(op, args, { secret });
    if (!res.ok) {
      throw new Error(res.error === "vault_locked" ? "Vault is locked. Run: mycore unlock" : `${res.error}${res.message ? `: ${res.message}` : ""}`);
    }
    return res.result as T;
  } finally {
    client.close();
  }
}

/** Shared action wrapper: prints errors without a stack trace and sets the exit code. */
export function run(fn: () => Promise<void>) {
  return async () => {
    try { await fn(); } catch (e) {
      console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    }
  };
}
