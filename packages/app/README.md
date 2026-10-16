# MyCore desktop app

Electron shell with Cori, the vault guide. It is an owner-side client of the daemon: it holds no
key, loads no native code, and the page can only call the daemon's admin operations through the
allow-list in `src/main.ts`.

```
npm run build                 # from the repo root: builds core, daemon, cli, mcp
cd packages/app && npm start  # bundles the renderer, builds and launches the app (starts mycored if needed)
npm run preview               # http://localhost:5177 with a mock backend, for UI work
```

Env overrides (shared with the CLI): `MYCORE_VAULT`, `MYCORE_RUN_DIR`, `MYCORE_NAME`.

Notes
- The app launches the daemon with the system `node` (the vault engine is a native module built
  for Node, not for Electron), so Node.js must be installed. Packaging will bundle it later.
- Page content is always rendered with `textContent`; vault text, including AI suggestions, is untrusted.
- `renderer/mock.js` is only used when the page is opened outside Electron.

## The guide: a living essence
A faceless, glowing blob in the spirit of a voice-assistant orb. Her mood is carried entirely by motion,
colour and light: no face, no limbs. `renderer/avatar3d/` (three.js + GSAP, bundled by esbuild into `renderer/bundle/`):
- `essence.js`: the model. A custom shader displaces an icosphere with 3D simplex noise (normals are recomputed
  by finite differences), fills it with flowing three-colour gradients and a soft translucent core, and wraps it in
  an aura drawn from the inside of a larger shell so only the glow beyond the silhouette shows. Plus a background
  halo, a floating contact shadow, expanding ripples, orbiting motes and sparkles.
- `index.js`: animation. Idle life (breathing, floating, leaning towards the pointer, ever-flowing colour), mood
  poses tweened with GSAP (surface energy, speed, swirl, glow, tint, size, jitter), one-shot performances (a hop
  with anticipation, squash and overshoot; a pop with ripples; a shiver; a hello pulse; a wake-up swell), and
  springs for the lean and landing. While a request is in flight she swirls faster and the motes orbit quicker.
- Moods: sleep (dim, small, slow), happy (calm flow), alert (warm, bright, ripples), think (fast swirl),
  worried (rose tint, jitter), cheer (hop, burst, sparkles).
- Four colour schemes (aurora, ember, ocean, mint) and three shapes (orb, blob, wisp).
- Falls back to a CSS orb (`avatar2d.js`) when WebGL is unavailable, or with `?2d` in the URL.
- Honours `prefers-reduced-motion`. Rendering is capped at 60 fps and pauses when the window is hidden.
- Open the page with `?debug` to get `window.__guide` for driving moods from automation.
