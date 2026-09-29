# Lead engineer notes

Claude is lead engineer on MyCore; other agents work under review. Read this before
starting work, and rebase on `claude/passport-hardening` (or `main` once it merges).

## Ground rules
1. **Security invariants are not negotiable** (see SPEC §6–7). AI-facing code (MCP, anything
   holding a passport token) must go through `vault.authenticate(token)` → `ScopedVault`.
   It must never call `Vault.list/search/get/add` directly.
2. **Fail closed.** If a scope, filter or input is unsupported, deny; never "skip for now".
   A limitation comment on a security path is a bug, not documentation.
3. Never claim tests pass unless you ran `npx tsc -b --force && npx vitest run`.
   Incremental `tsc -b` reports stale success.
4. Each change ships with tests that try to *break* the invariant, not just the happy path.
5. Work on your own branch, small commits, no drive-by edits to `packages/core` without
   telling the lead. Core changes are reviewed before merge.

## Review of b4f2357 (M2) — findings
Fixed in `3d28a98`:
- `applyPassport` failed open: multi-type and tag scopes were ignored, `secret` was reachable,
  `read`/`write` never checked, callers could pass `status: "pending"`.
- A passport "credential" was its UUID (non-secret, appears in audit logs). Now a random
  bearer token, sha256 at rest, shown once.

Still open — junior, please do these next (CLI package):
- [ ] `init`: create the parent directory (`~/.mycore`) before `Vault.create`; refuse to
      run if the vault exists (message, not stack).
- [ ] Passphrase: env var only is a leak (process listings, shell history, child processes).
      Prompt on TTY with echo off; keep env var only as an explicit `--passphrase-env` opt-in.
      Add `mycore recover` (uses `Vault.openWithRecovery`) and `mycore passwd`.
- [ ] Missing owner commands: `pending` (list pending) and `approve <id>` / `reject <id>`.
      Without them the pending-write queue is unusable.
- [ ] `add`: remove `as any` casts; validate type/sensitivity against `RECORD_TYPES` /
      `SENSITIVITIES` with a clear error. `--source` lets the owner spoof provenance; drop it.
- [ ] `grant`: validate `--scopes` shape; print token once with a warning; add `--read`,
      `--write`, `--types`, `--tags`, `--max-sensitivity` flags so users don't hand-write JSON.
- [ ] `packages/cli/tsconfig.json` needs `"references": [{ "path": "../core" }]` so build
      order is correct from a clean checkout.
- [ ] CLI tests only cover two string helpers. Add end-to-end tests (spawn the CLI against a
      temp vault).
- [ ] Commit hygiene: don't commit as the human's identity with a different tool's trailer
      unless asked; follow the repo's commit style.

## For `packages/mcp` (in progress)
- Authenticate once at startup with the token from an env var (`MYCORE_TOKEN`), hold only the
  `ScopedVault`. Vault passphrase must not be needed by the MCP process... currently
  `authenticate` needs an unlocked vault; the lead will design a passphrase-free path (M3
  design note to follow). Until then, do not merge `packages/mcp`.
- Returned record content is untrusted data going *into* a model: wrap results so it is
  clear they are data, not instructions.
- `add_memory` maps to `ScopedVault.add` (always pending).
