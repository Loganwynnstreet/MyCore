import * as THREE from "three";
import { gsap } from "gsap";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { buildModel, FLOOR, HALO } from "./model.js";

/**
 * The 3D guide. Layers of animation, from the bottom up:
 *  1. procedural idle: breathing, bob, sway, blinks, eye saccades, and eyes/head that follow the cursor
 *  2. mood poses: GSAP tweens a small set of rig parameters (eyes, brows, mouth, ears, posture, glow)
 *  3. one-shot performances: jump with anticipation and overshoot, alert pop, shake, wave, wake-up stretch
 *  4. secondary motion: springs make the ears, tuft and key charm lag and overshoot the body
 * Everything reads from one state object `S`, so any tween can be interrupted and blends cleanly.
 */

const MOODS = {
  sleep:   { eyeOpen: 0,    smile: 0.05, mouthOpen: 0,    brow: -0.4, tilt: 0, ear: -0.7, slump: 1, glow: 0.06, halo: 0.16, zzz: 1, bang: 0, think: 0, squint: 0, headTilt: 0.1,  cheek: 0.6,  sleepTint: 1 },
  happy:   { eyeOpen: 1,    smile: 0.8,  mouthOpen: 0,    brow: 0.1,  tilt: 0, ear: 0,    slump: 0, glow: 0.4,  halo: 0.55, zzz: 0, bang: 0, think: 0, squint: 0, headTilt: 0,    cheek: 0.85, sleepTint: 0 },
  alert:   { eyeOpen: 1.18, smile: -0.1, mouthOpen: 0.32, brow: 1,    tilt: 0, ear: 1,    slump: 0, glow: 1,    halo: 0.95, zzz: 0, bang: 1, think: 0, squint: 0, headTilt: 0,    cheek: 0.85, sleepTint: 0 },
  think:   { eyeOpen: 0.95, smile: 0.05, mouthOpen: 0,    brow: 0.3,  tilt: 0, ear: 0.1,  slump: 0, glow: 0.4,  halo: 0.5,  zzz: 0, bang: 0, think: 1, squint: 0, headTilt: -0.16, cheek: 0.8,  sleepTint: 0 },
  worried: { eyeOpen: 1.05, smile: -0.75, mouthOpen: 0,   brow: 0.2,  tilt: 1, ear: -0.4, slump: 0, glow: 0.15, halo: 0.3,  zzz: 0, bang: 0, think: 0, squint: 0, headTilt: 0.06, cheek: 0.7,  sleepTint: 0 },
  cheer:   { eyeOpen: 1,    smile: 1,    mouthOpen: 0.85, brow: 0.35, tilt: 0, ear: 0.7,  slump: 0, glow: 1,    halo: 1,    zzz: 0, bang: 0, think: 0, squint: 1, headTilt: 0,    cheek: 1,    sleepTint: 0 },
};

class Spring {
  constructor(k = 90, c = 7) { this.k = k; this.c = c; this.x = 0; this.v = 0; this.target = 0; }
  step(dt) {
    // semi-implicit Euler in small steps keeps it stable at low frame rates
    const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
    for (let i = 0; i < n; i++) { this.v += (this.k * (this.target - this.x) - this.c * this.v) * h; this.x += this.v * h; }
    return this.x;
  }
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function createAvatar3D(style) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const canvas = document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "default" });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.02;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 0.32, 7.4);
  camera.lookAt(0, 0.28, 0);

  scene.add(new THREE.HemisphereLight(0xfff2e2, 0xc9a58c, 0.75));
  const key = new THREE.DirectionalLight(0xfff0dc, 1.7);
  key.position.set(2.6, 4.2, 4.6);
  const rim = new THREE.DirectionalLight(0xffd0a8, 1.1);
  rim.position.set(-3.4, 2.2, -3.2);
  scene.add(key, rim);

  const model = buildModel(style.look);
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
  const S = {
    ...MOODS.sleep, blink: 0, squash: 0, jump: 0, pop: 0, shake: 0, armsUp: 0, waveR: 0, work: 0, wake: 0,
  };
  let mood = "sleep";
  const gaze = { x: 0, y: 0, tx: 0, ty: 0, sx: 0, sy: 0 }; // pointer gaze and small random saccades

  const earSprings = model.ears.map(() => new Spring(70, 5.5));
  const tuftSpring = new Spring(60, 4.5);
  const charmX = new Spring(38, 2.6), charmZ = new Spring(38, 2.6);

  // ---------------------------------------------------------------- mouth
  const mouthKey = { s: NaN, o: NaN };
  function buildMouth(smile, open) {
    const w = 0.17 - Math.max(0, open) * 0.045 * (1 - Math.max(0, smile));
    const N = 22, pts = [];
    const yAt = (x) => -smile * 0.055 * (1 - (x / w) ** 2);
    for (let i = 0; i <= N; i++) { const x = -w + (2 * w * i) / N; pts.push(new THREE.Vector3(x, yAt(x), 0)); }
    model.mouth.line.geometry.dispose();
    model.mouth.line.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.0125, 6, false);
    model.mouth.line.visible = open < 0.5;
    model.mouth.open.geometry.dispose();
    if (open > 0.04) {
      const depth = (x) => open * 0.16 * (1 - (x / w) ** 2) + 0.012;
      const sh = new THREE.Shape();
      sh.moveTo(pts[0].x, pts[0].y);
      for (const p of pts) sh.lineTo(p.x, p.y);
      for (let i = N; i >= 0; i--) sh.lineTo(pts[i].x, pts[i].y - depth(pts[i].x));
      model.mouth.open.geometry = new THREE.ShapeGeometry(sh, 10);
      model.mouth.open.visible = true;
      model.mouth.tongue.visible = open > 0.35;
      model.mouth.tongue.position.set(0, yAt(0) - open * 0.115, 0.004);
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

  function spark(n, ox = 0, oy = 0.5, oz = 0.9) {
    if (reduce) return;
    let used = 0;
    for (const s of model.fx.sparks) {
      if (s.userData.life > 0 || used >= n) continue;
      const a = Math.random() * Math.PI * 2, sp = 0.7 + Math.random() * 1.3;
      s.position.set(ox + Math.cos(a) * 0.35, oy + Math.sin(a) * 0.3, oz);
      s.userData.vel.set(Math.cos(a) * sp, Math.sin(a) * sp + 0.9, 0.2);
      s.userData.life = 1.0 + Math.random() * 0.6;
      s.userData.max = s.userData.life;
      s.userData.size = 0.16 + Math.random() * 0.2;
      used++;
    }
  }

  function jump() {
    if (reduce) return;
    const tl = gsap.timeline();
    tl.to(S, { squash: 0.2, duration: 0.15, ease: "power2.in" })                                    // anticipation: crouch
      .to(S, { squash: -0.16, jump: 0.72, armsUp: 1, duration: 0.3, ease: "power2.out" })           // launch, stretch
      .call(() => spark(18))
      .to(S, { jump: 0, squash: -0.02, duration: 0.28, ease: "power2.in" })                          // fall
      .to(S, { squash: 0.24, duration: 0.07, ease: "power1.out" })                                   // impact squash
      .to(S, { squash: 0, armsUp: 0, duration: 0.7, ease: "elastic.out(1.1, 0.35)" });               // settle with overshoot
    play(tl);
  }
  function pop() {
    if (reduce) return;
    play(gsap.timeline().to(S, { pop: 0.09, squash: -0.1, duration: 0.11, ease: "power2.out" }).to(S, { pop: 0, squash: 0, duration: 0.5, ease: "elastic.out(1, 0.45)" }));
  }
  function shake() {
    if (reduce) return;
    play(gsap.timeline().to(S, { shake: 0.09, duration: 0.05 }).to(S, { shake: -0.09, duration: 0.1 }).to(S, { shake: 0.06, duration: 0.09 }).to(S, { shake: 0, duration: 0.16, ease: "power2.out" }));
  }
  function wave() {
    if (reduce) return;
    play(gsap.timeline()
      .to(S, { waveR: 2.3, duration: 0.32, ease: "power2.out" })
      .to(S, { waveR: 1.85, duration: 0.16, yoyo: true, repeat: 5, ease: "sine.inOut" })
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
    const changed = next !== mood;
    const prev = mood;
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
  setMood("sleep");
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
  const setStyle = (s) => { applyStyle(s); pop(); }; // a little hop when you change her look
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
    gsap.delayedCall(0.8 + Math.random() * 2.4, () => {
      gaze.sx = (Math.random() - 0.5) * 0.7; gaze.sy = (Math.random() - 0.5) * 0.4;
      scheduleSaccade();
    });
  }
  function scheduleWave() {
    gsap.delayedCall(14 + Math.random() * 10, () => { if (mood === "happy" && S.work < 0.1) wave(); scheduleWave(); });
  }
  scheduleBlink(); scheduleSaccade(); scheduleWave();

  window.addEventListener("pointermove", (e) => {
    const r = container.getBoundingClientRect();
    if (!r.width) return;
    gaze.tx = clamp((e.clientX - (r.left + r.width / 2)) / (window.innerWidth * 0.45), -1, 1);
    gaze.ty = clamp((e.clientY - (r.top + r.height * 0.4)) / (window.innerHeight * 0.45), -1, 1);
  }, { passive: true });

  // ---------------------------------------------------------------- resize
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

  function update(t, dt) {
    for (const f of model.furParts) { f.uniforms.uTime.value = t; f.uniforms.uSleep.value = S.sleepTint * 0.6; }

    // gaze: pointer + saccades, eased
    const gx = gaze.tx * (1 - S.sleepTint) + gaze.sx * 0.5, gy = gaze.ty * (1 - S.sleepTint) + gaze.sy * 0.5;
    const ease = 1 - Math.exp(-dt * 9);
    gaze.x += (gx - gaze.x) * ease; gaze.y += (gy - gaze.y) * ease;

    const idle = reduce ? 0 : 1;
    const breathRate = 1.7 - S.slump * 0.6;
    const breath = Math.sin(t * breathRate) * (0.011 + 0.012 * S.slump) * idle;
    const bob = Math.sin(t * 1.15) * 0.022 * (1 - S.slump * 0.75) * idle;
    const sway = Math.sin(t * 0.7) * 0.02 * idle;

    // body: squash & stretch about the floor, jump, lean towards the pointer, slump when asleep
    const sy = 1 - S.squash + breath + S.pop, sxz = 1 + S.squash * 0.55 - breath * 0.5 + S.pop;
    model.pivot.scale.set(sxz, sy, sxz);
    model.pivot.position.y = FLOOR + S.jump + bob;
    model.pivot.rotation.z = sway + S.shake + S.headTilt;
    model.pivot.rotation.x = S.slump * 0.14 + gaze.y * 0.06 + (S.think ? -0.03 : 0);
    model.pivot.rotation.y = gaze.x * 0.2 * (1 - S.sleepTint);
    model.shadow.scale.setScalar(1 - S.jump * 0.3);
    model.shadow.material.opacity = 0.85 - S.jump * 0.35;

    // velocity proxies drive the springs
    const vx = (model.pivot.rotation.z - prev.rz) / Math.max(dt, 1e-3);
    const vy = (model.pivot.position.y - prev.y) / Math.max(dt, 1e-3);
    prev.rz = model.pivot.rotation.z; prev.y = model.pivot.position.y;

    // ears
    model.ears.forEach((e, i) => {
      const rest = -e.side * (0.42 - 0.34 * S.ear);
      const sp = earSprings[i];
      sp.target = rest - vy * 0.045 * e.side + vx * 0.02 * e.side;
      e.group.rotation.z = sp.step(dt);
      e.group.rotation.x = -0.05 + S.ear * 0.06;
    });
    tuftSpring.target = -vx * 0.05 + Math.sin(t * 1.4) * 0.04 * idle - vy * 0.02;
    model.tuft.rotation.z = tuftSpring.step(dt);
    model.tuftBlades.forEach((b, i) => { b.rotation.z = [-0.5, 0.04, 0.52][i] + tuftSpring.x * (0.6 + i * 0.3); });

    // charm: pendulum lag plus its glow
    charmZ.target = -vx * 0.09 - sway * 1.5;
    charmX.target = -vy * 0.12 + S.slump * 0.4;
    model.charm.pendant.rotation.z = charmZ.step(dt);
    model.charm.pendant.rotation.x = charmX.step(dt);
    const pulse = mood === "alert" ? 0.65 + 0.35 * Math.sin(t * 7) : mood === "worried" ? (Math.sin(t * 26) > 0 ? 1 : 0.45) : 1;
    model.charm.glow.material.opacity = clamp(S.glow * pulse * 0.8, 0, 0.8);
    model.charm.glow.scale.setScalar(0.42 + S.glow * 0.22);
    model.charm.pendant.children[0].material.emissiveIntensity = 0.18 + S.glow * 1.1 * pulse;
    model.charm.root.visible = S.work < 0.5;

    // eyes: blink, squint, gaze
    const eyeY = Math.max(0.05, S.eyeOpen * (1 - S.blink) * (1 - S.squint * 0.8));
    for (const e of model.eyes) {
      e.eye.scale.set(1 + S.squint * 0.1, eyeY, 1);
      e.eye.position.set(gaze.x * 0.035 - S.think * 0.03, -gaze.y * 0.025 + S.think * 0.045 - S.squint * 0.012, 0);
      e.eye.rotation.z = -e.side * S.squint * 0.3;
    }
    for (const c of model.cheeks) c.material.opacity = S.cheek;

    // brows: raise, and tilt inner ends up when worried
    for (const b of model.brows) {
      b.holder.position.y = S.brow * 0.06;
      b.holder.rotation.z = -b.side * S.tilt * 0.5 + b.side * S.brow * 0.05;
    }

    // mouth (rebuilt only when it visibly changes)
    if (Math.abs(S.smile - mouthKey.s) > 0.004 || Math.abs(S.mouthOpen - mouthKey.o) > 0.004 || Number.isNaN(mouthKey.s)) {
      mouthKey.s = S.smile; mouthKey.o = S.mouthOpen;
      buildMouth(S.smile, S.mouthOpen);
    }

    // arms: rest pose, cheering up, waving, typing
    const tapL = Math.sin(t * 22) * 0.2 * S.work, tapR = Math.sin(t * 22 + Math.PI) * 0.2 * S.work;
    for (const a of model.arms) {
      const isR = a.side === 1;
      const up = S.armsUp * 2.05 + (isR ? S.waveR : 0);
      a.group.rotation.z = a.side * (0.34 - 0.18 * S.work + Math.max(up, 0)) + Math.sin(t * 1.3 + (isR ? 1 : 0)) * 0.03 * idle;
      a.group.rotation.x = -S.work * 1.05 + (isR ? tapR : tapL) + (S.slump * 0.1);
    }

    // keyboard
    model.desk.visible = S.work > 0.02;
    model.desk.scale.setScalar(Math.max(S.work, 0.001));

    // status sprites
    model.fx.zzz.forEach((s, i) => {
      s.material.opacity = S.zzz * 0.95;
      s.position.y = s.userData.home.y + Math.sin(t * 1.2 + i * 0.9) * 0.06 + ((t * 0.35 + i * 0.33) % 1) * 0.12;
    });
    model.fx.bang.material.opacity = S.bang;
    model.fx.bang.scale.setScalar(0.75 + Math.sin(t * 8) * 0.06 * S.bang);
    model.fx.thought.forEach((s, i) => {
      s.material.opacity = S.think;
      s.scale.setScalar([0.16, 0.24, 0.4][i] * (0.85 + 0.15 * Math.sin(t * 3 + i * 0.6)));
    });

    // background glow
    model.halo.material.opacity = S.halo * (0.9 + 0.1 * Math.sin(t * 0.9));
    model.halo.scale.setScalar(HALO * (1 + 0.03 * Math.sin(t * 0.9)));

    // sparkles
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
