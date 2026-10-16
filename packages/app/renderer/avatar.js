// Picks the 3D essence when WebGL is available and falls back to a CSS orb otherwise.
import { createAvatar as create2D } from "./avatar2d.js";
import { createAvatar3D } from "./avatar3d/index.js";

export const LOOKS = { aurora: "Aurora", ember: "Ember", ocean: "Ocean", mint: "Mint" };
export const ACCESSORIES = { orb: "Orb", blob: "Blob", wisp: "Wisp" }; // her shape
export const DEFAULT_STYLE = { name: "Cori", look: "aurora", acc: "orb" };

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { return false; }
}

export function createAvatar(style = DEFAULT_STYLE) {
  const force2d = new URLSearchParams(location.search).has("2d");
  if (!force2d && webglAvailable()) {
    try { return createAvatar3D(style); } catch (e) { console.warn("3D guide unavailable, using the flat one:", e); }
  }
  return create2D(style);
}
