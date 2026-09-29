import * as THREE from "three";

/** Four-band ramp for cel shading. */
const ramp = (() => {
  const data = new Uint8Array([90, 160, 220, 255]);
  const t = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();

export const toonMaterial = (opts = {}) => new THREE.MeshToonMaterial({ gradientMap: ramp, ...opts });

/** Ink outline: the same geometry drawn inside-out and pushed out along its normals. */
export function outlineMaterial(color, width) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.userData.width = { value: width };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uWidth = m.userData.width;
    shader.vertexShader = "uniform float uWidth;\n" + shader.vertexShader.replace("#include <begin_vertex>", "vec3 transformed = position + normalize(normal) * uWidth;");
  };
  return m;
}

/** A mesh with its outline attached as a child sharing the geometry. */
export function inked(geometry, material, ink) {
  const mesh = new THREE.Mesh(geometry, material);
  const hull = new THREE.Mesh(geometry, outlineMaterial(ink.color, ink.width));
  hull.frustumCulled = false;
  mesh.frustumCulled = false;
  mesh.add(hull);
  return { mesh, hull };
}
