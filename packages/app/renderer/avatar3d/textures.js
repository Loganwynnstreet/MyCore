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

/** Denim with fly stitching and two front pockets. u = 0.75 is the front (the side she faces). */
export function denimTexture() {
  const W = 1024, H = 512;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = "#4a7fb1";
  g.fillRect(0, 0, W, H);
  // woven look: faint diagonal twill
  g.globalAlpha = 0.07;
  g.strokeStyle = "#ffffff";
  g.lineWidth = 2;
  for (let i = -H; i < W; i += 7) { g.beginPath(); g.moveTo(i, H); g.lineTo(i + H, 0); g.stroke(); }
  g.globalAlpha = 1;
  const fx = W * 0.75;
  g.strokeStyle = "#a9cdee";
  g.lineWidth = 3;
  g.setLineDash([9, 7]);
  // fly seam and its curved topstitch
  g.beginPath(); g.moveTo(fx, 40); g.lineTo(fx, 250); g.stroke();
  g.beginPath(); g.moveTo(fx + 26, 40); g.quadraticCurveTo(fx + 30, 210, fx + 2, 262); g.stroke();
  // front pockets (curved openings from the waist, angled to the sides)
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(fx + s * 60, 44);
    g.quadraticCurveTo(fx + s * 110, 120, fx + s * 150, 200);
    g.stroke();
  }
  // hem stitch
  g.setLineDash([9, 7]);
  g.beginPath(); g.moveTo(0, H - 46); g.lineTo(W, H - 46); g.stroke();
  // darker shading toward the hem
  const shade = g.createLinearGradient(0, H * 0.55, 0, H);
  shade.addColorStop(0, "rgba(20,50,90,0)");
  shade.addColorStop(1, "rgba(20,50,90,.28)");
  g.fillStyle = shade;
  g.fillRect(0, 0, W, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Heart with a keyhole and three paw dots: her emblem (a nod to the vault). */
export function emblemTexture(heart = "#b2f2ac", hole = "#2a9a5f", size = 256) {
  const [c, g] = canvas(size);
  const s = size;
  g.fillStyle = heart;
  // three paw dots
  for (const [x, y, r] of [[0.28, 0.2, 0.075], [0.5, 0.12, 0.085], [0.72, 0.2, 0.075]]) {
    g.beginPath(); g.arc(x * s, y * s, r * s, 0, Math.PI * 2); g.fill();
  }
  // heart
  g.beginPath();
  g.moveTo(0.5 * s, 0.9 * s);
  g.bezierCurveTo(0.08 * s, 0.62 * s, 0.14 * s, 0.3 * s, 0.34 * s, 0.34 * s);
  g.bezierCurveTo(0.45 * s, 0.36 * s, 0.5 * s, 0.44 * s, 0.5 * s, 0.48 * s);
  g.bezierCurveTo(0.5 * s, 0.44 * s, 0.55 * s, 0.36 * s, 0.66 * s, 0.34 * s);
  g.bezierCurveTo(0.86 * s, 0.3 * s, 0.92 * s, 0.62 * s, 0.5 * s, 0.9 * s);
  g.fill();
  // keyhole
  g.fillStyle = hole;
  g.beginPath(); g.arc(0.5 * s, 0.56 * s, 0.06 * s, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(0.47 * s, 0.58 * s); g.lineTo(0.53 * s, 0.58 * s); g.lineTo(0.555 * s, 0.73 * s); g.lineTo(0.445 * s, 0.73 * s); g.closePath(); g.fill();
  return tex(c);
}
