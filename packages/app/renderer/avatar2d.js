// The vault guide: a small, plush, dumpling-shaped companion with beady eyes, rosy cheeks and a tiny
// key charm on a string. One SVG; the mood, look and accessory are data attributes and CSS does the rest.
//
// Moods: sleep (locked), happy (idle), alert (something needs you), think, worried, cheer.
// Working overlay: data-working="true" shows her tapping a little keyboard while a request is in flight.
// Looks and accessories are user-customisable (see LOOKS / ACCESSORIES).

const NS = "http://www.w3.org/2000/svg";

export const LOOKS = { cream: "Cream", peach: "Peach", sage: "Sage", lilac: "Lilac" };
export const ACCESSORIES = { none: "Nothing", headphones: "Headphones", sunglasses: "Sunglasses" };
export const DEFAULT_STYLE = { name: "Cori", look: "cream", acc: "none" };

function el(tag, attrs = {}, ...kids) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  for (const k of kids) n.append(k);
  return n;
}

const text = (t, x, y, size) => {
  const n = el("text", { x, y, "font-size": size, class: "glyph" });
  n.textContent = t;
  return n;
};

const sparkle = (x, y, s) =>
  el("path", { d: `M${x} ${y - s} L${x + s * 0.28} ${y - s * 0.28} L${x + s} ${y} L${x + s * 0.28} ${y + s * 0.28} L${x} ${y + s} L${x - s * 0.28} ${y + s * 0.28} L${x - s} ${y} L${x - s * 0.28} ${y - s * 0.28}Z` });

// short fur strokes near the silhouette; they sell the plush texture
const FUR = [
  "M46 150 q-6 3 -8 9", "M40 176 q-7 2 -10 8", "M54 214 q-6 4 -7 11", "M78 240 q-3 6 -1 12",
  "M194 150 q6 3 8 9", "M200 176 q7 2 10 8", "M186 214 q6 4 7 11", "M162 240 q3 6 1 12",
  "M76 70 q-2 -7 2 -12", "M164 70 q2 -7 -2 -12", "M104 62 q-1 -6 3 -9", "M136 62 q1 -6 -3 -9",
];

export function createAvatar(style = DEFAULT_STYLE) {
  const svg = el("svg", {
    viewBox: "0 0 240 272", class: "cori", role: "img", "aria-label": `${style.name}, your vault guide`,
    "data-mood": "sleep", "data-look": style.look, "data-acc": style.acc, "data-working": "false",
  });

  const eye = (cx) => el("g", { class: "eye" },
    el("circle", { class: "pupil", cx, cy: 134, r: 8 }),
    el("circle", { class: "glint", cx: cx + 2.6, cy: 130.6, r: 2.6 }));

  svg.append(
    el("defs", {},
      // a rough displacement on the silhouette makes the edge look like fuzz
      el("filter", { id: "coriFuzz", x: "-8%", y: "-8%", width: "116%", height: "116%" },
        el("feTurbulence", { type: "fractalNoise", baseFrequency: "0.85", numOctaves: "2", seed: "7", result: "n" }),
        el("feDisplacementMap", { in: "SourceGraphic", in2: "n", scale: "5", xChannelSelector: "R", yChannelSelector: "G" })),
      el("radialGradient", { id: "coriFur", cx: "0.38", cy: "0.28", r: "0.85" },
        el("stop", { offset: "0", class: "fur-a" }), el("stop", { offset: "1", class: "fur-b" })),
      el("radialGradient", { id: "coriHalo" },
        el("stop", { offset: "0", class: "halo-a" }), el("stop", { offset: "0.6", class: "halo-a mid" }), el("stop", { offset: "1", class: "halo-b" }))),

    el("ellipse", { class: "shadow", cx: 120, cy: 262, rx: 66, ry: 8 }),
    el("circle", { class: "halo", cx: 120, cy: 156, r: 116, fill: "url(#coriHalo)" }),

    el("g", { class: "float" },
      // ears, feet, arms sit behind / beside the body
      el("g", { class: "ears", filter: "url(#coriFuzz)" },
        el("circle", { class: "fur", cx: 68, cy: 84, r: 19 }), el("circle", { class: "ear-in", cx: 68, cy: 85, r: 9 }),
        el("circle", { class: "fur", cx: 172, cy: 84, r: 19 }), el("circle", { class: "ear-in", cx: 172, cy: 85, r: 9 })),
      el("g", { class: "feet", filter: "url(#coriFuzz)" },
        el("ellipse", { class: "fur edge", cx: 90, cy: 252, rx: 23, ry: 11 }),
        el("ellipse", { class: "fur edge", cx: 150, cy: 252, rx: 23, ry: 11 })),
      el("g", { class: "arm arm-left", filter: "url(#coriFuzz)" }, el("ellipse", { class: "fur", cx: 27, cy: 198, rx: 13, ry: 21, transform: "rotate(-14 27 198)" })),

      // body: one round, roly-poly shape
      el("g", { class: "body", filter: "url(#coriFuzz)" },
        el("path", { class: "fur-body", d: "M120 58 C192 58 216 120 216 176 C216 228 174 252 120 252 C66 252 24 228 24 176 C24 120 48 58 120 58Z" }),
        el("ellipse", { class: "belly", cx: 120, cy: 214, rx: 48, ry: 30 })),
      el("g", { class: "furlines" }, FUR.map((d) => el("path", { d }))),
      el("path", { class: "tuft", d: "M112 62 q-6 -16 6 -20 q-2 10 8 12 q-2 -9 8 -14 q0 14 -10 22 z" }),

      el("g", { class: "arm arm-right-wrap" },
        el("g", { filter: "url(#coriFuzz)" }, el("ellipse", { class: "fur", cx: 213, cy: 198, rx: 13, ry: 21, transform: "rotate(14 213 198)" }))),

      // lanyard with a small key charm (the keeper of your vault)
      el("g", { class: "charm" },
        el("path", { class: "string", d: "M92 178 Q120 204 148 178" }),
        el("circle", { class: "charm-glow", cx: 120, cy: 200, r: 16 }),
        el("circle", { class: "charm-key", cx: 120, cy: 199, r: 6.5 }),
        el("path", { class: "charm-key", d: "M118 204 h4 v9 h-4z M122 208 h4 v2.4 h-4z" })),

      // face: beady eyes, rosy cheeks, small smile
      el("g", { class: "face" },
        el("ellipse", { class: "cheek", cx: 68, cy: 154, rx: 14, ry: 9 }),
        el("ellipse", { class: "cheek", cx: 172, cy: 154, rx: 14, ry: 9 }),
        el("g", { class: "eyes" }, eye(90), eye(150)),
        el("path", { class: "lid-closed", d: "M80 136 Q90 144 100 136 M140 136 Q150 144 160 136" }),
        el("path", { class: "lid-cheer", d: "M80 138 Q90 126 100 138 M140 138 Q150 126 160 138" }),
        el("path", { class: "brow brow-alert", d: "M80 118 Q90 111 100 116 M140 116 Q150 111 160 118" }),
        el("path", { class: "brow brow-worried", d: "M81 120 Q90 119 100 112 M140 112 Q150 119 159 120" }),
        el("path", { class: "mouth mouth-smile", d: "M108 152 Q120 163 132 152" }),
        el("path", { class: "mouth mouth-flat", d: "M112 156 L128 156" }),
        el("path", { class: "mouth mouth-open", d: "M107 151 Q120 172 133 151 Z" }),
        el("ellipse", { class: "mouth mouth-o", cx: 120, cy: 158, rx: 5, ry: 6.5 }),
        el("path", { class: "mouth mouth-worried", d: "M108 160 Q120 150 132 160" })),

      // accessories (chosen in Customize)
      el("g", { class: "acc acc-headphones" },
        el("path", { class: "band", d: "M40 138 Q38 44 120 44 Q202 44 200 138" }),
        el("rect", { class: "cup", x: 26, y: 118, width: 26, height: 44, rx: 12 }),
        el("rect", { class: "cup", x: 188, y: 118, width: 26, height: 44, rx: 12 }),
        el("rect", { class: "cup-accent", x: 32, y: 128, width: 8, height: 24, rx: 4 }),
        el("rect", { class: "cup-accent", x: 200, y: 128, width: 8, height: 24, rx: 4 })),
      el("g", { class: "acc acc-sunglasses" },
        el("rect", { class: "lens", x: 66, y: 118, width: 46, height: 30, rx: 12 }),
        el("rect", { class: "lens", x: 128, y: 118, width: 46, height: 30, rx: 12 }),
        el("path", { class: "bridge", d: "M112 128 Q120 124 128 128" }),
        el("path", { class: "lens-glint", d: "M74 126 l10 -0 l-8 10z M136 126 l10 0 l-8 10z" })),

      // working overlay: a tiny keyboard she taps on
      el("g", { class: "desk" },
        el("rect", { class: "kb", x: 66, y: 222, width: 108, height: 26, rx: 8 }),
        ...[0, 1, 2, 3, 4, 5, 6].map((i) => el("rect", { class: "key", x: 74 + i * 14.4, y: 228, width: 10, height: 6, rx: 2 })),
        ...[0, 1, 2, 3, 4, 5].map((i) => el("rect", { class: "key", x: 81 + i * 14.4, y: 238, width: 10, height: 6, rx: 2 })),
        el("circle", { class: "fur edge tap tap-a", cx: 100, cy: 218, r: 9 }),
        el("circle", { class: "fur edge tap tap-b", cx: 140, cy: 218, r: 9 }))),

    // effects
    el("g", { class: "zzz" }, text("z", 184, 84, 24), text("z", 202, 60, 17), text("z", 216, 40, 12)),
    el("g", { class: "bang" }, text("!", 198, 78, 38)),
    el("g", { class: "thought" }, el("circle", { cx: 182, cy: 92, r: 4 }), el("circle", { cx: 196, cy: 76, r: 6 }), el("circle", { cx: 214, cy: 54, r: 9 })),
    el("g", { class: "sparkles" }, sparkle(30, 110, 11), sparkle(214, 128, 9), sparkle(196, 38, 8), sparkle(46, 214, 7)),
    el("g", { class: "motes" }, sparkle(58, 66, 5), sparkle(190, 200, 5), sparkle(70, 250, 4)));

  return {
    svg,
    setMood(mood) { svg.setAttribute("data-mood", mood); },
    get mood() { return svg.getAttribute("data-mood"); },
    setWorking(on) { svg.setAttribute("data-working", on ? "true" : "false"); },
    setStyle(s) {
      svg.setAttribute("data-look", s.look);
      svg.setAttribute("data-acc", s.acc);
      svg.setAttribute("aria-label", `${s.name}, your vault guide`);
    },
  };
}
