# Project MyCore — Spec v0.1 (draft)

## 1. Purpose
A user-owned, encrypted vault of personal context that any AI can be connected to. The user holds the data and the keys. AIs get scoped, revocable, audited access, like a passport that travels between chats and models.

## 2. Goals / Non-goals
**Goals**
- Local-first encrypted vault; portable (single file + recovery phrase).
- Structured personal context: profile, people, events, preferences, history, AI accounts and usage.
- Per-AI scoped access ("passports"), revocable, with an audit log.
- MCP server so MCP-capable AIs read/write context directly.
- Import/export in open formats. No lock-in.

**Non-goals (v0.1)**
- Hosted service, accounts, or cloud sync.
- Storing AI provider passwords or API keys in plaintext (see §7).
- GUI (comes after CLI + server).

## 3. Architecture
```
packages/
  core/     vault engine: crypto, storage, schema, scopes, audit
  cli/      `mycore` command line (init, add, get, search, grant, revoke, export)
  mcp/      local MCP server (stdio) exposing scoped context as tools/resources
  import/   importers (ChatGPT/Claude export files, JSON, markdown)
```
TypeScript, Node 22+, pnpm workspace. Vitest for tests.

## 4. Vault format
- **Decided:** SQLCipher (`better-sqlite3-multiple-ciphers`, SQLCipher v4 mode) with the random master key used as the raw DB key.
- Two files: `name.mycore` (encrypted DB) and `name.mycore.keys` (JSON: Argon2id params + master key wrapped by passphrase and by recovery key). The keys file holds no plaintext secrets, but is needed to unlock, so back up both. Passphrase changes rewrite only the keys file.
- Key hierarchy: passphrase → Argon2id → KEK; KEK wraps a random 256-bit master key (allows passphrase change without re-encrypting). Master key also wrapped by a BIP39-style recovery phrase.
- Cipher: XChaCha20-Poly1305 (libsodium). Every record has a random nonce; header carries version + KDF params.
- Vault is locked by default; unlock holds the key in memory only for the session.

## 5. Data model (initial)
| Entity | Fields |
|---|---|
| `profile` | key, value, category, updated_at |
| `person` | name, relation, notes, tags |
| `event` | title, date, description, people[], tags |
| `memory` | free-form fact/note, source, confidence, tags, created_at |
| `ai_account` | provider, label, plan, created_at, notes (no secrets) |
| `usage` | ai_account, period, tokens/requests/cost, source |
| `conversation_ref` | provider, title, date, summary, source file |
| `passport` | id, label, scopes[], created_at, expires_at, revoked_at |
| `audit` | ts, passport, action, entity, count |

Every record carries `tags` and a `sensitivity` (`public | personal | private | secret`) used for scoping.

## 6. Access control ("passports")
- A passport = token + scope set (entity types, tags, max sensitivity, read/write) + optional expiry.
- `secret` records are never served over MCP; they are readable only via interactive CLI unlock.
- All reads/writes through a passport are logged. Revoke = instant.
- Writes from AIs land in a `pending` queue for user review (default), to prevent a model or prompt injection from silently altering the vault.

## 7. Threat model (summary)
| Threat | Mitigation |
|---|---|
| Stolen vault file | Argon2id + XChaCha20-Poly1305; nothing plaintext at rest |
| Malicious/over-curious AI | Scoped passports, sensitivity ceiling, audit log |
| Prompt injection writing bad data | Pending-write queue, provenance on every record |
| Vault content injecting instructions | Served content is labeled as data, never as instructions |
| Lost passphrase | Recovery phrase; documented that loss of both = loss of data |
| Malware on device | Out of scope (documented) |

Provider credentials: v0.1 stores only metadata about AI accounts, not passwords or keys. Secret storage can come later behind the `secret` tier and OS keychain integration.

## 8. MCP surface (v0.1)
- Tools: `get_profile`, `search_memory`, `list_events`, `list_people`, `add_memory` (→ pending), `get_context_bundle` (task-relevant summary within scope).
- Transport: stdio, launched with a passport token.

## 9. Open decisions
1. Storage: SQLCipher whole-DB encryption vs. app-level per-record encryption (search is easier with SQLCipher; app-level allows finer key separation).
2. Search: SQLite FTS5 first; local embeddings later.
3. Sync/backup: user-supplied encrypted file sync first; protocol later.

## 10. Milestones
- **M1** core: init/unlock, crypto, schema, CRUD, tests.
- **M2** CLI + passports + audit log.
- **M3** MCP server + pending-write queue.
- **M4** importers, export, recovery phrase flow.
- **M5** desktop/web UI, encrypted sync.
