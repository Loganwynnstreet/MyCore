# MyCore desktop app

Electron shell with Cori, the vault guide. It is an owner-side client of the daemon: it holds no
key, loads no native code, and the page can only call the daemon's admin operations through the
allow-list in `src/main.ts`.

```
npm run build                 # from the repo root: builds core, daemon, cli, mcp
cd packages/app && npm start  # builds and launches the app (starts mycored if needed)
npm run preview               # http://localhost:5177 with a mock backend, for UI work
```

Env overrides (shared with the CLI): `MYCORE_VAULT`, `MYCORE_RUN_DIR`, `MYCORE_NAME`.

Notes
- The app launches the daemon with the system `node` (the vault engine is a native module built
  for Node, not for Electron), so Node.js must be installed. Packaging will bundle it later.
- Page content is always rendered with `textContent`; vault text, including AI suggestions, is untrusted.
- `renderer/mock.js` is only used when the page is opened outside Electron.
