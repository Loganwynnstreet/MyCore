import * as THREE from "three";
import { gsap } from "gsap";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { buildDino, FLOOR, HALO } from "./dino.js";

/**
 * The 3D guide (a chubby dinosaur in denim shorts). Layers of animation, from the bottom up:
 *  1. procedural idle: breathing, bob, sway, tail wag, blinks, eye saccades, and a head that follows the cursor
 *  2. mood poses: GSAP tweens a small set of rig parameters (eyes, brows, mouth, neck, posture, glow)
 *  3. one-shot performances: jump with anticipation and overshoot, alert pop, shake, wave, wake-up stretch
 *  4. secondary motion: springs make the neck, head and tail lag and overshoot the body
 * Everything reads from one state object `S`, so any tween can be interrupted and blends cleanly.
 */

const MOODS = {
  sleep:   { eyeOpen: 0,    smile: 0.05, mouthOpen: 0,    brow: -0.4, tilt: 0, ear: -0.2, slump: 1, glow: 0.06, halo: 0.16, zzz: 1, bang: 0, think: 0, squint: 0, headTilt: 0.1,  cheek: 0.6,  sleepTint: 1 },
  happy:   { eyeOpen: 1,    smile: 0.8,  mouthOpen: 0,    brow: 0.1,  tilt: 0, ear: 0,    slump: 0, glow: 0.3,  halo: 0.5,  zzz: 0, bang: 0, think: 0, squint: 0, headTilt: 0,    cheek: 0.85, sleepTint: 0 },
  alert:   { eyeOpen: 1.18, smile: -0.1, mouthOpen: 0.32, brow: 1,    tilt: 0, ear: 1,    slump: 0, glow: 1,    halo: 0.9,  zzz: 0, bang: 1, think: 0, squint: 0, headTilt: 0,    cheek: 0.85, sleepTint: 0 },
  think:   { eyeOpen: 0.95, smile: 0.05, mouthOpen: 0,    brow: 0.3,  tilt: 0, ear: 0.1,  slump: 0, glow: 0.3,  halo: 0.45, zzz: 0, bang: 0, think: 1, squint: 0, headTilt: -0.22, cheek: 0.8,  sleepTint: 0 },
  worried: { eyeOpen: 1.05, smile: -0.75, mouthOpen: 0,   brow: 0.2,  tilt: 1, ear: -0.8, slump: 0, glow: 0.12, halo: 0.28, zzz: 0, bang: 0, think: 0, squint: 0, headTilt: 0.08, cheek: 0.7,  sleepTint: 0 },
  cheer:   { eyeOpen: 1,    smile: 1,    mouthOpen: 0.85, brow: 0.35, tilt: 0, ear: 0.7,  slump: 0, glow: 1,    halo: 1,    zzz: 0, bang: 0, think: 0, squint: 1, headTilt: 0,    cheek: 1,    sleepTint: 0 },
};

class Spring {
  constructor(k = 90, c = 7) { this.k = k; this.c = c; this.x = 0; this.v = 0; this.target = 0; }
  step(dt) {
    // small fixed sub-steps keep the integration stable at low frame rates
    const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
    for (let i = 0; i < n; i++) { this.v += (this.k * (this.target - this.x) - this.c * this.v) * h; this.x += this.v * h; }
    return this.x;
  }
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const YAW = 0.62; // three-quarter turn towards the camera

export function createAvatar3D(style) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const canvas = document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "default" });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  camera.position.set(0.3, 1.0, 10.6);
  camera.lookAt(0.3, 0.85, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9c4d6, 1.0));
  const key = new THREE.DirectionalLight(0xfff3e2, 2.4);
  key.position.set(3, 5, 5);
  const rim = new THREE.DirectionalLight(0xcfe8ff, 0.9);
  rim.position.set(-4, 2.5, -3);
  scene.add(key, rim);

  const model = buildDino(style.look);
  scene.add(model.root);
  model.setLook(style.look);

  const container = document.createElement("div");
  container.className = "cori cori3d";
  container.setAttribute("role", "img");
  container.append(canvas);
  const label = (s) => `${s.name}, your vault guide`;
  container.setAttribute("aria-label", label(style));
  container.dataset.mood = "sleep";
  container.dataset.look = style.look;
  container.dataset.acc = style.acc;
  container.dataset.working = "false";

  // ---------------------------------------------------------------- state
  const S = { ...MOODS.sleep, blink: 0, squash: 0, jump: 0, pop: 0, shake: 0, armsUp: 0, waveR: 0, work: 0 };
  let mood = "sleep";
  const gaze = { x: 0, y: 0, tx: 0, ty: 0, sx: 0, sy: 0 };

  const tailSprings = [new Spring(34, 3.6), new Spring(30, 3.2), new Spring(26, 2.8)];
  const neckSway = new Spring(28, 3.2);
  const nod = new Spring(60, 6);
  const roll = new Spring(50, 5.5);

  // ---------------------------------------------------------------- mouth
  const mouthKey = { s: NaN, o: NaN };
  function buildMouth(smile, open) {
    const w = 0.13 - Math.max(0, open) * 0.03 * (1 - Math.max(0, smile));
    const N = 22, pts = [];
    const yAt = (x) => -smile * 0.045 * (1 - (x / w) ** 2);
    for (let i = 0; i <= N; i++) { const x = -w + (2 * w * i) / N; pts.push(new THREE.Vector3(x, yAt(x), 0)); }
    model.mouth.line.geometry.dispose();
    model.mouth.line.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.0105, 6, false);
    model.mouth.line.visible = open < 0.5;
    model.mouth.open.geometry.dispose();
    if (open > 0.04) {
      const depth = (x) => open * 0.13 * (1 - (x / w) ** 2) + 0.01;
      const sh = new THREE.Shape();
      sh.moveTo(pts[0].x, pts[0].y);
      for (const p of pts) sh.lineTo(p.x, p.y);
      for (let i = N; i >= 0; i--) sh.lineTo(pts[i].x, pts[i].y - depth(pts[i].x));
      model.mouth.open.geometry = new THREE.ShapeGeometry(sh, 10);
      model.mouth.open.visible = true;
      model.mouth.tongue.visible = open > 0.35;
      model.mouth.tongue.position.set(0, yAt(0) - open * 0.09, 0.004);
      model.mouth.tongue.scale.set(1, open * 0.55, 1);
    } else {
      model.mouth.open.geometry = new THREE.BufferGeometry();
      model.mouth.open.visible = false;
      model.mouth.tongue.visible = false;
    }
  }

  // ---------------------------------------------------------------- performances
  const timelines = new Set();
  const play = (tl) => { timelines.add(tl); tl.eventCallback("onComplete", () => timelines.delete(tl)); return tl; };
  const killPerformances = () => { for (const t of timelines) t.kill(); timelines.clear(); };

  function spark(n, ox = 0.2, oy = 1.1, oz = 0.9) {
    if (reduce) return;
    let used = 0;
    for (const s of model.fx.sparks) {
      if (s.userData.life > 0 || used >= n) continue;
      const a = Math.random() * Math.PI * 2, sp = 0.7 + Math.random() * 1.4;
      s.position.set(ox + Math.cos(a) * 0.4, oy + Math.sin(a) * 0.35, oz);
      s.userData.vel.set(Math.cos(a) * sp, Math.sin(a) * sp + 1.0, 0.2);
      s.userData.life = s.userData.max = 1.0 + Math.random() * 0.6;
      s.userData.size = 0.18 + Math.random() * 0.22;
      used++;
    }
  }

  function jump() {
    if (reduce) return;
    play(gsap.timeline()
      .to(S, { squash: 0.2, duration: 0.15, ease: "power2.in" })                                   // anticipation: crouch
      .to(S, { squash: -0.16, jump: 0.72, armsUp: 1, duration: 0.3, ease: "power2.out" })          // launch, stretch
      .call(() => spark(18))
      .to(S, { jump: 0, squash: -0.02, duration: 0.28, ease: "power2.in" })                         // fall
      .to(S, { squash: 0.24, duration: 0.07, ease: "power1.out" })                                  // impact squash
      .to(S, { squash: 0, armsUp: 0, duration: 0.7, ease: "elastic.out(1.1, 0.35)" }));             // settle with overshoot
  }
  function pop() {
    if (reduce) return;
    play(gsap.timeline().to(S, { pop: 0.09, squash: -0.1, duration: 0.11, ease: "power2.out" }).to(S, { pop: 0, squash: 0, duration: 0.5, ease: "elastic.out(1, 0.45)" }));
  }
  function shake() {
    if (reduce) return;
    play(gsap.timeline().to(S, { shake: 0.09, duration: 0.05 }).to(S, { shake: -0.09, duration: 0.1 }).to(S, { shake: 0.06, duration: 0.09 }).to(S, { shake: 0, duration: 0.16, ease: "power2.out" }));
  }
  function wave() { // a happy tail-wag flurry and a raised front paw
    if (reduce) return;
    play(gsap.timeline()
      .to(S, { waveR: 1, duration: 0.3, ease: "power2.out" })
      .to(S, { waveR: 0.8, duration: 0.18, yoyo: true, repeat: 5, ease: "sine.inOut" })
      .to(S, { waveR: 0, duration: 0.4, ease: "power2.inOut" }));
  }
  function wakeUp() {
    if (reduce) return;
    play(gsap.timeline()
      .to(S, { squash: -0.09, mouthOpen: 0.7, duration: 0.5, ease: "sine.out" })
      .to(S, { squash: 0, duration: 0.6, ease: "elastic.out(1, 0.5)" }, ">"));
  }

  function setMood(next) {
    if (!MOODS[next]) return;
    const changed = next !== mood, prev = mood;
    if (!changed && next !== "cheer" && next !== "alert") return;
    mood = next;
    container.dataset.mood = next;
    const target = MOODS[next];
    if (reduce) { gsap.set(S, target); return; }
    killPerformances();
    gsap.to(S, { ...target, duration: next === "sleep" ? 1.1 : 0.45, ease: "power2.inOut", overwrite: "auto" });
    if (next === "cheer") jump();
    else if (next === "alert") pop();
    else if (next === "worried") shake();
    else if (next === "happy") { if (prev === "sleep") { wakeUp(); gsap.delayedCall(1.1, wave); } else gsap.delayedCall(0.35, wave); }
  }
  gsap.set(S, MOODS.sleep);

  function setWorking(on) {
    container.dataset.working = on ? "true" : "false";
    gsap.to(S, { work: on ? 1 : 0, duration: 0.3, ease: "power2.out", overwrite: "auto" });
  }

  function applyStyle(s) {
    container.dataset.look = s.look;
    container.dataset.acc = s.acc;
    container.setAttribute("aria-label", label(s));
    model.setLook(s.look);
    model.acc.headphones.visible = s.acc === "headphones";
    model.acc.sunglasses.visible = s.acc === "sunglasses";
  }
  const setStyle = (s) => { applyStyle(s); pop(); };
  applyStyle(style);

  // ---------------------------------------------------------------- idle behaviours
  function scheduleBlink() {
    gsap.delayedCall(2 + Math.random() * 4, () => {
      if (S.eyeOpen > 0.3 && !reduce) {
        gsap.timeline().to(S, { blink: 1, duration: 0.07 }).to(S, { blink: 0, duration: 0.11 });
        if (Math.random() < 0.18) gsap.delayedCall(0.28, () => gsap.timeline().to(S, { blink: 1, duration: 0.06 }).to(S, { blink: 0, duration: 0.1 }));
      }
      scheduleBlink();
    });
  }
  function scheduleSaccade() {
    gsap.delayedCall(0.8 + Math.random() * 2.4, () => { gaze.sx = (Math.random() - 0.5) * 0.7; gaze.sy = (Math.random() - 0.5) * 0.4; scheduleSaccade(); });
  }
  function scheduleWave() {
    gsap.delayedCall(14 + Math.random() * 10, () => { if (mood === "happy" && S.work < 0.1) wave(); scheduleWave(); });
  }
  scheduleBlink(); scheduleSaccade(); scheduleWave();

  window.addEventListener("pointermove", (e) => {
    const r = container.getBoundingClientRect();
    if (!r.width) return;
    gaze.tx = clamp((e.clientX - (r.left + r.width / 2)) / (window.innerWidth * 0.45), -1, 1);
    gaze.ty = clamp((e.clientY - (r.top + r.height * 0.3)) / (window.innerHeight * 0.45), -1, 1);
  }, { passive: true });

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);

  // ---------------------------------------------------------------- per-frame update
  const prev = { rz: 0, y: 0 };
  let last = performance.now() / 1000;
  const tmp = new THREE.Vector3();

  function update(t, dt) {
    const idle = reduce ? 0 : 1;

    const ease = 1 - Math.exp(-dt * 9);
    const gx = gaze.tx * (1 - S.sleepTint) + gaze.sx * 0.5, gy = gaze.ty * (1 - S.sleepTint) + gaze.sy * 0.5;
    gaze.x += (gx - gaze.x) * ease; gaze.y += (gy - gaze.y) * ease;

    const breath = Math.sin(t * (1.7 - S.slump * 0.6)) * (0.011 + 0.012 * S.slump) * idle;
    const bob = Math.sin(t * 1.15) * 0.02 * (1 - S.slump * 0.75) * idle;
    const sway = Math.sin(t * 0.7) * 0.018 * idle;

    // body: squash & stretch about the floor, jump, turn a little towards the pointer
    const sy = 1 - S.squash + breath + S.pop, sxz = 1 + S.squash * 0.55 - breath * 0.5 + S.pop;
    model.pivot.scale.set(sxz, sy, sxz);
    model.pivot.position.y = FLOOR + S.jump + bob;
    model.pivot.rotation.z = sway + S.shake;
    model.dino.rotation.y = YAW + gaze.x * 0.12 * (1 - S.sleepTint);
    model.shadow.scale.setScalar(1 - S.jump * 0.3);
    model.shadow.material.opacity = 0.85 - S.jump * 0.35;

    const vx = (model.pivot.rotation.z - prev.rz) / Math.max(dt, 1e-3);
    const vy = (model.pivot.position.y - prev.y) / Math.max(dt, 1e-3);
    prev.rz = model.pivot.rotation.z; prev.y = model.pivot.position.y;

    // tail: idle wag, bigger when happy, a flurry on wave and cheer; each segment lags via a spring
    const amp = (0.07 + S.smile * 0.05 + S.waveR * 0.28 + S.armsUp * 0.4) * idle;
    const ph = t * (2.2 + S.waveR * 5 + S.armsUp * 4);
    const raw = [Math.sin(ph - 0.6) * amp * 0.5, Math.sin(ph - 1.3) * amp, Math.sin(ph - 2.0) * amp * 1.3];
    const wag = tailSprings.map((sp, i) => { sp.target = raw[i] - vx * 0.04; return sp.step(dt); });

    // neck sways gently and follows the pointer; the head nods and rolls on springs
    neckSway.target = gaze.x * 0.12 * (1 - S.sleepTint) + Math.sin(t * 0.6) * 0.06 * idle - vx * 0.03;
    nod.target = S.slump * 0.55 - gaze.y * 0.22 * (1 - S.sleepTint) - S.think * 0.1 + Math.sin(t * 1.1) * 0.03 * idle - vy * 0.02;
    roll.target = S.headTilt * 1.2 + Math.sin(t * 0.8) * 0.03 * idle;

    model.pose({
      neckUp: S.ear, slump: S.slump, sway: neckSway.step(dt), reach: gaze.x,
      tailLift: S.glow * 0.15 + Math.max(S.ear, 0) * 0.25 - S.slump * 0.3 - Math.max(-S.ear, 0) * 0.4 + S.waveR * 0.2,
      wag,
    });
    model.headPivot.rotation.set(roll.step(dt), gaze.x * 0.5 * (1 - S.sleepTint), nod.step(dt), "YXZ");

    // front paws: raised on a cheer, tapping the keyboard while she works, waving on hello
    const { fl, fr } = model.feet;
    const reach = S.work;
    const tapL = Math.max(0, Math.sin(t * 22)) * 0.09 * S.work, tapR = Math.max(0, Math.sin(t * 22 + Math.PI)) * 0.09 * S.work;
    fl.position.set(-0.66 - 0.52 * reach, -0.84 + 0.34 * reach + S.armsUp * 0.28 + tapL + S.waveR * 0.32, 0.46);
    fr.position.set(-0.66 - 0.52 * reach, -0.84 + 0.34 * reach + S.armsUp * 0.28 + tapR, -0.46);
    fl.rotation.z = -S.waveR * 0.5 * Math.sin(t * 12);

    model.desk.visible = S.work > 0.02;
    model.desk.scale.setScalar(Math.max(S.work, 0.001));

    // face
    const eyeY = Math.max(0.05, S.eyeOpen * (1 - S.blink) * (1 - S.squint * 0.8));
    for (const e of model.eyes) {
      e.eye.scale.set(1 + S.squint * 0.1, eyeY, 1);
      e.eye.position.set(gaze.x * 0.02 - S.think * 0.02, -gaze.y * 0.016 + S.think * 0.03 - S.squint * 0.008, 0);
      e.eye.rotation.z = -e.side * S.squint * 0.3;
    }
    for (const c of model.cheeks) c.material.opacity = S.cheek * 0.5;
    for (const b of model.brows) {
      b.holder.position.y = S.brow * 0.04;
      b.holder.rotation.z = -b.side * S.tilt * 0.5 + b.side * S.brow * 0.05;
    }
    if (Math.abs(S.smile - mouthKey.s) > 0.004 || Math.abs(S.mouthOpen - mouthKey.o) > 0.004 || Number.isNaN(mouthKey.s)) {
      mouthKey.s = S.smile; mouthKey.o = S.mouthOpen;
      buildMouth(S.smile, S.mouthOpen);
    }

    // emblem glow: pulses when alert, flickers when worried
    const pulse = mood === "alert" ? 0.65 + 0.35 * Math.sin(t * 7) : mood === "worried" ? (Math.sin(t * 26) > 0 ? 1 : 0.45) : 1;
    model.emblemGlow.material.opacity = clamp(S.glow * pulse * 0.7, 0, 0.75);

    // status sprites float above the head
    model.headPivot.getWorldPosition(tmp);
    model.fx.zzz.forEach((s, i) => {
      s.material.opacity = S.zzz * 0.95;
      s.position.copy(tmp).add(s.userData.off);
      s.position.y += Math.sin(t * 1.2 + i * 0.9) * 0.06 + ((t * 0.35 + i * 0.33) % 1) * 0.12;
    });
    model.fx.bang.material.opacity = S.bang;
    model.fx.bang.position.copy(tmp).add(model.fx.bang.userData.off);
    model.fx.bang.scale.setScalar(0.72 + Math.sin(t * 8) * 0.06 * S.bang);
    model.fx.thought.forEach((s, i) => {
      s.material.opacity = S.think;
      s.position.copy(tmp).add(s.userData.off);
      s.scale.setScalar(s.userData.base * (0.85 + 0.15 * Math.sin(t * 3 + i * 0.6)));
    });

    model.halo.material.opacity = S.halo * (0.9 + 0.1 * Math.sin(t * 0.9));
    model.halo.scale.setScalar(HALO * (1 + 0.03 * Math.sin(t * 0.9)));

    for (const s of model.fx.sparks) {
      const u = s.userData;
      if (u.life <= 0) { s.material.opacity = 0; continue; }
      u.life -= dt;
      u.vel.y -= 1.6 * dt;
      s.position.addScaledVector(u.vel, dt);
      const k = clamp(u.life / u.max, 0, 1);
      s.material.opacity = Math.sin(k * Math.PI) ** 0.7;
      s.scale.setScalar(u.size * (0.5 + k));
      s.material.rotation += dt * 2;
    }
  }

  let lastDraw = 0;
  function frame(now) {
    // cap at ~60 fps: high-refresh displays would otherwise burn power for no visible gain
    if (now - lastDraw < 15) { requestAnimationFrame(frame); return; }
    lastDraw = now;
    const t = now / 1000, dt = Math.min(0.05, t - last);
    last = t;
    if (container.isConnected && container.clientWidth) {
      update(t, dt);
      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    svg: container, // same property name as the 2D avatar so the app can mount either
    setMood,
    get mood() { return mood; },
    setWorking,
    setStyle,
    __debug: { S, model, gsap, renderer },
  };
}
