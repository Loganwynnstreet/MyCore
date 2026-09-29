import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { makeFur, setFurPalette } from "./fur.js";
import * as T from "./textures.js";

/** Fur colours per look. root = at the skin, tip = the fluffy ends, rim = soft back-light. */
export const PALETTES = {
  cream: { root: "#e2c793", tip: "#fff4de", rim: "#fff1d6", belly: "#fff6e6", ear: "#f0a39a" },
  peach: { root: "#ee9f78", tip: "#ffdcc6", rim: "#ffd2b8", belly: "#ffe9da", ear: "#f59a9a" },
  sage:  { root: "#a6c68a", tip: "#e6f2d8", rim: "#e6f3d6", belly: "#eef6e4", ear: "#efaaa2" },
  lilac: { root: "#b39ddc", tip: "#f1eafc", rim: "#efe6ff", belly: "#f3edfb", ear: "#f0a0ba" },
};

/** World y of the floor; the body pivots (squashes) about this point. */
export const FLOOR = -0.86;
/** Halo diameter; kept inside the canvas so its soft edge never shows as a box. */
export const HALO = 3.7;
const R = new THREE.Vector3(1.02, 0.96, 0.94); // body ellipsoid radii

const P = (x, y, z) => new THREE.Vector3(x, y - FLOOR, z); // world -> pivot space
const up = new THREE.Vector3(0, 0, 1);

/** A point on the body ellipsoid plus its outward orientation. */
function surface(az, el, lift = 0) {
  const d = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  const pos = new THREE.Vector3(d.x * R.x, d.y * R.y, d.z * R.z);
  const n = new THREE.Vector3(pos.x / (R.x * R.x), pos.y / (R.y * R.y), pos.z / (R.z * R.z)).normalize();
  pos.addScaledVector(n, lift);
  return { pos, quat: new THREE.Quaternion().setFromUnitVectors(up, n), normal: n };
}

function bodyGeometry() {
  let g = new THREE.SphereGeometry(1, 96, 64);
  g.deleteAttribute("uv");
  g = mergeVertices(g, 1e-4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let y = p.getY(i) * R.y;
    const x = p.getX(i) * R.x, z = p.getZ(i) * R.z;
    if (y < -0.62) y = -0.62 + (y + 0.62) * 0.5; // a soft flat bottom so she sits on the floor
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

const ellipsoid = (rx, ry, rz, seg = 40) => {
  let g = new THREE.SphereGeometry(1, seg, seg * 0.66);
  g.deleteAttribute("uv");
  g = mergeVertices(g, 1e-4);
  g.scale(rx, ry, rz);
  g.computeVertexNormals();
  return g;
};

const gloss = (color, extra = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.15, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, ...extra });

export function buildModel(look) {
  const pal = PALETTES[look];
  const furParts = [];
  const fur = (geo, o) => { const f = makeFur(geo, o, pal); furParts.push(f); return f; };

  const root = new THREE.Group();
  const pivot = new THREE.Group(); // squash & stretch happens here
  pivot.position.set(0, FLOOR, 0);
  root.add(pivot);

  // ---- body ---------------------------------------------------------------
  const bodyFur = fur(bodyGeometry(), { length: 0.075, density: 62, layers: 26, faceShort: 0.86, gravity: 0.035 });
  bodyFur.group.position.copy(P(0, 0, 0));
  pivot.add(bodyFur.group);

  const belly = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.85),
    new THREE.MeshBasicMaterial({ map: T.radialTexture([[0, "rgba(255,247,232,.95)"], [0.6, "rgba(255,247,232,.55)"], [1, "rgba(255,247,232,0)"]]), transparent: true, depthWrite: false }));
  {
    const s = surface(0, -0.62, 0.012);
    belly.position.copy(s.pos).sub(new THREE.Vector3(0, FLOOR, 0));
    belly.quaternion.copy(s.quat);
  }
  pivot.add(belly);

  // ---- ears, tuft, feet, arms --------------------------------------------
  const ears = [-1, 1].map((side) => {
    const ear = new THREE.Group();
    ear.position.copy(P(side * 0.66, 0.74, 0.04));
    ear.userData.side = side;
    const f = fur(ellipsoid(0.26, 0.3, 0.16), { length: 0.035, density: 95, layers: 12, gravity: 0.01 });
    f.group.position.set(0, 0.2, 0);
    const inner = new THREE.Mesh(ellipsoid(0.14, 0.19, 0.05, 24), new THREE.MeshStandardMaterial({ color: pal.ear, roughness: 0.9 }));
    inner.position.set(0, 0.2, 0.135);
    ear.add(f.group, inner);
    ear.rotation.z = -side * 0.42;
    pivot.add(ear);
    return { group: ear, inner, fur: f, side };
  });

  const tuft = new THREE.Group();
  tuft.position.copy(P(0, 0.95, 0.06));
  const tuftBlades = [-0.5, 0.04, 0.52].map((rz, i) => {
    const blade = fur(ellipsoid(0.06, 0.2 - i * 0.02, 0.05, 20), { length: 0.02, density: 140, layers: 8, gravity: 0.005 });
    blade.group.position.set(0, 0.11, 0);
    const holder = new THREE.Group();
    holder.rotation.z = rz;
    holder.add(blade.group);
    tuft.add(holder);
    return holder;
  });
  pivot.add(tuft);

  const feet = [-1, 1].map((side) => {
    const f = fur(ellipsoid(0.3, 0.15, 0.36, 28), { length: 0.03, density: 90, layers: 10, gravity: 0.005 });
    f.group.position.copy(P(side * 0.44, -0.79, 0.26));
    pivot.add(f.group);
    return f;
  });

  const arms = [-1, 1].map((side) => {
    const shoulder = new THREE.Group();
    shoulder.position.copy(P(side * 0.93, 0.08, 0.06));
    const f = fur(ellipsoid(0.17, 0.34, 0.17, 32), { length: 0.035, density: 80, layers: 12, gravity: 0.008 });
    f.group.position.set(0, -0.27, 0);
    shoulder.add(f.group);
    shoulder.rotation.z = side * 0.34;
    pivot.add(shoulder);
    return { group: shoulder, fur: f, side };
  });

  // ---- face -----------------------------------------------------------------
  const face = new THREE.Group();
  pivot.add(face);

  const eyes = [-1, 1].map((side) => {
    const s = surface(side * 0.34, 0.07, 0.01);
    const g = new THREE.Group();
    g.position.copy(s.pos).sub(new THREE.Vector3(0, FLOOR, 0));
    g.quaternion.copy(s.quat);
    const ball = new THREE.Mesh(ellipsoid(0.1, 0.122, 0.055, 32), gloss("#241a1e", { roughness: 0.08, clearcoat: 1 }));
    ball.position.z = 0.02;
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.032, 16, 12), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
    glint.position.set(0.034, 0.05, 0.062);
    const glint2 = new THREE.Mesh(new THREE.SphereGeometry(0.015, 12, 10), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
    glint2.position.set(-0.034, -0.045, 0.06);
    const eye = new THREE.Group();
    eye.add(ball, glint, glint2);
    g.add(eye);
    face.add(g);
    return { holder: g, eye, side };
  });

  const cheeks = [-1, 1].map((side) => {
    const s = surface(side * 0.66, -0.12, 0.018);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.24),
      new THREE.MeshBasicMaterial({ map: T.radialTexture([[0, "rgba(255,120,120,.95)"], [0.55, "rgba(255,130,130,.55)"], [1, "rgba(255,140,140,0)"]]), transparent: true, depthWrite: false, opacity: 0.85 }));
    m.position.copy(s.pos).sub(new THREE.Vector3(0, FLOOR, 0));
    m.quaternion.copy(s.quat);
    face.add(m);
    return m;
  });

  const brows = [-1, 1].map((side) => {
    const s = surface(side * 0.34, 0.3, 0.012);
    const g = new THREE.Group();
    g.position.copy(s.pos).sub(new THREE.Vector3(0, FLOOR, 0));
    g.quaternion.copy(s.quat);
    const brow = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.13, 6, 10), new THREE.MeshStandardMaterial({ color: "#6b5252", roughness: 0.8 }));
    brow.rotation.z = Math.PI / 2;
    const holder = new THREE.Group();
    holder.add(brow);
    g.add(holder);
    face.add(g);
    return { holder, base: g.position.clone(), side, group: g };
  });

  // mouth: a tube for the smile line and a filled shape for the open mouth, rebuilt when the shape changes
  const mouthAnchor = new THREE.Group();
  {
    const s = surface(0, -0.16, 0.014);
    mouthAnchor.position.copy(s.pos).sub(new THREE.Vector3(0, FLOOR, 0));
    mouthAnchor.quaternion.copy(s.quat);
  }
  const mouthLine = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: "#2b2226", roughness: 0.6 }));
  const mouthOpen = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: "#7d3a3a", side: THREE.DoubleSide }));
  const tongue = new THREE.Mesh(new THREE.CircleGeometry(0.05, 20), new THREE.MeshBasicMaterial({ color: "#ee8f95", side: THREE.DoubleSide }));
  mouthOpen.position.z = 0.002;
  tongue.position.z = 0.004;
  mouthAnchor.add(mouthLine, mouthOpen, tongue);
  face.add(mouthAnchor);

  // ---- charm on a lanyard -------------------------------------------------------
  const charmRoot = new THREE.Group();
  const stringPts = [];
  for (let i = 0; i <= 24; i++) {
    const u = i / 24;
    const x = (u - 0.5) * 0.7;
    const y = -0.2 - 0.2 * Math.sin(Math.PI * u) ** 0.9;
    const z = R.z * Math.sqrt(Math.max(0.05, 1 - (x / R.x) ** 2 - (y / R.y) ** 2)) + 0.02;
    stringPts.push(new THREE.Vector3(x, y, z).sub(new THREE.Vector3(0, FLOOR, 0)));
  }
  const string = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(stringPts), 40, 0.011, 6, false),
    new THREE.MeshStandardMaterial({ color: "#b9791c", roughness: 0.55, metalness: 0.4 }));
  charmRoot.add(string);

  const pendantPivot = new THREE.Group();
  pendantPivot.position.copy(stringPts[12]);
  pendantPivot.scale.setScalar(0.82);
  const gold = new THREE.MeshStandardMaterial({ color: "#ffc63a", metalness: 0.95, roughness: 0.22, emissive: "#ff9d1a", emissiveIntensity: 0.25 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.017, 14, 32), gold);
  ring.position.y = -0.06;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.17, 12), gold);
  shaft.position.y = -0.19;
  const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.024, 0.02), gold);
  t1.position.set(0.04, -0.235, 0);
  const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.024, 0.02), gold);
  t2.position.set(0.03, -0.195, 0);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.radialTexture([[0, "rgba(255,213,107,1)"], [0.4, "rgba(255,190,80,.45)"], [1, "rgba(255,190,80,0)"]]),
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest: false,
  }));
  glow.position.set(0, -0.15, 0.06);
  glow.scale.setScalar(0.7);
  glow.renderOrder = 5;
  pendantPivot.add(ring, shaft, t1, t2, glow);
  charmRoot.add(pendantPivot);
  pivot.add(charmRoot);

  // ---- accessories ------------------------------------------------------------------
  const gear = new THREE.MeshStandardMaterial({ color: "#3a3742", roughness: 0.45, metalness: 0.2 });
  const headphones = new THREE.Group();
  {
    const band = new THREE.Mesh(new THREE.TorusGeometry(1.06, 0.055, 16, 64, Math.PI), gear);
    band.position.copy(P(0, 0.02, 0.02));
    band.rotation.y = 0;
    headphones.add(band);
    for (const side of [-1, 1]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.2, 32), gear);
      cup.rotation.z = Math.PI / 2;
      cup.position.copy(P(side * 1.07, 0.03, 0.02));
      const accent = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 12, 32), new THREE.MeshStandardMaterial({ color: "#f0895d", roughness: 0.4, emissive: "#f0895d", emissiveIntensity: 0.15 }));
      accent.rotation.y = Math.PI / 2;
      accent.position.copy(P(side * 1.185, 0.03, 0.02));
      headphones.add(cup, accent);
    }
  }
  const sunglasses = new THREE.Group();
  {
    const shape = new THREE.Shape();
    const w = 0.36, h = 0.24, r = 0.1;
    shape.moveTo(-w / 2 + r, -h / 2); shape.lineTo(w / 2 - r, -h / 2); shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    shape.lineTo(w / 2, h / 2 - r); shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); shape.lineTo(-w / 2 + r, h / 2);
    shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); shape.lineTo(-w / 2, -h / 2 + r); shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    const lensGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 3, curveSegments: 16 });
    const lensMat = gloss("#17151c", { roughness: 0.05, metalness: 0.4, clearcoat: 1 });
    for (const side of [-1, 1]) {
      const s = surface(side * 0.34, 0.07, 0.05);
      const l = new THREE.Mesh(lensGeo, lensMat);
      l.position.copy(s.pos).sub(new THREE.Vector3(0, FLOOR, 0));
      l.quaternion.copy(s.quat);
      sunglasses.add(l);
    }
    const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 8), lensMat);
    bridge.rotation.z = Math.PI / 2;
    {
      const s = surface(0, 0.09, 0.075);
      bridge.position.copy(s.pos).sub(new THREE.Vector3(0, FLOOR, 0));
    }
    sunglasses.add(bridge);
  }
  pivot.add(headphones, sunglasses);

  // ---- keyboard shown while she works ---------------------------------------------------
  const desk = new THREE.Group();
  {
    const kb = new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.07, 0.5, 4, 0.03), new THREE.MeshStandardMaterial({ color: "#5b5560", roughness: 0.5, metalness: 0.2 }));
    const keyGeo = new RoundedBoxGeometry(0.09, 0.03, 0.08, 3, 0.012);
    const keys = new THREE.InstancedMesh(keyGeo, new THREE.MeshStandardMaterial({ color: "#a29aac", roughness: 0.5 }), 24);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 24; i++) {
      const row = Math.floor(i / 8), col = i % 8;
      m.setPosition(-0.4 + col * 0.115, 0.05, -0.15 + row * 0.13);
      keys.setMatrixAt(i, m);
    }
    desk.add(kb, keys);
    desk.position.copy(P(0, -0.62, 1.02));
    desk.rotation.x = 0.28;
    desk.visible = false;
  }
  pivot.add(desk);

  // ---- background glow and contact shadow ----------------------------------------------------
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.radialTexture([[0, "rgba(255,213,120,.85)"], [0.55, "rgba(255,200,110,.3)"], [1, "rgba(255,200,110,0)"]], 256),
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  }));
  halo.position.set(0, 0.08, -1.0);
  halo.scale.setScalar(HALO);
  root.add(halo);

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3),
    new THREE.MeshBasicMaterial({ map: T.shadowTexture(), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, FLOOR - 0.06, 0.05);
  root.add(shadow);

  // ---- floating status sprites -----------------------------------------------------------------
  const sprite = (map, size, blend) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, depthTest: false, opacity: 0, ...(blend ? { blending: blend } : {}) }));
    s.scale.setScalar(size);
    s.renderOrder = 8;
    root.add(s);
    return s;
  };
  const zzz = [[1.1, 1.05, 0.34], [1.42, 1.4, 0.26], [1.66, 1.74, 0.2]].map(([x, y, s]) => {
    const sp = sprite(T.glyphTexture("z", "#fffaf4", "#8a7378"), s);
    sp.position.set(x, y, 0.3);
    sp.userData.home = sp.position.clone();
    return sp;
  });
  const bang = sprite(T.glyphTexture("!", "#ffd56b", "#b9791c"), 0.75);
  bang.position.set(1.25, 1.2, 0.3);
  const thought = [[1.05, 0.95, 0.16], [1.25, 1.25, 0.24], [1.55, 1.68, 0.4]].map(([x, y, s]) => {
    const sp = sprite(T.bubbleTexture(), s);
    sp.position.set(x, y, 0.3);
    sp.userData.home = sp.position.clone();
    return sp;
  });

  // ---- sparkle pool ---------------------------------------------------------------------------------
  const sparkTex = T.sparkleTexture();
  const sparks = Array.from({ length: 34 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, transparent: true, depthWrite: false, depthTest: false, opacity: 0, blending: THREE.AdditiveBlending }));
    s.renderOrder = 9;
    s.userData = { life: 0, vel: new THREE.Vector3(), spin: 0 };
    root.add(s);
    return s;
  });

  const setLook = (name) => {
    const p = PALETTES[name];
    for (const f of furParts) setFurPalette(f, p);
    for (const e of ears) e.inner.material.color.set(p.ear);
  };

  return {
    root, pivot, furParts, bodyFur, ears, tuft, tuftBlades, feet, arms, face, eyes, cheeks, brows,
    mouth: { anchor: mouthAnchor, line: mouthLine, open: mouthOpen, tongue },
    charm: { root: charmRoot, pendant: pendantPivot, glow },
    acc: { headphones, sunglasses }, desk, halo, shadow, belly,
    fx: { zzz, bang, thought, sparks }, setLook,
  };
}
