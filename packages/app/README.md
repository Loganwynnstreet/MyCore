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

## The 3D guide
A chubby long-necked dinosaur in denim shorts, with a heart-and-keyhole emblem on her flank.
`renderer/avatar3d/` (three.js + GSAP, bundled by esbuild into `renderer/bundle/`):
- `toon.js`: cel-shaded material with a four-band ramp, and ink outlines (inverted hull pushed along normals)
- `tube.js`: a tapered tube that is re-shaped every frame, used for the neck and tail
- `dino.js`: procedural model and rig (torso, neck, head, tail, paws, denim shorts with a canvas-drawn
  texture, emblem, face, headphones, sunglasses, keyboard); the colour rule puts light green on the front
- `index.js`: animation: idle life (breathing, tail wag, blinks, saccades, head that follows the cursor),
  mood poses tweened with GSAP, one-shot performances (jump with anticipation and overshoot, pop, shake,
  wave, wake-up), and springs for secondary motion (tail segments, neck sway, head nod and roll)
- Four colours (green, blue, pink, orange) and optional headphones or sunglasses; shorts stay denim.
- Falls back to the flat SVG guide (`avatar2d.js`) when WebGL is unavailable, or with `?2d` in the URL.
- Honours `prefers-reduced-motion`. Rendering is capped at 60 fps and pauses when the window is hidden.
- Open the page with `?debug` to get `window.__guide` for driving moods from automation.
