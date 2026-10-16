import * as THREE from "three";
import { gsap } from "gsap";
import { buildEssence, FORMS } from "./essence.js";

/**
 * The guide as a living essence. Everything she "feels" is carried by motion, colour and light:
 *  1. idle life: slow breathing, a gentle float, a lean towards the pointer, colour that never stops flowing
 *  2. mood poses: GSAP tweens one parameter set (surface energy, speed, swirl, glow, tint, size, jitter)
 *  3. one-shot performances: a hop with anticipation and overshoot, a pop with expanding ripples,
 *     a shiver, a hello pulse, a wake-up swell
 *  4. secondary motion: springs make her lag and overshoot the pointer, and squash on landing
 * Everything reads from one state object `S`, so any tween can be interrupted and blends cleanly.
 */

// tr/tg/tb = the tint colour a mood pulls the palette towards; `tint` is how strongly
const MOODS = {
  sleep:   { amp: 0.03, speed: 0.18, freq: 1.0, swirl: 0.08, glow: 0.14, halo: 0.12, dim: 1, size: 0.84, tint: 0.55, tr: 0.25, tg: 0.27, tb: 0.55, jitter: 0, pulse: 0 },
  happy:   { amp: 0.09, speed: 0.5,  freq: 1.1, swirl: 0.4,  glow: 0.5,  halo: 0.4,  dim: 0, size: 1,    tint: 0,    tr: 1, tg: 1, tb: 1, jitter: 0,    pulse: 0.15 },
  alert:   { amp: 0.17, speed: 1.15, freq: 1.3, swirl: 0.8,  glow: 0.85, halo: 0.8,  dim: 0, size: 1.07, tint: 0.32,  tr: 1, tg: 0.72, tb: 0.3, jitter: 0.1,  pulse: 1 },
  think:   { amp: 0.13, speed: 0.95, freq: 1.6, swirl: 1.5,  glow: 0.65, halo: 0.45, dim: 0, size: 0.98, tint: 0,    tr: 1, tg: 1, tb: 1, jitter: 0,    pulse: 0.4 },
  worried: { amp: 0.14, speed: 1.5,  freq: 1.5, swirl: 0.6,  glow: 0.2,  halo: 0.2,  dim: 0, size: 0.93, tint: 0.5,  tr: 1, tg: 0.42, tb: 0.5, jitter: 0.6,  pulse: 0 },
  cheer:   { amp: 0.22, speed: 1.5,  freq: 1.2, swirl: 1.2,  glow: 1,    halo: 1,    dim: 0, size: 1.12, tint: 0.3,  tr: 1, tg: 0.84, tb: 0.42, jitter: 0.05, pulse: 0.8 },
};

class Spring {
  constructor(k = 90, c = 7) { this.k = k; this.c = c; this.x = 0; this.v = 0; this.target = 0; }
  step(dt) {
    const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n; // small fixed sub-steps keep it stable
    for (let i = 0; i < n; i++) { this.v += (this.k * (this.target - this.x) - this.c * this.v) * h; this.x += this.v * h; }
    return this.x;
  }
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const tint = new THREE.Color();

export function createAvatar3D(style) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const canvas = document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "default" });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  camera.position.set(0, 0.05, 8.2);
  camera.lookAt(0, 0, 0);

  const model = buildEssence(style.look);
  scene.add(model.root);

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
  const S = { ...MOODS.sleep, squash: 0, jump: 0, pop: 0, shake: 0, hello: 0, work: 0, burst: 0 };
  let mood = "sleep";
  let form = FORMS[style.acc] || FORMS.orb;
  const gaze = { x: 0, y: 0, tx: 0, ty: 0, sx: 0, sy: 0 };
  const lean = { x: new Spring(40, 5), y: new Spring(40, 5) };

  // ---------------------------------------------------------------- performances
  const timelines = new Set();
  const play = (tl) => { timelines.add(tl); tl.eventCallback("onComplete", () => timelines.delete(tl)); return tl; };
  const killPerformances = () => { for (const t of timelines) t.kill(); timelines.clear(); };

  function ripple(delay = 0) {
    if (reduce) return;
    const r = model.ripples.find((m) => m.userData.age > m.userData.life);
    if (!r) return;
    gsap.delayedCall(delay, () => { r.userData.age = 0; r.visible = true; });
  }

  function spark(n) {
    if (reduce) return;
    let used = 0;
    for (const s of model.sparks) {
      if (s.userData.life > 0 || used >= n) continue;
      const a = Math.random() * Math.PI * 2, sp = 0.8 + Math.random() * 1.5;
      s.position.set(Math.cos(a) * 1.0, Math.sin(a) * 1.0, 0.6);
      s.userData.vel.set(Math.cos(a) * sp, Math.sin(a) * sp + 0.5, 0.1);
      s.userData.life = s.userData.max = 0.9 + Math.random() * 0.6;
      s.userData.size = 0.16 + Math.random() * 0.2;
      used++;
    }
  }

  function hop() {
    if (reduce) return;
    play(gsap.timeline()
      .to(S, { squash: 0.18, duration: 0.15, ease: "power2.in" })                                  // anticipation: gather
      .to(S, { squash: -0.14, jump: 0.55, burst: 1, duration: 0.3, ease: "power2.out" })           // launch, stretch
      .call(() => { spark(20); ripple(); ripple(0.12); })
      .to(S, { jump: 0, squash: -0.02, duration: 0.3, ease: "power2.in" })                          // fall
      .to(S, { squash: 0.2, duration: 0.07, ease: "power1.out" })                                   // impact squash
      .to(S, { squash: 0, burst: 0, duration: 0.8, ease: "elastic.out(1.1, 0.35)" }));              // settle with overshoot
  }
  function pop() {
    if (reduce) return;
    ripple();
    play(gsap.timeline().to(S, { pop: 0.1, squash: -0.1, duration: 0.11, ease: "power2.out" }).to(S, { pop: 0, squash: 0, duration: 0.55, ease: "elastic.out(1, 0.45)" }));
  }
  function shiver() {
    if (reduce) return;
    play(gsap.timeline().to(S, { shake: 0.09, duration: 0.05 }).to(S, { shake: -0.09, duration: 0.1 }).to(S, { shake: 0.06, duration: 0.09 }).to(S, { shake: 0, duration: 0.16, ease: "power2.out" }));
  }
  function hello() { // a soft, friendly pulse
    if (reduce) return;
    play(gsap.timeline().to(S, { hello: 1, duration: 0.35, ease: "sine.out" }).to(S, { hello: 0, duration: 0.9, ease: "sine.inOut" }));
    ripple();
  }
  function wakeUp() {
    if (reduce) return;
    play(gsap.timeline().to(S, { squash: -0.1, duration: 0.5, ease: "sine.out" }).to(S, { squash: 0, duration: 0.6, ease: "elastic.out(1, 0.5)" }, ">"));
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
    gsap.to(S, { ...target, duration: next === "sleep" ? 1.2 : 0.55, ease: "power2.inOut", overwrite: "auto" });
    if (next === "cheer") hop();
    else if (next === "alert") { pop(); ripple(0.25); ripple(0.5); }
    else if (next === "worried") shiver();
    else if (next === "happy") { if (prev === "sleep") { wakeUp(); gsap.delayedCall(1.0, hello); } else gsap.delayedCall(0.3, hello); }
  }
  gsap.set(S, MOODS.sleep);

  function setWorking(on) {
    container.dataset.working = on ? "true" : "false";
    gsap.to(S, { work: on ? 1 : 0, duration: 0.4, ease: "power2.out", overwrite: "auto" });
  }

  function applyStyle(s) {
    container.dataset.look = s.look;
    container.dataset.acc = s.acc;
    container.setAttribute("aria-label", label(s));
    model.setLook(s.look);
    form = FORMS[s.acc] || FORMS.orb;
  }
  const setStyle = (s) => { applyStyle(s); pop(); };
  applyStyle(style);

  // ---------------------------------------------------------------- idle behaviours
  function scheduleSaccade() {
    gsap.delayedCall(1.2 + Math.random() * 2.8, () => { gaze.sx = (Math.random() - 0.5) * 0.5; gaze.sy = (Math.random() - 0.5) * 0.3; scheduleSaccade(); });
  }
  function scheduleHello() {
    gsap.delayedCall(16 + Math.random() * 12, () => { if (mood === "happy" && S.work < 0.1) hello(); scheduleHello(); });
  }
  scheduleSaccade(); scheduleHello();

  window.addEventListener("pointermove", (e) => {
    const r = container.getBoundingClientRect();
    if (!r.width) return;
    gaze.tx = clamp((e.clientX - (r.left + r.width / 2)) / (window.innerWidth * 0.45), -1, 1);
    gaze.ty = clamp((e.clientY - (r.top + r.height / 2)) / (window.innerHeight * 0.45), -1, 1);
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
  let last = performance.now() / 1000;
  const u = model.uniforms;

  function update(t, dt) {
    const idle = reduce ? 0 : 1;
    const time = reduce ? 0 : t;

    const ease = 1 - Math.exp(-dt * 7);
    const gx = gaze.tx * (1 - S.dim) + gaze.sx, gy = gaze.ty * (1 - S.dim) + gaze.sy;
    gaze.x += (gx - gaze.x) * ease; gaze.y += (gy - gaze.y) * ease;
    lean.x.target = gaze.x * 0.35; lean.y.target = -gaze.y * 0.25;
    const lx = lean.x.step(dt), ly = lean.y.step(dt);

    const work = S.work;
    const breath = Math.sin(t * (1.5 - S.dim * 0.7)) * (0.018 + 0.012 * S.dim) * idle;
    const bob = Math.sin(t * 0.9) * 0.07 * (1 - S.dim * 0.6) * idle;

    // surface character from mood × form × work
    u.uTime.value = time;
    u.uAmp.value = (S.amp * form.amp) * (1 + work * 0.2) + S.hello * 0.05;
    u.uFreq.value = S.freq * form.freq;
    u.uSpeed.value = S.speed * (1 + work * 0.9);
    u.uStretch.value = form.stretch;
    u.uTaper.value = form.taper;
    u.uJitter.value = S.jitter;
    u.uPulse.value = S.pulse + work * 0.5 + S.hello * 0.6;
    u.uSwirl.value = S.swirl + work * 1.4;
    u.uGlow.value = clamp(S.glow + S.hello * 0.25 + S.burst * 0.3, 0, 1.3);
    u.uDim.value = S.dim;
    u.uLook.value.set(lx, ly, 0.0).multiplyScalar(1 - S.dim * 0.8);

    // palette, pulled towards the mood's tint
    tint.setRGB(S.tr, S.tg, S.tb);
    u.uA.value.copy(model.base.a).lerp(tint, S.tint);
    u.uB.value.copy(model.base.b).lerp(tint, S.tint * 0.8);
    u.uC.value.copy(model.base.c).lerp(tint, S.tint * 0.5);

    // body: float, squash & stretch, hop
    const sy = 1 - S.squash + breath + S.pop + S.hello * 0.03;
    const sxz = 1 + S.squash * 0.6 - breath * 0.5 + S.pop + S.hello * 0.03;
    const size = S.size * (1 + S.burst * 0.04);
    model.pivot.scale.set(sxz * size, sy * size, sxz * size);
    model.pivot.position.set(lx * 0.12 + S.shake, bob + S.jump + ly * 0.08, 0);
    model.shadow.position.y = -1.75 - Math.min(0, bob) * 0.3;
    model.shadow.scale.setScalar(clamp((1 - S.jump * 0.5 + bob * 0.5) * size, 0.4, 1.4));
    model.shadow.material.opacity = (0.5 - S.jump * 0.3) * (0.4 + 0.6 * (1 - S.dim));

    // aura and halo
    model.auraUniforms.uScale.value = 1.2 + S.hello * 0.05 + Math.sin(t * 1.3) * 0.01 * idle;
    model.halo.material.opacity = S.halo * (0.85 + 0.15 * Math.sin(t * 0.8));
    model.halo.material.color.copy(u.uA.value).lerp(u.uB.value, 0.4);
    model.halo.scale.setScalar(5.2 * (0.9 + S.size * 0.1) * (1 + 0.03 * Math.sin(t * 0.8) * idle));

    // ripples
    for (const r of model.ripples) {
      const d = r.userData;
      if (d.age > d.life) { r.visible = false; continue; }
      d.age += dt;
      const k = clamp(d.age / d.life, 0, 1);
      r.scale.setScalar(size * (1.1 + k * 0.85));
      r.material.opacity = (1 - k) ** 1.5 * 0.55;
      r.material.color.copy(u.uA.value).lerp(u.uC.value, 0.5);
    }

    // motes: drift on tilted orbits; faster and brighter when busy or excited
    const orbit = 1 + work * 2.5 + S.burst;
    model.motes.forEach((m, i) => {
      const d = m.userData, a = d.phase + t * d.speed * orbit * 0.6;
      m.position.set(Math.cos(a) * d.r * size, Math.sin(a * 0.8 + d.tilt) * d.r * 0.55 * size + bob * 0.5, Math.sin(a) * d.r * 0.6 * size);
      m.scale.setScalar(d.size * (1.4 + S.glow * 1.4));
      m.material.opacity = clamp((0.12 + S.glow * 0.5 + work * 0.2) * (1 - S.dim * 0.8), 0, 0.8);
      m.material.color.copy(i % 2 ? u.uC.value : u.uA.value).lerp(new THREE.Color(1, 1, 1), 0.35);
    });

    // sparkles
    for (const s of model.sparks) {
      const d = s.userData;
      if (d.life <= 0) { s.material.opacity = 0; continue; }
      d.life -= dt;
      d.vel.y -= 1.2 * dt;
      s.position.addScaledVector(d.vel, dt);
      const k = clamp(d.life / d.max, 0, 1);
      s.material.opacity = Math.sin(k * Math.PI) ** 0.7;
      s.material.color.copy(u.uC.value).lerp(new THREE.Color(1, 1, 1), 0.5);
      s.scale.setScalar(d.size * (0.5 + k));
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
