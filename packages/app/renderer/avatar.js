// Picks the 3D dino when WebGL is available and falls back to the flat SVG guide otherwise.
import { createAvatar as create2D } from "./avatar2d.js";
import { createAvatar3D } from "./avatar3d/index.js";

export const LOOKS = { green: "Green", blue: "Blue", pink: "Pink", orange: "Orange" };
export const ACCESSORIES = { none: "Nothing", headphones: "Headphones", sunglasses: "Sunglasses" };
export const DEFAULT_STYLE = { name: "Cori", look: "green", acc: "none" };

// the flat fallback keeps its own palette names
const FLAT = { green: "sage", blue: "lilac", pink: "peach", orange: "cream" };

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
  const flat = (s) => ({ ...s, look: FLAT[s.look] || "cream" });
  const a = create2D(flat(style));
  const setStyle = a.setStyle;
  a.setStyle = (s) => setStyle(flat(s));
  return a;
}
