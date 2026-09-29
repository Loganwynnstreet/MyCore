import * as THREE from "three";

// Small procedural textures (drawn to canvases, so the app ships no image assets).

function canvas(size) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return [c, c.getContext("2d")];
}

const tex = (c) => {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};

/** Soft round gradient: blush on the cheeks, glows, halo. `stops` are [offset, css colour]. */
export function radialTexture(stops, size = 128) {
  const [c, g] = canvas(size);
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) grad.addColorStop(o, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return tex(c);
}

/** Contact shadow under the character. */
export const shadowTexture = () => radialTexture([[0, "rgba(50,25,15,.55)"], [0.55, "rgba(50,25,15,.22)"], [1, "rgba(50,25,15,0)"]], 128);

/** A glyph ("z", "!") with an outline, for floating status sprites. */
export function glyphTexture(ch, fill, stroke, size = 128) {
  const [c, g] = canvas(size);
  g.font = `800 ${size * 0.8}px "Segoe UI", system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.lineWidth = size * 0.09;
  g.strokeStyle = stroke;
  g.strokeText(ch, size / 2, size / 2 + size * 0.04);
  g.fillStyle = fill;
  g.fillText(ch, size / 2, size / 2 + size * 0.04);
  return tex(c);
}

/** Four-point sparkle. */
export function sparkleTexture(colour = "#ffd56b", size = 96) {
  const [c, g] = canvas(size);
  const m = size / 2, s = size * 0.46, k = size * 0.09;
  g.fillStyle = colour;
  g.shadowColor = colour;
  g.shadowBlur = size * 0.12;
  g.beginPath();
  g.moveTo(m, m - s); g.quadraticCurveTo(m + k, m - k, m + s, m);
  g.quadraticCurveTo(m + k, m + k, m, m + s); g.quadraticCurveTo(m - k, m + k, m - s, m);
  g.quadraticCurveTo(m - k, m - k, m, m - s);
  g.fill();
  return tex(c);
}

/** Round bubble used for the "thinking" dots. */
export function bubbleTexture(size = 96) {
  const [c, g] = canvas(size);
  g.fillStyle = "#fffaf4";
  g.strokeStyle = "rgba(90,60,50,.35)";
  g.lineWidth = size * 0.06;
  g.beginPath();
  g.arc(size / 2, size / 2, size * 0.4, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  return tex(c);
}
