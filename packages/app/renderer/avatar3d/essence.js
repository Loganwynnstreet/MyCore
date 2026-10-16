import * as THREE from "three";
import * as T from "./textures.js";

/**
 * The guide as a faceless "essence": a luminous blob whose surface is displaced by 3D simplex noise,
 * filled with flowing colour, wrapped in a soft aura, with ripples and drifting motes around it.
 * No face, no limbs: her mood shows up as motion, colour and light.
 */

export const PALETTES = {
  aurora: { a: "#5ee7df", b: "#b490ff", c: "#6aa8ff" },
  ember:  { a: "#ff9a62", b: "#ff5f9e", c: "#ffd36b" },
  ocean:  { a: "#4cc9f0", b: "#4361ee", c: "#a0e7ff" },
  mint:   { a: "#7be0a5", b: "#2ec4b6", c: "#d4fc79" },
};

/** Shape presets: multipliers on the noise displacement and a vertical stretch. */
export const FORMS = {
  orb:  { amp: 0.7, freq: 1.0, stretch: 1.0, taper: 0 },
  blob: { amp: 1.55, freq: 0.85, stretch: 1.0, taper: 0 },
  wisp: { amp: 0.8, freq: 1.0, stretch: 1.38, taper: 0.5 },
};

const NOISE = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}`;

const VERT = /* glsl */ `
${NOISE}
uniform float uTime, uAmp, uAmpMul, uFreq, uSpeed, uStretch, uJitter, uPulse, uScale, uTaper;
uniform vec3 uLook;
varying vec3 vN, vView, vObj;
varying float vDisp;

vec3 displaced(vec3 p) {
  float t = uTime * uSpeed;
  vec3 q = p * uFreq;
  float n = snoise(q + vec3(0.0, t, t * 0.6)) + 0.22 * snoise(q * 1.8 - vec3(t * 1.2, 0.0, t));
  n += uJitter * snoise(q * 5.0 + vec3(t * 6.0));
  float d = n * uAmp * uAmpMul;
  d += sin(p.y * 5.0 + uTime * 3.0) * uPulse * 0.02;   // voice-like ripples travelling up the surface
  vec3 pp = p * (1.0 + d);
  pp.xz *= 1.0 - uTaper * (0.5 - 0.5 * normalize(p).y);   // narrower at the bottom: a teardrop / flame
  pp.y *= uStretch;
  pp += uLook * 0.12 * (0.6 + 0.4 * dot(normalize(p), normalize(uLook + vec3(1e-4))));
  return pp * uScale;
}

void main() {
  vec3 n0 = normalize(normal);
  vec3 t1 = normalize(cross(n0, abs(n0.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 t2 = cross(n0, t1);
  float e = 0.02, r = length(position);
  vec3 a = displaced(position);
  vec3 b = displaced(normalize(position + t1 * e) * r);
  vec3 c = displaced(normalize(position + t2 * e) * r);
  vec3 nn = normalize(cross(b - a, c - a));
  if (dot(nn, n0) < 0.0) nn = -nn;
  vN = normalize(normalMatrix * nn);
  vObj = position;
  vDisp = length(a) / max(uScale, 0.001) - 1.0;
  vec4 mv = modelViewMatrix * vec4(a, 1.0);
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG_BLOB = /* glsl */ `
${NOISE}
uniform float uTime, uSwirl, uGlow, uDim;
uniform vec3 uA, uB, uC;
varying vec3 vN, vView, vObj;
varying float vDisp;

void main() {
  vec3 N = normalize(vN), V = normalize(vView);
  float ndv = max(dot(N, V), 0.0);
  float fres = pow(1.0 - ndv, 2.2);

  // flowing colour: rotate the lookup around the vertical axis, then mix three colours through noise
  float ang = uTime * uSwirl * 0.6;
  vec3 q = vec3(vObj.x * cos(ang) - vObj.z * sin(ang), vObj.y, vObj.x * sin(ang) + vObj.z * cos(ang));
  float g = snoise(q * 1.3 + vec3(0.0, uTime * 0.25 * (0.3 + uSwirl), 0.0)) * 0.5 + 0.5;
  float h = snoise(q * 2.4 - vec3(uTime * 0.2 * (0.3 + uSwirl), 0.0, 0.0)) * 0.5 + 0.5;
  vec3 col = mix(uA, uB, smoothstep(0.15, 0.7, g));
  col = mix(col, uC, smoothstep(0.45, 0.95, h) * 0.8);

  // soft inner light: a bright, translucent core and drifting highlights
  float core = pow(ndv, 2.4);
  float hl = smoothstep(0.62, 0.98, snoise(q * 1.8 + vec3(uTime * 0.3, 0.0, uTime * 0.2)) * 0.5 + 0.5);
  col += vec3(1.0) * (core * 0.1 + hl * 0.1) * (0.3 + 0.5 * min(uGlow, 1.0));
  col *= 0.78 + 0.22 * dot(N, normalize(vec3(0.4, 0.8, 0.6)));
  col += mix(uA, vec3(1.0), 0.4) * fres * (0.45 + 0.5 * min(uGlow, 1.0));

  col = mix(col, col * 0.3 + vec3(0.025, 0.03, 0.07), uDim);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const FRAG_AURA = /* glsl */ `
uniform float uGlow;
uniform vec3 uA, uB;
varying vec3 vN, vView;
void main() {
  vec3 N = normalize(vN), V = normalize(vView);
  // drawn from the inside of a slightly larger shell, so the core hides the middle and only the
  // ring just beyond the silhouette shows: brightest next to the blob, fading outwards
  float f = pow(max(-dot(N, V), 0.0), 1.4);
  float a = f * min(uGlow, 1.0) * 0.7;
  vec3 col = mix(mix(uA, uB, 0.5 + 0.5 * N.y), vec3(1.0), 0.12);
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`;

export function buildEssence(look) {
  const root = new THREE.Group();
  const base = { a: new THREE.Color(), b: new THREE.Color(), c: new THREE.Color() };

  // uniforms shared by the core and the aura so both follow exactly the same surface
  const shared = {
    uTime: { value: 0 }, uAmp: { value: 0.16 }, uFreq: { value: 1.1 }, uSpeed: { value: 0.5 },
    uStretch: { value: 1 }, uTaper: { value: 0 }, uJitter: { value: 0 }, uPulse: { value: 0 },
    uLook: { value: new THREE.Vector3() },
    uSwirl: { value: 0.4 }, uGlow: { value: 0.5 }, uDim: { value: 0 },
    uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() }, uC: { value: new THREE.Color() },
  };
  const geo = new THREE.IcosahedronGeometry(1, 48);

  const blobMat = new THREE.ShaderMaterial({ uniforms: { ...shared, uScale: { value: 1 }, uAmpMul: { value: 1 } }, vertexShader: VERT, fragmentShader: FRAG_BLOB });
  const blob = new THREE.Mesh(geo, blobMat);
  blob.frustumCulled = false;

  const auraMat = new THREE.ShaderMaterial({
    uniforms: { ...shared, uScale: { value: 1.2 }, uAmpMul: { value: 0.45 } }, vertexShader: VERT, fragmentShader: FRAG_AURA,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
  });
  const aura = new THREE.Mesh(geo, auraMat);
  aura.frustumCulled = false;
  aura.renderOrder = 2;

  const pivot = new THREE.Group(); // floats, squashes and stretches
  pivot.add(blob, aura);
  root.add(pivot);

  // background glow
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.radialTexture([[0, "rgba(255,255,255,.55)"], [0.5, "rgba(255,255,255,.18)"], [1, "rgba(255,255,255,0)"]], 256),
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, color: 0xffffff,
  }));
  halo.position.z = -1.5;
  halo.scale.setScalar(5.2);
  root.add(halo);

  // a soft shadow far below sells the "floating"
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1), new THREE.MeshBasicMaterial({ map: T.shadowTexture(), transparent: true, depthWrite: false, opacity: 0.5 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, -1.75, 0);
  root.add(shadow);

  // ripples that spread outwards (alert, cheer)
  const ripples = Array.from({ length: 4 }, () => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.985, 1.0, 128), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffffff }));
    m.userData = { age: 9, life: 1.5 };
    m.visible = false;
    root.add(m);
    return m;
  });

  // drifting motes
  const dotTex = T.radialTexture([[0, "rgba(255,255,255,1)"], [0.4, "rgba(255,255,255,.6)"], [1, "rgba(255,255,255,0)"]], 64);
  const motes = Array.from({ length: 12 }, (_, i) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    s.userData = { r: 1.45 + (i % 4) * 0.2, speed: 0.25 + (i % 5) * 0.07, phase: (i / 12) * Math.PI * 2, tilt: (i % 3) * 0.7 - 0.7, size: 0.05 + (i % 3) * 0.025 };
    root.add(s);
    return s;
  });

  const sparkTex = T.sparkleTexture("#ffffff");
  const sparks = Array.from({ length: 34 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, transparent: true, depthWrite: false, depthTest: false, opacity: 0, blending: THREE.AdditiveBlending }));
    s.renderOrder = 9;
    s.userData = { life: 0, max: 1, size: 0.2, vel: new THREE.Vector3() };
    root.add(s);
    return s;
  });

  const setLook = (name) => {
    const p = PALETTES[name] || PALETTES.aurora;
    base.a.set(p.a); base.b.set(p.b); base.c.set(p.c);
  };
  setLook(look);

  return { root, pivot, blob, aura, uniforms: shared, auraUniforms: auraMat.uniforms, base, halo, shadow, ripples, motes, sparks, setLook };
}
