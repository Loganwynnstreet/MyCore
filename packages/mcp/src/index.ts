#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { addressFor, defaultName, defaultRunDir } from "@mycore/daemon";
import { createBridge, daemonCaller } from "./bridge.js";

const token = process.env.MYCORE_TOKEN;
if (!token) {
  console.error("MYCORE_TOKEN is required. Create one with: mycore grant --label <name> --read");
  process.exit(1);
}
// The token is this process's only credential; do not leave it in our own environment.
delete process.env.MYCORE_TOKEN;

const server = createBridge(daemonCaller(token, addressFor("ai", defaultRunDir(), defaultName())));
await server.connect(new StdioServerTransport());
