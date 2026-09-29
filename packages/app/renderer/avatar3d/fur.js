import * as THREE from "three";

/**
 * Shell-texture fur: the surface is drawn N times, each layer pushed out a little further along the
 * normal, and each layer keeps only the strands that are tall enough to reach it. Stacked, that gives
 * real volume and a soft, fuzzy silhouette that a plain material cannot.
 *
 * One InstancedMesh per part draws every shell in a single call (gl_InstanceID is the layer index).
 * Strands are procedural cells in object space, so there is no texture and no UV pinching at the poles.
 */

const VERT = /* glsl */ `
uniform float uLayers;
uniform float uLength;
uniform vec3  uGravity;
uniform float uTime;
uniform vec3  uFaceDir;
uniform float uFaceShort;
varying vec3  vObj;
varying vec3  vWorldNormal;
varying vec3  vWorldPos;
varying float vH;
varying float vMask;
void main() {
  float h = float(gl_InstanceID + 1) / uLayers;
  // shorter fur across the face so the eyes and mouth stay clean
  float facing = dot(normalize(position), uFaceDir);
  float mask = 1.0 - smoothstep(0.30, 0.78, facing) * uFaceShort;
  vec3 n = normalize(normal);
  vec3 offset = n * uLength * h * mask;
  // a light breeze and gravity bend the tips, more the further out the layer is
  vec3 sway = vec3(sin(uTime * 1.3 + position.y * 4.0), 0.0, cos(uTime * 1.1 + position.x * 4.0)) * 0.006;
  vec3 p = position + offset + (uGravity + sway) * h * h * mask;
  vObj = position;
  vH = h;
  vMask = mask;
  vWorldNormal = normalize(mat3(modelMatrix) * n);
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */ `
uniform vec3  uRoot;
uniform vec3  uTip;
uniform vec3  uLightDir;
uniform vec3  uRim;
uniform float uDensity;
uniform float uLayers;
uniform float uSleep;
varying vec3  vObj;
varying vec3  vWorldNormal;
varying vec3  vWorldPos;
varying float vH;
varying float vMask;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

// one lattice of jittered strands; returns 1 where a strand of this height is present at this layer
float strands(vec3 q, float h) {
  vec3 cell = floor(q);
  float height = mix(0.3, 1.0, hash(cell));
  vec3 jit = vec3(hash(cell + 1.7), hash(cell + 5.3), hash(cell + 9.1)) - 0.5;
  vec3 f = fract(q) - 0.5 - jit * 0.6;
  float d = length(f);
  if (h > height && h > 0.06) return 0.0;
  return step(d, 0.5 * (1.0 - 0.55 * h));
}

void main() {
  // two lattices at different scales, offset from each other, so no grid pattern shows through
  vec3 q1 = vObj * uDensity;
  vec3 q2 = vObj * uDensity * 1.61 + vec3(11.7, 3.1, 7.9);
  if (strands(q1, vH) + strands(q2, vH) < 0.5) discard;

  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float diff = 0.5 + 0.5 * dot(N, normalize(uLightDir));
  float ao = mix(0.72, 1.0, vH);                 // roots sit in shadow
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.2);
  vec3 col = mix(uRoot, uTip, pow(vH, 0.7)) * (0.62 + 0.62 * diff) * ao;
  col += uRim * rim * (0.25 + 0.5 * vH);
  col = mix(col, col * vec3(0.86, 0.88, 0.96), uSleep);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const LIGHT_DIR = new THREE.Vector3(0.45, 0.8, 0.6).normalize();

/**
 * @param {THREE.BufferGeometry} geometry unit-ish geometry for the part
 * @param {{length?:number, density?:number, layers?:number, faceShort?:number, gravity?:number}} o
 * @returns {{group: THREE.Group, materials: THREE.ShaderMaterial[], base: THREE.Mesh}}
 */
export function makeFur(geometry, o = {}, palette) {
  const layers = o.layers ?? 22;
  const uniforms = {
    uLayers: { value: layers },
    uLength: { value: o.length ?? 0.05 },
    uDensity: { value: o.density ?? 70 },
    uGravity: { value: new THREE.Vector3(0, -(o.gravity ?? 0.03), 0) },
    uTime: { value: 0 },
    uFaceDir: { value: new THREE.Vector3(0, 0.05, 1).normalize() },
    uFaceShort: { value: o.faceShort ?? 0 },
    uRoot: { value: new THREE.Color(palette.root) },
    uTip: { value: new THREE.Color(palette.tip) },
    uRim: { value: new THREE.Color(palette.rim) },
    uLightDir: { value: LIGHT_DIR.clone() },
    uSleep: { value: 0 },
  };
  const shellMat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG });
  const shells = new THREE.InstancedMesh(geometry, shellMat, layers);
  const id = new THREE.Matrix4();
  for (let i = 0; i < layers; i++) shells.setMatrixAt(i, id);
  shells.frustumCulled = false;

  // solid core so there are never see-through gaps between strands
  const baseMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(palette.root).multiplyScalar(1.05), roughness: 1, metalness: 0 });
  const base = new THREE.Mesh(geometry, baseMat);

  const group = new THREE.Group();
  group.add(base, shells);
  return { group, uniforms, baseMat };
}

export function setFurPalette(part, p) {
  part.uniforms.uRoot.value.set(p.root);
  part.uniforms.uTip.value.set(p.tip);
  part.uniforms.uRim.value.set(p.rim);
  part.baseMat.color.set(p.root).multiplyScalar(1.05);
}
