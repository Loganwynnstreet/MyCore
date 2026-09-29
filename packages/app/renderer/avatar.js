// Cori, the vault guide. One SVG, six moods. The mood is a data attribute; CSS decides what shows.
// Moods: sleep (locked), happy (idle), alert (something needs you), think (working), worried (a problem), cheer (success).

const NS = "http://www.w3.org/2000/svg";

function el(tag, attrs = {}, ...kids) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  for (const k of kids) n.append(k);
  return n;
}

export function createAvatar() {
  const svg = el("svg", { viewBox: "0 0 240 280", class: "cori", role: "img", "aria-label": "Cori, your vault guide", "data-mood": "sleep" });

  svg.append(
    el("ellipse", { class: "shadow", cx: 120, cy: 262, rx: 66, ry: 9 }),

    // antenna with a glowing key bulb
    el("g", { class: "antenna" },
      el("line", { x1: 120, y1: 46, x2: 120, y2: 20, class: "stroke-body" }),
      el("circle", { class: "bulb-glow", cx: 120, cy: 14, r: 14 }),
      el("circle", { class: "bulb", cx: 120, cy: 14, r: 8 })),

    // arms
    el("path", { class: "arm arm-left stroke-body", d: "M40 168 Q16 176 22 204" }),
    el("g", { class: "arm-right-wrap" },
      el("path", { class: "arm arm-right stroke-body", d: "M200 168 Q224 176 218 204" })),

    // feet
    el("ellipse", { class: "fill-dark", cx: 88, cy: 250, rx: 20, ry: 10 }),
    el("ellipse", { class: "fill-dark", cx: 152, cy: 250, rx: 20, ry: 10 }),

    // body + belly + keyhole emblem
    el("path", { class: "body fill-body", d: "M120 44 C188 44 208 108 208 164 C208 222 172 252 120 252 C68 252 32 222 32 164 C32 108 52 44 120 44Z" }),
    el("ellipse", { class: "fill-belly", cx: 120, cy: 200, rx: 46, ry: 38 }),
    el("circle", { class: "fill-key", cx: 120, cy: 192, r: 11 }),
    el("path", { class: "fill-key", d: "M116 198 L124 198 L127 216 L113 216Z" }),

    // face
    el("g", { class: "face" },
      el("ellipse", { class: "cheek", cx: 76, cy: 138, rx: 12, ry: 7 }),
      el("ellipse", { class: "cheek", cx: 164, cy: 138, rx: 12, ry: 7 }),

      el("g", { class: "eyes" },
        el("g", { class: "eye" },
          el("ellipse", { class: "eye-white", cx: 92, cy: 108, rx: 15, ry: 17 }),
          el("circle", { class: "pupil", cx: 94, cy: 110, r: 8 }),
          el("circle", { class: "glint", cx: 97, cy: 105, r: 3 })),
        el("g", { class: "eye" },
          el("ellipse", { class: "eye-white", cx: 148, cy: 108, rx: 15, ry: 17 }),
          el("circle", { class: "pupil", cx: 150, cy: 110, r: 8 }),
          el("circle", { class: "glint", cx: 153, cy: 105, r: 3 }))),

      // closed eyes (sleep) and happy squint (cheer)
      el("path", { class: "lid-closed", d: "M77 110 Q92 121 107 110 M133 110 Q148 121 163 110" }),
      el("path", { class: "lid-cheer", d: "M77 114 Q92 98 107 114 M133 114 Q148 98 163 114" }),

      // brows
      el("path", { class: "brow brow-alert", d: "M76 82 Q92 72 108 80 M132 80 Q148 72 164 82" }),
      el("path", { class: "brow brow-worried", d: "M78 84 Q92 82 108 74 M132 74 Q148 82 162 84" }),

      // mouths
      el("path", { class: "mouth mouth-smile", d: "M104 140 Q120 154 136 140" }),
      el("path", { class: "mouth mouth-flat", d: "M108 144 L132 144" }),
      el("path", { class: "mouth mouth-open", d: "M102 138 Q120 168 138 138 Z" }),
      el("ellipse", { class: "mouth mouth-o", cx: 120, cy: 146, rx: 6, ry: 8 }),
      el("path", { class: "mouth mouth-worried", d: "M104 150 Q120 138 136 150" })),

    // sleeping z's, alert mark, cheer sparkles
    el("g", { class: "zzz" },
      textNode("z", 176, 62, 22), textNode("z", 194, 40, 16), textNode("z", 208, 22, 12)),
    el("g", { class: "bang" }, textNode("!", 196, 52, 34)),
    el("g", { class: "sparkles" },
      el("path", { d: "M30 70 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4z" }),
      el("path", { d: "M212 96 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 l8 -3z" }),
      el("path", { d: "M198 26 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3z" })));

  function textNode(t, x, y, size) {
    const n = el("text", { x, y, "font-size": size, class: "glyph" });
    n.textContent = t;
    return n;
  }

  return {
    svg,
    setMood(mood) { svg.setAttribute("data-mood", mood); },
    get mood() { return svg.getAttribute("data-mood"); },
  };
}
