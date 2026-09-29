// Cori, the keeper of your vault: a small floating sprite in a peaked hat, holding a glowing key.
// One SVG, six moods. The mood is a data attribute; CSS decides what shows.
// Moods: sleep (locked), happy (idle), alert (something needs you), think (working), worried (a problem), cheer (success).

const NS = "http://www.w3.org/2000/svg";

function el(tag, attrs = {}, ...kids) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  for (const k of kids) n.append(k);
  return n;
}

const text = (t, x, y, size, cls = "glyph") => {
  const n = el("text", { x, y, "font-size": size, class: cls });
  n.textContent = t;
  return n;
};

// four-point sparkle centred on (x, y)
const sparkle = (x, y, s) =>
  el("path", { d: `M${x} ${y - s} L${x + s * 0.28} ${y - s * 0.28} L${x + s} ${y} L${x + s * 0.28} ${y + s * 0.28} L${x} ${y + s} L${x - s * 0.28} ${y + s * 0.28} L${x - s} ${y} L${x - s * 0.28} ${y - s * 0.28}Z` });

export function createAvatar() {
  const svg = el("svg", { viewBox: "0 0 240 290", class: "cori", role: "img", "aria-label": "Cori, keeper of your vault", "data-mood": "sleep" });

  svg.append(
    el("defs", {},
      el("radialGradient", { id: "coriHalo" },
        el("stop", { offset: "0", class: "halo-a" }),
        el("stop", { offset: "0.55", class: "halo-a mid" }),
        el("stop", { offset: "1", class: "halo-b" }))),
    el("ellipse", { class: "shadow", cx: 120, cy: 278, rx: 54, ry: 7 }),
    el("circle", { class: "halo", cx: 120, cy: 150, r: 112, fill: "url(#coriHalo)" }),

    el("g", { class: "float" },
      // cloak: a bell that ends in a wavy, floating hem
      el("path", { class: "cloak", d: "M82 126 C64 168 50 212 44 246 Q66 262 82 246 Q101 264 120 248 Q139 264 158 246 Q174 262 196 246 C190 212 176 168 158 126 Z" }),
      el("path", { class: "cloak-light", d: "M104 140 C98 178 92 214 90 240 Q105 252 120 242 Q135 252 150 240 C148 214 142 178 136 140 Z" }),
      el("path", { class: "trim", d: "M64 216 Q92 232 120 226 Q148 232 176 216", fill: "none" }),

      // long hair behind the face
      el("path", { class: "hair", d: "M76 96 C60 130 64 160 78 172 C84 150 86 128 90 108Z M164 96 C180 130 176 160 162 172 C156 150 154 128 150 108Z" }),

      // head
      el("circle", { class: "skin", cx: 120, cy: 104, r: 43 }),

      // fringe
      el("path", { class: "hair", d: "M78 96 Q84 70 120 66 Q156 70 162 96 Q150 84 136 86 Q126 80 116 88 Q100 82 78 96Z" }),

      // face
      el("g", { class: "face" },
        el("ellipse", { class: "cheek", cx: 84, cy: 120, rx: 10, ry: 6 }),
        el("ellipse", { class: "cheek", cx: 156, cy: 120, rx: 10, ry: 6 }),

        el("g", { class: "eyes" },
          el("g", { class: "eye" },
            el("ellipse", { class: "eye-white", cx: 102, cy: 108, rx: 11, ry: 13 }),
            el("circle", { class: "pupil", cx: 103, cy: 110, r: 8 }),
            el("circle", { class: "glint", cx: 106, cy: 105, r: 3 }),
            el("circle", { class: "glint small", cx: 100, cy: 114, r: 1.6 })),
          el("g", { class: "eye" },
            el("ellipse", { class: "eye-white", cx: 138, cy: 108, rx: 11, ry: 13 }),
            el("circle", { class: "pupil", cx: 139, cy: 110, r: 8 }),
            el("circle", { class: "glint", cx: 142, cy: 105, r: 3 }),
            el("circle", { class: "glint small", cx: 136, cy: 114, r: 1.6 }))),

        el("path", { class: "lid-closed", d: "M91 110 Q102 119 113 110 M127 110 Q138 119 149 110" }),
        el("path", { class: "lid-cheer", d: "M91 113 Q102 100 113 113 M127 113 Q138 100 149 113" }),

        el("path", { class: "brow brow-alert", d: "M90 90 Q102 82 114 88 M126 88 Q138 82 150 90" }),
        el("path", { class: "brow brow-worried", d: "M91 92 Q102 91 113 84 M127 84 Q138 91 149 92" }),

        el("path", { class: "mouth mouth-smile", d: "M108 128 Q120 138 132 128" }),
        el("path", { class: "mouth mouth-flat", d: "M112 132 L128 132" }),
        el("path", { class: "mouth mouth-open", d: "M107 127 Q120 149 133 127 Z" }),
        el("ellipse", { class: "mouth mouth-o", cx: 120, cy: 133, rx: 5, ry: 6.5 }),
        el("path", { class: "mouth mouth-worried", d: "M109 136 Q120 126 131 136" }))),

    // peaked hat (drawn over the hair), with a curled tip and a star
    el("g", { class: "hat" },
      el("path", { class: "hat-cone", d: "M72 82 Q96 44 116 16 Q128 8 142 20 Q136 26 134 40 Q140 62 168 82 Z" }),
      el("path", { class: "hat-cone-light", d: "M96 58 Q108 34 122 22 Q118 44 124 70 Q108 66 96 58Z" }),
      el("ellipse", { class: "hat-brim", cx: 120, cy: 82, rx: 58, ry: 12 }),
      el("path", { class: "hat-band", d: "M80 78 Q120 92 160 78 L160 84 Q120 98 80 84Z" }),
      el("path", { class: "star", d: "M142 22 l3.4 7.4 l8 1 l-6 5.4 l1.6 7.8 l-7 -4 l-7 4 l1.6 -7.8 l-6 -5.4 l8 -1z", transform: "translate(-2 -12) scale(.95)" })),

    // hands holding the glowing key orb
    el("g", { class: "hands" },
      el("circle", { class: "orb-glow", cx: 120, cy: 176, r: 26 }),
      el("circle", { class: "orb", cx: 120, cy: 176, r: 15 }),
      el("path", { class: "orb-key", d: "M120 168 a4 4 0 1 1 0.01 0z M118.4 172 h3.2 v10 h-2 v-2.4 h-1.2z" }),
      el("ellipse", { class: "sleeve", cx: 96, cy: 168, rx: 14, ry: 10, transform: "rotate(24 96 168)" }),
      el("circle", { class: "skin", cx: 106, cy: 178, r: 7 }),
      el("g", { class: "arm-right-wrap" },
        el("ellipse", { class: "sleeve", cx: 144, cy: 168, rx: 14, ry: 10, transform: "rotate(-24 144 168)" }),
        el("circle", { class: "skin", cx: 134, cy: 178, r: 7 }))),

    // effects
    el("g", { class: "zzz" }, text("z", 178, 66, 22), text("z", 196, 44, 16), text("z", 210, 26, 12)),
    el("g", { class: "bang" }, text("!", 190, 60, 36)),
    el("g", { class: "sparkles" }, sparkle(34, 96, 11), sparkle(208, 120, 9), sparkle(190, 34, 8), sparkle(52, 190, 7)),
    el("g", { class: "motes" }, sparkle(60, 60, 5), sparkle(186, 176, 5), sparkle(74, 232, 4)));

  return {
    svg,
    setMood(mood) { svg.setAttribute("data-mood", mood); },
    get mood() { return svg.getAttribute("data-mood"); },
  };
}
