import { createInterface } from "node:readline";

/**
 * Reads a secret from the terminal without echoing it. If stdin is not a TTY
 * (piped input), reads a single line so scripts can still work.
 */
export function promptSecret(label: string): Promise<string> {
  const { stdin, stderr } = process;
  if (!stdin.isTTY) {
    return new Promise((resolve) => {
      const rl = createInterface({ input: stdin });
      // Resolve before closing: close() emits "close" synchronously, which would resolve with "".
      rl.once("line", (l) => { resolve(stripLineEnd(l)); rl.close(); });
      rl.once("close", () => resolve(""));
    });
  }
  return new Promise((resolve, reject) => {
    stderr.write(label);
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const done = (fn: () => void) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
      stderr.write("\n");
      fn();
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") return done(() => resolve(value));
        if (ch === "\u0003") return done(() => reject(new Error("Cancelled")));
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

/** Drops a UTF-8 BOM and trailing CR that some shells add to piped input. */
const BOM = String.fromCharCode(0xfeff);
const CR = String.fromCharCode(13);
function stripLineEnd(l: string): string {
  if (l.startsWith(BOM)) l = l.slice(1);
  return l.endsWith(CR) ? l.slice(0, -1) : l;
}
