import * as THREE from "three";

/**
 * A tapered tube along a curve that can be re-shaped every frame (neck and tail).
 * Fixed topology; only positions/normals/colours are rewritten, so there is no per-frame allocation churn.
 */
export class TaperTube {
  constructor(segments = 40, radial = 18) {
    this.seg = segments;
    this.rad = radial;
    const count = (segments + 1) * (radial + 1);
    this.geometry = new THREE.BufferGeometry();
    this.pos = new Float32Array(count * 3);
    this.nor = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3);
    const idx = [];
    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < radial; j++) {
        const a = i * (radial + 1) + j, b = a + radial + 1;
        idx.push(a, a + 1, b, b, a + 1, b + 1); // outward-facing winding
      }
    }
    this.geometry.setIndex(idx);
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.geometry.setAttribute("normal", new THREE.BufferAttribute(this.nor, 3));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(this.col, 3));
    this._n = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._t = new THREE.Vector3();
  }

  /**
   * @param {THREE.Curve<THREE.Vector3>} curve
   * @param {(u:number)=>number} radiusAt
   * @param {(n:THREE.Vector3, u:number, out:THREE.Color)=>void} colourAt
   */
  update(curve, radiusAt, colourAt) {
    const { seg, rad, pos, nor, col } = this;
    const pts = curve.getSpacedPoints(seg);
    const n = this._n, b = this._b, t = this._t, out = new THREE.Color(), dir = new THREE.Vector3();
    // parallel-transport frames so the tube never twists
    t.subVectors(pts[1], pts[0]).normalize();
    n.set(0, 0, 1).addScaledVector(t, -t.z).normalize();
    if (n.lengthSq() < 0.5) n.set(1, 0, 0).addScaledVector(t, -t.x).normalize();
    for (let i = 0; i <= seg; i++) {
      const u = i / seg;
      const next = pts[Math.min(i + 1, seg)], prev = pts[Math.max(i - 1, 0)];
      const nt = dir.subVectors(next, prev).normalize();
      // rotate n from the previous tangent to the new one
      const axis = new THREE.Vector3().crossVectors(t, nt);
      if (axis.lengthSq() > 1e-10) {
        axis.normalize();
        n.applyAxisAngle(axis, Math.acos(THREE.MathUtils.clamp(t.dot(nt), -1, 1)));
      }
      t.copy(nt);
      b.crossVectors(t, n).normalize();
      const r = radiusAt(u);
      for (let j = 0; j <= rad; j++) {
        const a = (j / rad) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const nx = n.x * ca + b.x * sa, ny = n.y * ca + b.y * sa, nz = n.z * ca + b.z * sa;
        const k = (i * (rad + 1) + j) * 3;
        pos[k] = pts[i].x + nx * r; pos[k + 1] = pts[i].y + ny * r; pos[k + 2] = pts[i].z + nz * r;
        nor[k] = nx; nor[k + 1] = ny; nor[k + 2] = nz;
        colourAt(dir.set(nx, ny, nz), u, out);
        col[k] = out.r; col[k + 1] = out.g; col[k + 2] = out.b;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }
}
