import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { toonMaterial, inked } from "./toon.js";
import { TaperTube } from "./tube.js";
import * as T from "./textures.js";

/**
 * A chubby long-necked dino in denim shorts. Modelled side-on (head at -x, tail at +x) and turned
 * three-quarters to the camera. Smooth cel-shaded surfaces with ink outlines.
 */

export const PALETTES = {
  green:  { body: "#35b872", light: "#a8eea3", feet: "#2a9a5f", ink: "#0c4a3a", heart: "#b2f2ac" },
  blue:   { body: "#4aa8e0", light: "#bde6ff", feet: "#3689bb", ink: "#0f3f63", heart: "#c9ecff" },
  pink:   { body: "#f07aa8", light: "#ffd3e4", feet: "#d05f8c", ink: "#6b1f45", heart: "#ffe0ec" },
  orange: { body: "#f39a3d", light: "#ffdba8", feet: "#d17f25", ink: "#6b3410", heart: "#ffe6bd" },
};

export const FLOOR = -0.86;
export const HALO = 4.6;

const col = (hex) => new THREE.Color(hex);
const ss = THREE.MathUtils.smoothstep;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const smoothEllipsoid = (rx, ry, rz, seg = 48) => {
  let g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7));
  g.deleteAttribute("uv");
  g = mergeVertices(g, 1e-4);
  g.scale(rx, ry, rz);
  g.computeVertexNormals();
  return g;
};

const gloss = (color, extra = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05, ...extra });

export function buildDino(look) {
  const pal = { ...PALETTES[look] };
  const C = { body: col(pal.body), light: col(pal.light), feet: col(pal.feet), ink: col(pal.ink) };
  const W = 0.038; // outline thickness

  const root = new THREE.Group();
  const pivot = new THREE.Group(); // squash & stretch about the floor
  pivot.position.set(0, FLOOR, 0);
  root.add(pivot);
  const dino = new THREE.Group(); // three-quarter turn
  dino.position.set(0, -FLOOR, 0);
  pivot.add(dino);

  // ---- colour rules: light on the front (throat and belly), body green elsewhere -------------
  const frontLight = (n, u, out) => { out.copy(C.body).lerp(C.light, 1 - ss(n.x, -0.66, -0.48)); };
  const tailLight = (n, u, out) => { out.copy(C.body).lerp(C.light, 1 - ss(n.y, -0.5, -0.32)); };

  // ---- torso -----------------------------------------------------------------------------------
  const torsoGeo = (() => {
    const g = smoothEllipsoid(1, 1, 1, 64);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const rear = 1 + 0.1 * x;                 // a heavier back end
      y = y * 1.0 * rear; z = z * 0.98 * (1 + 0.08 * x); x = x * 1.12 + 0.1;
      if (y < -0.7) y = -0.7 + (y + 0.7) * 0.45; // flat bottom
      p.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    const n = g.attributes.normal, c = new Float32Array(p.count * 3), t = new THREE.Color(), v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(n, i);
      frontLight(v, 0, t);
      c.set([t.r, t.g, t.b], i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(c, 3));
    return g;
  })();
  const bodyMat = toonMaterial({ vertexColors: true });
  const torso = inked(torsoGeo, bodyMat, { color: C.ink, width: W });
  dino.add(torso.mesh);
  const recolorTorso = () => {
    const n = torsoGeo.attributes.normal, c = torsoGeo.attributes.color, t = new THREE.Color(), v = new THREE.Vector3();
    for (let i = 0; i < n.count; i++) { v.fromBufferAttribute(n, i); frontLight(v, 0, t); c.setXYZ(i, t.r, t.g, t.b); }
    c.needsUpdate = true;
  };

  // ---- neck (re-shaped every frame) and tail ---------------------------------------------------
  const neckTube = new TaperTube(44, 20);
  const neck = inked(neckTube.geometry, bodyMat, { color: C.ink, width: W });
  dino.add(neck.mesh);
  const tailTube = new TaperTube(36, 16);
  const tail = inked(tailTube.geometry, bodyMat, { color: C.ink, width: W });
  dino.add(tail.mesh);

  // ---- head ------------------------------------------------------------------------------------
  const headPivot = new THREE.Group();
  dino.add(headPivot);
  const headGeo = smoothEllipsoid(0.56, 0.44, 0.44, 48);
  {
    const p = headGeo.attributes.position, c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) c.set([C.body.r, C.body.g, C.body.b], i * 3);
    headGeo.setAttribute("color", new THREE.BufferAttribute(c, 3));
  }
  const head = inked(headGeo, bodyMat, { color: C.ink, width: W });
  head.mesh.position.set(-0.16, 0.02, 0);
  headPivot.add(head.mesh);

  const HR = V(0.56, 0.44, 0.44);
  const onHead = (az, el, lift = 0) => {
    const d = V(-Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
    const pos = V(d.x * HR.x, d.y * HR.y, d.z * HR.z);
    const n = V(pos.x / (HR.x * HR.x), pos.y / (HR.y * HR.y), pos.z / (HR.z * HR.z)).normalize();
    pos.addScaledVector(n, lift).add(V(-0.16, 0.02, 0));
    return { pos, quat: new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), n), normal: n };
  };

  const eyes = [-1, 1].map((side) => {
    const s = onHead(side * 0.72, 0.2, 0.008);
    const holder = new THREE.Group();
    holder.position.copy(s.pos); holder.quaternion.copy(s.quat);
    const ball = new THREE.Mesh(smoothEllipsoid(0.075, 0.09, 0.04, 24), gloss("#171016", { roughness: 0.08 }));
    ball.position.z = 0.012;
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), new THREE.MeshBasicMaterial({ color: "#fff" }));
    glint.position.set(0.024, 0.036, 0.04);
    const eye = new THREE.Group();
    eye.add(ball, glint);
    holder.add(eye);
    headPivot.add(holder);
    return { holder, eye, side };
  });

  const brows = [-1, 1].map((side) => {
    const s = onHead(side * 0.72, 0.62, 0.006);
    const holder = new THREE.Group();
    holder.position.copy(s.pos); holder.quaternion.copy(s.quat);
    const inner = new THREE.Group();
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.1, 6, 10), new THREE.MeshBasicMaterial({ color: C.ink }));
    b.rotation.z = Math.PI / 2;
    inner.add(b);
    holder.add(inner);
    headPivot.add(holder);
    return { holder: inner, side };
  });

  const cheeks = [-1, 1].map((side) => {
    const s = onHead(side * 1.0, -0.1, 0.01);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.17),
      new THREE.MeshBasicMaterial({ map: T.radialTexture([[0, "rgba(255,130,140,.9)"], [0.6, "rgba(255,140,150,.45)"], [1, "rgba(255,150,160,0)"]]), transparent: true, depthWrite: false, opacity: 0.4 }));
    m.position.copy(s.pos); m.quaternion.copy(s.quat);
    headPivot.add(m);
    return m;
  });

  const nostrils = [-1, 1].map((side) => {
    const s = onHead(side * 0.2, 0.16, 0.004);
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), new THREE.MeshBasicMaterial({ color: C.ink }));
    m.position.copy(s.pos);
    headPivot.add(m);
    return m;
  });

  const mouthAnchor = new THREE.Group();
  {
    const s = onHead(0, -0.28, 0.012);
    mouthAnchor.position.copy(s.pos);
    mouthAnchor.quaternion.copy(s.quat);
  }
  const mouthLine = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: C.ink }));
  const mouthOpen = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: "#7b2f3a", side: THREE.DoubleSide }));
  const tongue = new THREE.Mesh(new THREE.CircleGeometry(0.045, 20), new THREE.MeshBasicMaterial({ color: "#ff8f9a", side: THREE.DoubleSide }));
  mouthOpen.position.z = 0.002; tongue.position.z = 0.004;
  mouthAnchor.add(mouthLine, mouthOpen, tongue);
  headPivot.add(mouthAnchor);

  // ---- legs / feet -----------------------------------------------------------------------------
  const feetMat = toonMaterial({ color: C.feet });
  const mkFoot = (x, z, big = 1) => {
    const f = inked(smoothEllipsoid(0.3 * big, 0.17 * big, 0.3 * big, 28), feetMat, { color: C.ink, width: W * 0.8 });
    f.mesh.position.set(x, -0.84, z);
    dino.add(f.mesh);
    return f.mesh;
  };
  const feet = { fl: mkFoot(-0.66, 0.5), fr: mkFoot(-0.66, -0.5), rl: mkFoot(0.7, 0.55, 1.08), rr: mkFoot(0.7, -0.55, 1.08) };

  // ---- denim shorts --------------------------------------------------------------------------------
  const shorts = new THREE.Group();
  {
    // nearly straight sides with a slight flare at the hem, like short denim shorts
    const prof = [];
    for (let i = 0; i <= 16; i++) {
      const u = i / 16;                       // 0 = hem, 1 = waist
      const y = -0.8 + 0.5 * u;
      const r = 1.06 + 0.1 * u + 0.05 * Math.sin(u * Math.PI);
      prof.push(new THREE.Vector2(r, y));
    }
    const geo = new THREE.LatheGeometry(prof, 72);
    const denim = T.denimTexture();
    const mat = toonMaterial({ map: denim, side: THREE.DoubleSide });
    const body = inked(geo, mat, { color: col("#173a5e"), width: W * 0.85 });
    body.mesh.position.x = 0.1;
    body.mesh.scale.z = 0.9;
    shorts.add(body.mesh);
    const band = inked(new THREE.TorusGeometry(1.2, 0.075, 14, 72), toonMaterial({ color: "#5d93c6" }), { color: col("#173a5e"), width: W * 0.7 });
    band.mesh.rotation.x = Math.PI / 2;
    band.mesh.position.set(0.1, -0.29, 0);
    band.mesh.scale.set(1, 0.9, 1);
    shorts.add(band.mesh);
    // belt loops
    for (const a of [-1.15, -0.6, 0.6, 1.15, Math.PI]) {
      const phi = (3 * Math.PI) / 2 + a;
      const loop = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.17, 0.05, 2, 0.015), toonMaterial({ color: "#5d93c6" }));
      loop.position.set(0.1 + Math.sin(phi) * 1.27, -0.32, Math.cos(phi) * 1.27 * 0.9);
      loop.rotation.y = phi;
      shorts.add(loop);
    }
    // button
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.035, 20), new THREE.MeshStandardMaterial({ color: "#d8c8a0", metalness: 0.8, roughness: 0.35 }));
    btn.rotation.z = Math.PI / 2;
    btn.position.set(0.1 - 1.27, -0.33, 0);
    shorts.add(btn);
  }
  dino.add(shorts);

  // ---- emblem (heart, keyhole, paw dots) -------------------------------------------------------------
  const emblemTex = { current: T.emblemTexture(pal.heart, pal.feet) };
  const emblem = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.85), new THREE.MeshBasicMaterial({ map: emblemTex.current, transparent: true, depthWrite: false }));
  {
    const pos = V(0.55, 0.32, 0.93);
    emblem.position.copy(pos);
    emblem.lookAt(pos.clone().add(V(0.22, 0.22, 1)));
  }
  const emblemGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.radialTexture([[0, "rgba(255,225,130,1)"], [0.45, "rgba(255,200,90,.4)"], [1, "rgba(255,200,90,0)"]]),
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest: false, opacity: 0,
  }));
  emblemGlow.position.copy(emblem.position).add(V(0.05, 0.05, 0.12));
  emblemGlow.scale.setScalar(1.15);
  emblemGlow.renderOrder = 5;
  dino.add(emblem, emblemGlow);

  // ---- accessories -----------------------------------------------------------------------------------------
  const gear = new THREE.MeshStandardMaterial({ color: "#3a3742", roughness: 0.45, metalness: 0.2 });
  const headphones = new THREE.Group();
  {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.045, 14, 48, Math.PI), gear);
    band.rotation.y = Math.PI / 2;
    band.position.set(-0.12, 0.02, 0);
    headphones.add(band);
    for (const side of [-1, 1]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.14, 28), gear);
      cup.rotation.x = Math.PI / 2;
      cup.position.set(-0.12, 0.02, side * 0.47);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.022, 10, 28), new THREE.MeshStandardMaterial({ color: "#f0895d", roughness: 0.4, emissive: "#f0895d", emissiveIntensity: 0.15 }));
      ring.position.set(-0.12, 0.02, side * 0.545);
      headphones.add(cup, ring);
    }
  }
  const sunglasses = new THREE.Group();
  {
    const lensMat = gloss("#15131a", { roughness: 0.05, metalness: 0.4 });
    for (const side of [-1, 1]) {
      const s = onHead(side * 0.72, 0.2, 0.03);
      const l = new THREE.Mesh(smoothEllipsoid(0.13, 0.1, 0.03, 24), lensMat);
      l.position.copy(s.pos); l.quaternion.copy(s.quat);
      sunglasses.add(l);
    }
    const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 8), lensMat);
    const b = onHead(0, 0.2, 0.04);
    bridge.position.copy(b.pos);
    sunglasses.add(bridge);
  }
  headPivot.add(headphones, sunglasses);

  // ---- keyboard shown while she works ---------------------------------------------------------------------------
  const desk = new THREE.Group();
  {
    const kb = new THREE.Mesh(new RoundedBoxGeometry(0.55, 0.07, 1.05, 4, 0.03), new THREE.MeshStandardMaterial({ color: "#5b5560", roughness: 0.5, metalness: 0.2 }));
    const keys = new THREE.InstancedMesh(new RoundedBoxGeometry(0.09, 0.03, 0.08, 3, 0.012), new THREE.MeshStandardMaterial({ color: "#a29aac", roughness: 0.5 }), 24);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 24; i++) {
      const row = Math.floor(i / 8), col2 = i % 8;
      m.setPosition(-0.17 + row * 0.16, 0.05, -0.4 + col2 * 0.115);
      keys.setMatrixAt(i, m);
    }
    desk.add(kb, keys);
    desk.position.set(-1.2, -0.62, 0);
    desk.rotation.z = -0.22;
    desk.visible = false;
  }
  dino.add(desk);

  // ---- glow, shadow, sprites ---------------------------------------------------------------------------------------------
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.radialTexture([[0, "rgba(255,225,140,.75)"], [0.55, "rgba(255,215,130,.28)"], [1, "rgba(255,215,130,0)"]], 256),
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  }));
  halo.position.set(0.15, 0.7, -1.2);
  halo.scale.setScalar(HALO);
  root.add(halo);

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.7), new THREE.MeshBasicMaterial({ map: T.shadowTexture(), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0.25, FLOOR - 0.04, 0);
  root.add(shadow);

  const sprite = (map, size) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, depthTest: false, opacity: 0 }));
    s.scale.setScalar(size); s.renderOrder = 8; root.add(s); return s;
  };
  const zzz = [[0.55, 0.5, 0.34], [0.85, 0.85, 0.26], [1.08, 1.18, 0.2]].map(([x, y, s]) => { const sp = sprite(T.glyphTexture("z", "#fffaf4", "#5f7a6c"), s); sp.userData.off = V(x, y, 0.3); return sp; });
  const bang = sprite(T.glyphTexture("!", "#ffd56b", "#b9791c"), 0.72);
  bang.userData.off = V(0.8, 0.75, 0.3);
  const thought = [[0.5, 0.45, 0.16], [0.72, 0.75, 0.24], [1.02, 1.15, 0.4]].map(([x, y, s]) => { const sp = sprite(T.bubbleTexture(), s); sp.userData.off = V(x, y, 0.3); sp.userData.base = s; return sp; });

  const sparkTex = T.sparkleTexture();
  const sparks = Array.from({ length: 34 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, transparent: true, depthWrite: false, depthTest: false, opacity: 0, blending: THREE.AdditiveBlending }));
    s.renderOrder = 9;
    s.userData = { life: 0, max: 1, size: 0.2, vel: new THREE.Vector3() };
    root.add(s);
    return s;
  });

  // ---- posing: re-shape the neck and tail from a few parameters ------------------------------------------------------------------
  const head0 = V(0, 0, 0);
  const lerpV = (a, b, t) => a.clone().lerp(b, t);
  function pose(p) {
    // neck: an upright S-curve blended towards a head-down resting curve
    const stretch = p.neckUp; // -1 droop .. +1 stretch tall
    const up = [V(-0.35, 0.35, 0), V(-0.78, 0.9, 0), V(-0.98, 1.5 + 0.12 * stretch, 0), V(-0.86 - 0.05 * stretch, 2.0 + 0.2 * stretch - (stretch < 0 ? 0.2 * -stretch : 0), 0)];
    const rest = [V(-0.35, 0.35, 0), V(-0.85, 0.72, 0.05), V(-1.22, 0.86, 0.22), V(-1.3, 0.6, 0.36)];
    const pts = up.map((a, i) => lerpV(a, rest[i], p.slump));
    pts[1].z += p.sway * 0.3; pts[2].z += p.sway * 0.7; pts[3].z += p.sway; pts[3].x += p.reach * 0.06;
    const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.5);
    neckTube.update(curve, (u) => 0.56 - 0.24 * Math.pow(u, 0.8), frontLight);
    head0.copy(pts[3]);
    headPivot.position.copy(pts[3]);
    // tail: base buried in the torso, tip curling up, waving with the wag
    const w = p.wag;
    const tpts = [V(0.6, -0.05, 0), V(1.3, -0.2 + p.tailLift * 0.2, w[0]), V(2.0, -0.02 + p.tailLift * 0.5, w[1]), V(2.55, 0.45 + p.tailLift * 0.7, w[2])];
    tailTube.update(new THREE.CatmullRomCurve3(tpts, false, "catmullrom", 0.5), (u) => 0.42 * (1 - Math.pow(u, 0.9)) + 0.03, tailLight);
  }

  const setLook = (name) => {
    const P = PALETTES[name];
    C.body.set(P.body); C.light.set(P.light); C.feet.set(P.feet); C.ink.set(P.ink);
    feetMat.color.copy(C.feet);
    for (const h of [torso.hull, neck.hull, tail.hull, head.hull]) h.material.color.copy(C.ink);
    for (const f of Object.values(feet)) f.children[0].material.color.copy(C.ink);
    for (const n of nostrils) n.material.color.copy(C.ink);
    for (const b of brows) b.holder.children[0].material.color.copy(C.ink);
    mouthLine.material.color.copy(C.ink);
    const hc = headGeo.attributes.color;
    for (let i = 0; i < hc.count; i++) hc.setXYZ(i, C.body.r, C.body.g, C.body.b);
    hc.needsUpdate = true;
    recolorTorso();
    emblem.material.map = T.emblemTexture(P.heart, P.feet);
    emblem.material.needsUpdate = true;
  };

  return {
    root, pivot, dino, headPivot, head, eyes, brows, cheeks, mouth: { anchor: mouthAnchor, line: mouthLine, open: mouthOpen, tongue },
    feet, emblem, emblemGlow, acc: { headphones, sunglasses }, desk, halo, shadow, fx: { zzz, bang, thought, sparks },
    pose, setLook, headWorld: head0,
  };
}
