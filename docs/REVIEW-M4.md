# Lead review — M4 work in progress (importers, export, recover)

Reviewed from the uncommitted working tree of `feature/m3-mcp-server` on 2026-09-29.
Build passes (`tsc -b --force`) and the 13 importer tests pass, but the tests do not cover
the problems below. **Verdict: do not commit as-is. Fix the blockers, then request review.**

Please put this work on its own branch (`feature/m4-import-export`), not the M3 branch.

## Blockers

1. **Export silently loses data (backup integrity).**
   `exportFromVault` calls `vault.list(filter)` with no limit, and `list` defaults to 100
   rows, so vaults with more than 100 records export a truncated file with no warning.
   Also `filter.type = types[0]` drops every other requested type ("simplified for now").
   Fix: add an unbounded iteration path in core (`Vault.all(filter)` / paginate), use the
   `types` / `tagsAny` filters I added, and test with 250 records. A test must assert
   export → import into a fresh vault round-trips exactly.

2. **Export writes secrets to disk in plaintext with no guard.**
   Default export includes `secret` records; `includeSecret` exists in the type but is never
   used. Fix: exclude `secret` unless `--include-secret` is passed; when the export is
   plaintext, print a warning; create the file with mode `0600` (`writeFileSync(..., {mode})`)
   and refuse to overwrite an existing file without `--force`. Validate `--max-sensitivity`
   and `--format` against the known values instead of passing raw strings.

3. **Importer routing is broken.** `importFile` picks the first importer whose `canImport`
   is true, and both `JsonImporter`, `ChatGPTImporter` and `ClaudeImporter` claim every
   `.json` file. `JsonImporter` is first, so a real ChatGPT or Claude export is handed to it,
   skips every item as "invalid" and imports nothing. Fix: detect by content shape (sniff the
   parsed JSON), not by filename; take an explicit `--format chatgpt|claude|json|markdown`
   flag; report an error if the shape is ambiguous.

4. **Importers target invented formats.** ChatGPT's real `conversations.json` is an array of
   objects with a `mapping` tree of message nodes (`create_time`, `title`, `current_node`),
   not a flat `messages` array. Claude exports use `name`, `uuid`, `created_at` and a
   `chat_messages` array. Verify against real sample structures (small hand-made fixtures that
   mirror the real shape, no personal data) and cover them in tests. The current tests only
   prove the code reads the format the code expects.

5. **`recover` is a no-op and leaks the phrase.** It takes the 24-word phrase as a command-line
   argument (visible in shell history and process listings), opens the vault and closes it.
   Fix: prompt on a TTY without echo, then immediately require and set a new passphrase via
   `changePassphrase`. That is the whole point of recovery.

## Should fix

6. **Import is not idempotent or atomic.** Running the same import twice doubles every
   record; a mid-run failure leaves a partial import. Fix: derive a stable external id per
   item (e.g. sha256 of provider + conversation id) stored on the record and skip existing
   ones; wrap the batch in a single transaction (add a `Vault.transaction(fn)` to core, ask me
   first). Exit non-zero if any errors occurred.
7. **Imported text is untrusted.** Conversation summaries are copied into the vault and later
   served to models. Cap length, strip control characters, and keep the `import` provenance
   tag. Never let an imported file set `status: "active"` for content that originated from
   an AI; import as `active` only when the owner ran it explicitly (this is fine for the CLI,
   but document it).
8. **Sync whole-file reads.** Real exports can be hundreds of MB. Acceptable for v0.1 but note
   the limit in the error message, and do not `JSON.stringify` the file into warnings
   (`Skipped invalid record: ${JSON.stringify(item)}` can dump an entire record to the console).
9. **Case-sensitive extension checks** (`endsWith(".json")`).
10. `packages/import` needs `references` to core in its tsconfig, like the CLI.

## What is fine
Package split, the `Importer` interface, markdown export escaping, and the CLI command
shape are reasonable. Keep those.
