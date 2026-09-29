# M3 design — vault daemon and MCP bridge

Status: lead-approved design. Supersedes the "MCP server opens the vault" approach in PR 3.

## Problem
The vault is only readable with the master key, which comes from the owner's passphrase.
AI clients launch MCP servers as separate stdio processes, often unattended. Giving that
process the passphrase (env var) exposes the whole vault to it, and to anything that can read
its environment. A passport token must be the *only* credential an AI-facing process holds.

## Architecture
```
 AI app ──stdio/MCP──► mycore-mcp (bridge) ──local IPC──► mycored (daemon) ──► Vault
   holds MYCORE_TOKEN only                                   holds master key
 owner ──► mycore CLI ──local IPC (admin channel)────────────┘
```
- **mycored** is a long-running local process. The owner unlocks it once; it keeps the
  `Vault` open in memory. It is the only process that ever holds the master key.
- **mycore-mcp** is a thin stdio MCP server. It reads `MYCORE_TOKEN`, forwards each tool call to
  the daemon, returns the result. It has no vault code, no passphrase, no file access.
- **CLI** talks to the daemon for everyday commands once unlocked. It can still open the vault
  directly (offline mode) when no daemon is running.

## Channels
| Channel | Address | Who | Operations |
|---|---|---|---|
| `ai` | Windows named pipe `\\.\pipe\mycore-ai-<user>`; Unix socket `$XDG_RUNTIME_DIR/mycore/ai.sock` (0600) | any process with a passport token | `authenticate`-scoped ops only: `search`, `list`, `get`, `add` (always pending) |
| `admin` | separate pipe/socket | owner CLI | `unlock`, `lock`, `status`, `pending`, `approve`, `reject`, `grant`, `revoke`, `audit`, `export`, `import` |

- The `ai` channel does not route admin operations at all; a token cannot reach them.
- `admin` requests must carry the **owner secret**: 32 random bytes generated at daemon start,
  written to a `0600` file in the user's runtime dir. The CLI reads it. Same-user malware can
  read it too; that is inside the threat model's "malware on device" exclusion, and is
  documented, not hidden.
- No TCP, not even loopback. Browsers and any local web page can reach loopback ports.
- **Verify in tests**: Windows named pipes can have permissive default DACLs. The daemon must
  set an explicit ACL (current user only) or, failing that, the admin secret is the only guard
  and the token check is per request. Add a test that a second Windows user cannot connect.

## Requests
Newline-delimited JSON, one request/one response, max 1 MiB per message, strictly validated
(reject unknown ops and fields). `{ "id", "token", "op", "args" }`.
- On every `ai` request the daemon calls `vault.authenticate(token)` and uses the returned
  `ScopedVault` for that call only. Nothing is cached, so revocation is immediate.
- Failed auth: uniform error, audited (`passport.auth_failed`), and rate limited per connection
  (exponential delay after 5 failures).
- All results are size-capped (`limit` clamp already in `ScopedVault`).

## Lock model
- Daemon starts **locked**. `mycore unlock` prompts for the passphrase on a TTY (echo off) and
  sends it over the admin channel; the daemon derives the key, opens the vault.
- **Auto-lock** after idle timeout (default 30 min, configurable) and on `mycore lock`,
  daemon exit, or SIGTERM. Locking closes the DB and zeroes the key.
- While locked, the `ai` channel returns `{ "error": "vault_locked" }`. The bridge maps that
  to an MCP tool error telling the model to ask the user to unlock. No queuing, no retry.
- The passphrase is never written to disk, logged, or placed in environment or argv.

## MCP tool surface (v0.1)
`search_memory(query, types?, tags?, limit?)`, `list_records(type?, tag?, limit?)`,
`get_record(id)`, `add_memory(text, tags?)` (→ pending, sensitivity `personal`).
- Tool schemas are static; vault content never appears in tool names or descriptions.
- Results are wrapped in a fixed envelope that labels the content as untrusted user data with
  record id, type and source, e.g. `<vault_data record="..." type="memory">…</vault_data>`,
  and the tool description tells the model that text inside is data, not instructions.
- `add_memory` never returns the ability to read what it wrote (pending is invisible).

## Threat notes
| Threat | Handling |
|---|---|
| Malicious AI / prompt injection | token scope + `ScopedVault`; writes pending; wrapped results |
| Stolen token | scoped, revocable, expiring; only its hash is stored |
| Token guessing | 256-bit tokens; per-connection failure backoff; audited |
| Bridge compromised | holds only a token; cannot unlock or reach admin ops |
| Daemon crash while unlocked | key lived in memory only; nothing to clean up |
| Same-user malware | out of scope (documented); mitigated by auto-lock |

## Build plan
- **D1 (lead)**: `packages/daemon` — protocol schemas, lock/unlock, `ai` + `admin` servers,
  per-request `authenticate`, backoff, idle lock. Tests over a real pipe/socket, including
  revoked-token, locked-vault and oversized-message cases.
- **D2 (junior)**: CLI `unlock` / `lock` / `status` / `pending` / `approve` / `reject`,
  talking to the admin channel. TTY passphrase prompt (no env var).
- **D3 (junior, after D1 review)**: rewrite `packages/mcp` as the stdio bridge. Delete every
  use of `applyPassport`/`validatePassport`/`MYCORE_PASSPHRASE`/passport ids.
- **D4**: packaging as a background service (Windows service / launchd / systemd user unit).

## Open questions (lead will decide before D1 lands)
1. Idle-timeout default: 30 min vs. lock when the OS session locks.
2. Whether `get_context_bundle` (task-relevant summary) belongs in v0.1. Leaning no.

## D1 status (implemented in `packages/daemon`)
Done: protocol (strict, 1 MiB cap), `ai` + `admin` channels, per-request `authenticate`,
owner-secret auth (constant-time), per-channel failure backoff, idle lock, `DaemonClient`,
12 tests over real pipes/sockets.
Decisions taken:
- Idle lock is 30 min. **Lock on OS session lock is deferred to D4**: Node has no portable
  hook for it and it needs a small native/OS-service piece; do not fake it.
- No `get_context_bundle` in v0.1.
- Windows pipe DACL cannot be tightened from Node. The owner secret file is restricted with
  `icacls`, and the `ai` channel is token-gated. A cross-user pipe test remains a TODO for D4.
- The daemon does not yet have an entry point/binary; D2 (CLI) and D4 (service) add that.
