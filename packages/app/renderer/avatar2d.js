// Flat fallback for machines without WebGL: a CSS orb with the same moods, looks and shapes.
// The 3D essence (avatar3d/) is the real thing; this keeps the app usable and on-brand without it.

export function createAvatar(style) {
  const el = document.createElement("div");
  el.className = "cori cori2d";
  el.setAttribute("role", "img");
  for (const c of ["orb-aura", "orb-core", "orb-shine"]) {
    const s = document.createElement("span");
    s.className = c;
    el.append(s);
  }
  const set = (k, v) => { el.dataset[k] = v; };
  const apply = (s) => { set("look", s.look); set("acc", s.acc); el.setAttribute("aria-label", `${s.name}, your vault guide`); };
  set("mood", "sleep"); set("working", "false");
  apply(style);
  return {
    svg: el,
    setMood(m) { set("mood", m); },
    get mood() { return el.dataset.mood; },
    setWorking(on) { set("working", on ? "true" : "false"); },
    setStyle: apply,
  };
}
