import { createAvatar } from "./avatar.js";

// Everything the page shows is built with textContent / text nodes. Vault content, including
// suggestions written by AIs, is untrusted and must never be parsed as HTML.

const RECORD_TYPES = ["memory", "profile", "person", "event", "conversation_ref", "ai_account", "usage"];
const TYPE_LABEL = {
  memory: "Memory", profile: "Profile", person: "Person", event: "Event",
  conversation_ref: "Conversation", ai_account: "AI account", usage: "Usage",
};
const TYPE_PLURAL = {
  memory: "memories", profile: "profile facts", person: "people", event: "events",
  conversation_ref: "conversations", ai_account: "AI accounts", usage: "usage records",
};

const root = document.getElementById("root");
const cori = createAvatar();
let statusTimer = null;

// ---------- tiny helpers ----------

function h(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (k in n) n[k] = v;
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return n;
}

async function call(op, args = {}) {
  const r = await window.mycore.call(op, args);
  if (!r.ok) throw Object.assign(new Error(r.message || r.error), { code: r.error });
  return r.result;
}

function toast(msg) {
  const t = h("div", { class: "toast", role: "status" }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 2600);
}

const when = (ts) => new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

function plural(n, one, many) { return `${n} ${n === 1 ? one : many}`; }

function recordTitle(r) {
  if (r.masked) return "Hidden secret";
  const d = r.data || {};
  if (typeof d.text === "string") return d.text;
  if (r.type === "profile" && d.key) return `${d.key}: ${d.value ?? ""}`;
  if (r.type === "person" && d.name) return d.relation ? `${d.name} (${d.relation})` : d.name;
  if (d.title) return d.date ? `${d.title} · ${d.date}` : String(d.title);
  if (d.name) return String(d.name);
  return JSON.stringify(d);
}

function describeScope(s) {
  const what = s.types && s.types.length ? s.types.map((t) => TYPE_PLURAL[t] || t).join(", ") : "every kind of info";
  const level = { public: "public info only", personal: "everyday personal info", private: "including private info" }[s.maxSensitivity] || s.maxSensitivity;
  const parts = [];
  if (s.read) parts.push(`Can read ${what} (${level})`);
  if (s.write) parts.push("can suggest new memories for your approval");
  if (s.tags && s.tags.length) parts.push(`only items tagged ${s.tags.join(", ")}`);
  const line = parts.join("; ");
  return line.charAt(0).toUpperCase() + line.slice(1) + ".";
}

// ---------- Cori's voice ----------

let bubble = null;
function say(text, mood) {
  if (mood) cori.setMood(mood);
  if (!bubble) return;
  const fresh = h("div", { class: "bubble", role: "status", "aria-live": "polite" }, text);
  bubble.replaceWith(fresh);
  bubble = fresh;
}

// ---------- gates: fatal / onboarding / locked ----------

function gate(...children) {
  stopPolling();
  root.replaceChildren(h("main", { class: "gate" }, h("div", { class: "gate-card" }, ...children)));
}

function fatal(message) {
  cori.setMood("worried");
  gate(cori.svg, h("h1", {}, "I can't reach the vault"), h("p", { class: "muted" }, message),
    h("button", { class: "btn primary", onclick: boot }, "Try again"));
}

function onboarding() {
  cori.setMood("happy");
  const error = h("p", { class: "error", role: "alert" });
  const pass = h("input", { type: "password", autocomplete: "new-password", id: "p1", required: true });
  const pass2 = h("input", { type: "password", autocomplete: "new-password", id: "p2", required: true });
  const form = h("form", {
    onsubmit: async (e) => {
      e.preventDefault();
      error.textContent = "";
      if (pass.value.length < 8) return void (error.textContent = "Use at least 8 characters.");
      if (pass.value !== pass2.value) return void (error.textContent = "Those two don't match.");
      cori.setMood("think");
      btn.disabled = true;
      try {
        const { recoveryPhrase } = await call("create", { passphrase: pass.value });
        showRecovery(recoveryPhrase);
      } catch (err) {
        cori.setMood("worried");
        error.textContent = err.message;
        btn.disabled = false;
      }
    },
  },
  h("label", { class: "field" }, h("span", {}, "Choose a passphrase"), pass),
  h("label", { class: "field" }, h("span", {}, "Repeat it"), pass2),
  error);
  const btn = h("button", { class: "btn primary", type: "submit" }, "Create my vault");
  form.append(btn);
  gate(cori.svg,
    h("h1", {}, "Hi, I'm Cori"),
    h("p", { class: "muted" }, "I'll look after your vault: the private place where your personal context lives, so you decide which AIs see what. Let's set a passphrase. Nobody, including me, can recover it for you."),
    form);
}

function showRecovery(phrase) {
  cori.setMood("cheer");
  const words = phrase.split(" ");
  const ack = h("input", { type: "checkbox", id: "ack" });
  const go = h("button", { class: "btn primary", disabled: true, onclick: boot }, "I've saved it, continue");
  ack.addEventListener("change", () => { go.disabled = !ack.checked; });
  gate(cori.svg,
    h("h1", {}, "Your recovery phrase"),
    h("p", { class: "muted" }, "If you forget your passphrase, these 24 words are the only way back in. Write them down and keep them somewhere safe and offline. I'll show them just this once."),
    h("div", { class: "phrase" }, words.map((w, i) => h("div", {}, h("span", {}, `${i + 1}. `), w))),
    h("label", { class: "row small" }, ack, "I've written it down somewhere safe"),
    go);
}

function locked(message) {
  cori.setMood("sleep");
  const error = h("p", { class: "error", role: "alert" }, message || "");
  const pass = h("input", { type: "password", autocomplete: "current-password", id: "pw", required: true });
  const btn = h("button", { class: "btn primary", type: "submit" }, "Wake up Cori");
  const form = h("form", {
    onsubmit: async (e) => {
      e.preventDefault();
      error.textContent = "";
      btn.disabled = true;
      cori.setMood("think");
      try {
        await call("unlock", { passphrase: pass.value });
        pass.value = "";
        await shell();
      } catch (err) {
        cori.setMood("worried");
        error.textContent = err.code === "unauthorized" ? "That passphrase didn't work." : err.message;
        btn.disabled = false;
        pass.select();
      }
    },
  }, h("label", { class: "field" }, h("span", {}, "Passphrase"), pass), error, btn);
  gate(cori.svg, h("h1", {}, "Your vault is locked"), h("p", { class: "muted" }, "I'm keeping everything safe. Enter your passphrase to wake me up."), form);
  pass.focus();
}

// ---------- shell ----------

const ui = { tab: "today", contentEl: null, tabsEl: null, chipsEl: null, stats: null, labels: new Map() };

async function refreshStats() {
  ui.stats = await call("stats");
  const passports = await call("passports", { includeRevoked: true });
  ui.labels = new Map(passports.map((p) => [`passport:${p.id}`, p.label]));
  if (ui.chipsEl) {
    const total = Object.values(ui.stats.counts).reduce((a, b) => a + b, 0);
    ui.chipsEl.replaceChildren(
      h("span", { class: "chip" }, h("b", {}, total), ` remembered`),
      h("span", { class: "chip" }, h("b", {}, ui.stats.connections), ` connected`));
  }
  renderTabs();
}

const TABS = [["today", "Today"], ["connections", "Connections"], ["memories", "Memories"], ["activity", "Activity"]];

function renderTabs() {
  if (!ui.tabsEl) return;
  ui.tabsEl.replaceChildren(...TABS.map(([id, label]) =>
    h("button", { class: "tab", role: "tab", "aria-selected": ui.tab === id ? "true" : "false", onclick: () => openTab(id) },
      label, id === "today" && ui.stats?.pending ? h("span", { class: "count" }, ui.stats.pending) : null)));
}

async function shell() {
  bubble = h("div", { class: "bubble" });
  ui.chipsEl = h("div", { class: "chips" });
  ui.tabsEl = h("nav", { class: "tabs", role: "tablist" });
  ui.contentEl = h("section", { class: "content", role: "tabpanel", tabindex: 0 });
  root.replaceChildren(h("div", { class: "shell" },
    h("aside", { class: "stage" },
      h("div", { class: "brand" }, h("i"), "MyCore"),
      cori.svg, bubble, ui.chipsEl, h("div", { class: "spacer" }),
      h("button", { class: "btn lock-btn", onclick: lockNow }, "Lock vault")),
    h("main", { class: "main" }, ui.tabsEl, ui.contentEl)));
  startPolling();
  await openTab(ui.tab);
}

async function lockNow() {
  await call("lock").catch(() => {});
  locked();
}

async function openTab(id) {
  ui.tab = id;
  try {
    await refreshStats();
    ui.contentEl.replaceChildren();
    await ({ today, connections, memories, activity })[id]();
  } catch (e) {
    if (e.code === "vault_locked") return locked("I locked up while you were away.");
    say(`Something went wrong: ${e.message}`, "worried");
  }
}

// ---------- Today ----------

async function today() {
  const pending = await call("pending");
  if (pending.length) {
    say(`You have ${plural(pending.length, "suggestion", "suggestions")} waiting. Nothing joins your vault until you say so.`, "alert");
  } else {
    say("All quiet. Nothing needs your attention.", "happy");
  }
  const c = ui.contentEl;
  c.append(h("h2", { class: "section-title" }, "Waiting for your approval"));
  if (!pending.length) c.append(h("div", { class: "card empty" }, "No suggestions right now. When a connected AI wants to remember something, it will show up here first."));
  for (const r of pending) c.append(pendingCard(r));

  c.append(h("h2", { class: "section-title" }, "In your vault"));
  const counts = ui.stats.counts;
  const kinds = Object.keys(counts);
  c.append(kinds.length
    ? h("div", { class: "row wrap" }, kinds.map((t) => h("span", { class: "chip" }, h("b", {}, counts[t]), ` ${TYPE_PLURAL[t] || t}`)))
    : h("div", { class: "card empty" }, "Your vault is empty. Add your first memory from the Memories tab."));
}

function pendingCard(r) {
  const from = ui.labels.get(r.source) || r.source;
  const card = h("article", { class: "card" },
    h("div", { class: "head" }, h("span", { class: "badge type" }, TYPE_LABEL[r.type] || r.type), h("span", { class: "muted small" }, `suggested by ${from} · ${when(r.createdAt)}`)),
    h("p", { class: "body" }, recordTitle(r)),
    r.tags?.length ? h("div", { class: "row wrap" }, r.tags.map((t) => h("span", { class: "tag" }, t))) : null,
    h("div", { class: "actions" },
      h("button", { class: "btn primary small", onclick: () => decide("approve", r) }, "Add to my vault"),
      h("button", { class: "btn small", onclick: () => decide("reject", r) }, "Discard")));
  return card;
}

async function decide(op, r) {
  try {
    await call(op, { id: r.id });
    say(op === "approve" ? "Added to your memories!" : "Discarded. I won't mention it again.", op === "approve" ? "cheer" : "think");
    await refreshStats();
    ui.contentEl.replaceChildren();
    const keepMood = cori.mood;
    await today();
    cori.setMood(keepMood);
    if (op === "approve") say("Added to your memories!", "cheer");
  } catch (e) { say(e.message, "worried"); }
}

// ---------- Connections ----------

async function connections() {
  say("These are the AIs I let in, and exactly what each one may see. You can cut any of them off instantly.", "happy");
  const passports = await call("passports", { includeRevoked: true });
  const c = ui.contentEl;
  c.append(h("div", { class: "row" },
    h("h2", { class: "section-title grow" }, "Connected AIs"),
    h("button", { class: "btn primary", onclick: connectDialog }, "Connect an AI")));
  if (!passports.length) c.append(h("div", { class: "card empty" }, "No AI is connected yet. Connect one and choose exactly what it can see."));
  for (const p of passports) c.append(passportCard(p));
}

function passportState(p) {
  if (p.revokedAt) return "revoked";
  if (p.expiresAt && Date.parse(p.expiresAt) <= Date.now()) return "expired";
  return "active";
}

function passportCard(p) {
  const state = passportState(p);
  const revoke = h("button", { class: "btn danger small" }, "Revoke access");
  let armed = false;
  revoke.addEventListener("click", async () => {
    if (!armed) { armed = true; revoke.textContent = "Really revoke?"; setTimeout(() => { armed = false; revoke.textContent = "Revoke access"; }, 3500); return; }
    try {
      await call("revoke", { id: p.id });
      say(`${p.label} has been cut off. Its very next request will be refused.`, "think");
      await refreshStats();
      ui.contentEl.replaceChildren();
      await connections();
    } catch (e) { say(e.message, "worried"); }
  });
  return h("article", { class: "card" },
    h("div", { class: "head" }, h("span", { class: "title grow" }, p.label), h("span", { class: `badge ${state}` }, state)),
    h("p", { class: "body muted" }, describeScope(p.scopes)),
    h("p", { class: "small muted" }, `Connected ${when(p.createdAt)}${p.expiresAt ? ` · expires ${when(p.expiresAt)}` : ""}`),
    state === "active" ? h("div", { class: "actions" }, revoke) : null);
}

function connectDialog() {
  const dlg = h("dialog", {});
  const label = h("input", { type: "text", id: "lbl", placeholder: "e.g. Claude Desktop", maxLength: 60, required: true });
  const typeBoxes = ["memory", "profile", "person", "event"].map((t) =>
    h("label", { class: "check" }, h("input", { type: "checkbox", value: t, checked: t === "memory" || t === "profile" }), TYPE_LABEL[t]));
  const levels = [
    ["public", "Public only", "Only things you've marked public."],
    ["personal", "Everyday", "Normal personal context. A good default."],
    ["private", "Including private", "Health, finances, relationships, anything you marked private."],
  ];
  const radios = levels.map(([v, t, d]) =>
    h("label", { class: "radio" }, h("input", { type: "radio", name: "lvl", value: v, checked: v === "personal" }), h("div", {}, h("b", {}, t), h("div", { class: "small muted" }, d))));
  const write = h("input", { type: "checkbox", id: "wr", checked: true });
  const expiry = h("select", {}, [["", "Never"], ["1", "1 day"], ["7", "7 days"], ["30", "30 days"]].map(([v, t]) => h("option", { value: v }, t)));
  const error = h("p", { class: "error", role: "alert" });

  const form = h("form", { method: "dialog", class: "dialog-body", onsubmit: async (e) => {
    e.preventDefault();
    error.textContent = "";
    const types = typeBoxes.map((b) => b.firstChild).filter((i) => i.checked).map((i) => i.value);
    if (!types.length) return void (error.textContent = "Choose at least one kind of information.");
    const lvl = radios.map((r) => r.firstChild).find((i) => i.checked).value;
    const days = Number(expiry.value);
    try {
      const { passport, token } = await call("grant", {
        label: label.value.trim(),
        scopes: { read: true, write: write.checked, types, maxSensitivity: lvl },
        expiresAt: days ? new Date(Date.now() + days * 86400000).toISOString() : undefined,
      });
      showToken(dlg, passport, token);
    } catch (err) { error.textContent = err.message; }
  } },
  h("h2", {}, "Connect an AI"),
  h("label", { class: "field" }, h("span", {}, "Name"), label),
  h("div", { class: "field" }, h("span", { class: "field" }, "What may it read?"), h("div", { class: "checks" }, typeBoxes)),
  h("div", { class: "field" }, h("span", { class: "field" }, "How much detail?"), h("div", { class: "radios" }, radios)),
  h("label", { class: "row" }, write, h("span", {}, "Let it suggest new memories ", h("span", { class: "field-hint" }, "(you approve each one)"))),
  h("label", { class: "field" }, h("span", {}, "Access lasts"), expiry),
  h("p", { class: "field-hint" }, "Secret items are never shared with any AI."),
  error,
  h("div", { class: "dialog-actions" },
    h("button", { class: "btn", type: "button", onclick: () => dlg.close() }, "Cancel"),
    h("button", { class: "btn primary", type: "submit" }, "Create connection")));
  dlg.append(form);
  dlg.addEventListener("close", () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  label.focus();
}

function showToken(dlg, passport, token) {
  cori.setMood("cheer");
  say("Connected! Copy the key now. I'll never show it again.", "cheer");
  const snippet = JSON.stringify({ mcpServers: { mycore: { command: "node", args: ["<path to MyCore>/packages/mcp/dist/index.js"], env: { MYCORE_TOKEN: token } } } }, null, 2);
  const copy = (text, btn) => async () => {
    try { await navigator.clipboard.writeText(text); btn.textContent = "Copied"; } catch { btn.textContent = "Select and copy manually"; }
  };
  const b1 = h("button", { class: "btn small" }, "Copy key");
  const b2 = h("button", { class: "btn small" }, "Copy config");
  b1.addEventListener("click", copy(token, b1));
  b2.addEventListener("click", copy(snippet, b2));
  dlg.replaceChildren(h("div", { class: "dialog-body" },
    h("h2", {}, `${passport.label} is connected`),
    h("p", { class: "muted" }, "This is its key. Anyone who has it can read what you allowed, so treat it like a password."),
    h("div", { class: "token" }, token),
    h("div", { class: "row" }, b1),
    h("p", { class: "muted small" }, "For an MCP-capable app such as Claude Desktop, add this to its MCP server settings:"),
    h("pre", { class: "snippet" }, snippet),
    h("div", { class: "row" }, b2),
    h("div", { class: "dialog-actions" }, h("button", { class: "btn primary", onclick: async () => { dlg.close(); await openTab("connections"); } }, "Done"))));
}

// ---------- Memories ----------

const memState = { type: "", query: "" };

async function memories() {
  say("Here's what I remember about you. Secrets stay hidden, even from this screen.", "happy");
  const c = ui.contentEl;
  const search = h("input", { type: "text", placeholder: "Search what I know…", value: memState.query, "aria-label": "Search memories" });
  const listEl = h("div", { class: "list" });
  const filters = h("div", { class: "filters" });

  const draw = async () => {
    filters.replaceChildren(...[["", "All"], ...RECORD_TYPES.map((t) => [t, TYPE_LABEL[t]])].map(([v, t]) =>
      h("button", { class: "filter", "aria-pressed": memState.type === v ? "true" : "false", onclick: () => { memState.type = v; void draw(); } }, t)));
    const recs = await call("records", { type: memState.type || undefined, query: memState.query || undefined, limit: 200 });
    listEl.replaceChildren(...(recs.length ? recs.map(recordCard) : [h("div", { class: "card empty" }, memState.query ? "Nothing matches that." : "Nothing here yet.")]));
  };
  let t;
  search.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { memState.query = search.value.trim(); void draw(); }, 200); });

  c.append(h("div", { class: "row" }, h("div", { class: "grow" }, search), h("button", { class: "btn primary", onclick: () => addDialog(draw) }, "Add a memory")), filters, listEl);
  await draw();
}

function recordCard(r) {
  const del = h("button", { class: "btn danger small" }, "Forget");
  let armed = false;
  del.addEventListener("click", async () => {
    if (!armed) { armed = true; del.textContent = "Really forget?"; setTimeout(() => { armed = false; del.textContent = "Forget"; }, 3500); return; }
    try {
      await call("remove_record", { id: r.id });
      say("Forgotten.", "think");
      del.closest("article").remove();
      await refreshStats();
    } catch (e) { say(e.message, "worried"); }
  });
  return h("article", { class: "card" },
    h("div", { class: "head" },
      h("span", { class: "badge type" }, TYPE_LABEL[r.type] || r.type),
      r.sensitivity !== "personal" ? h("span", { class: `badge ${r.sensitivity === "secret" ? "secret" : ""}` }, r.sensitivity) : null,
      h("span", { class: "muted small" }, when(r.updatedAt))),
    h("p", { class: "body" }, recordTitle(r)),
    r.tags?.length ? h("div", { class: "row wrap" }, r.tags.map((t) => h("span", { class: "tag" }, t))) : null,
    h("div", { class: "actions" }, del));
}

function addDialog(onDone) {
  const dlg = h("dialog", {});
  const type = h("select", {}, ["memory", "profile", "person", "event"].map((t) => h("option", { value: t }, TYPE_LABEL[t])));
  const fields = h("div", { class: "grow" });
  const inputs = {};
  const layouts = {
    memory: [["text", "What should I remember?", "area"]],
    profile: [["key", "Fact (e.g. Name)"], ["value", "Value"]],
    person: [["name", "Name"], ["relation", "Relation (optional)"]],
    event: [["title", "What's happening?"], ["date", "When (optional)"]],
  };
  const drawFields = () => {
    fields.replaceChildren();
    for (const k of Object.keys(inputs)) delete inputs[k];
    for (const [key, label, kind] of layouts[type.value]) {
      const input = kind === "area" ? h("textarea", { required: true }) : h("input", { type: "text", required: !label.includes("optional") });
      inputs[key] = input;
      fields.append(h("label", { class: "field" }, h("span", {}, label), input));
    }
  };
  type.addEventListener("change", drawFields);
  drawFields();
  const tags = h("input", { type: "text", placeholder: "e.g. work, travel" });
  const lvl = h("select", {}, [["personal", "Everyday"], ["public", "Public"], ["private", "Private"], ["secret", "Secret (never shared, hidden here)"]].map(([v, t]) => h("option", { value: v }, t)));
  const error = h("p", { class: "error", role: "alert" });
  dlg.append(h("form", { method: "dialog", class: "dialog-body", onsubmit: async (e) => {
    e.preventDefault();
    const data = {};
    for (const [k, i] of Object.entries(inputs)) if (i.value.trim()) data[k] = i.value.trim();
    try {
      await call("add_record", { type: type.value, data, tags: tags.value.split(",").map((s) => s.trim()).filter(Boolean), sensitivity: lvl.value });
      dlg.close();
      say("Got it. I'll remember that.", "cheer");
      await refreshStats();
      await onDone();
    } catch (err) { error.textContent = err.message; }
  } },
  h("h2", {}, "Add a memory"),
  h("label", { class: "field" }, h("span", {}, "Kind"), type),
  fields,
  h("label", { class: "field" }, h("span", {}, "Tags ", h("span", { class: "field-hint" }, "(optional, comma separated)")), tags),
  h("label", { class: "field" }, h("span", {}, "How private is it?"), lvl),
  error,
  h("div", { class: "dialog-actions" },
    h("button", { class: "btn", type: "button", onclick: () => dlg.close() }, "Cancel"),
    h("button", { class: "btn primary", type: "submit" }, "Save"))));
  dlg.addEventListener("close", () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}

// ---------- Activity ----------

function sentence(e) {
  const isAi = e.actor.startsWith("passport:");
  const who = isAi ? (ui.labels.get(e.actor) || "An AI") : e.actor === "owner" ? "You" : e.actor === "unknown" ? "Someone" : e.actor;
  const n = Number(e.detail);
  const found = Number.isFinite(n) ? ` (${plural(n, "result", "results")})` : "";
  const map = {
    "scoped.search": `searched your vault${found}`,
    "scoped.list": `browsed your vault${found}`,
    "scoped.get": e.detail === "denied" ? "asked for a record it isn't allowed to see" : "opened a record",
    "record.add": isAi ? "suggested something to remember" : `saved a ${e.detail || "record"}`,
    "record.approve": "approved a suggestion",
    "record.remove": "forgot a record",
    "passport.create": `connected ${e.detail || "an AI"}`,
    "passport.revoke": `revoked access for ${e.detail || "an AI"}`,
    "passport.auth_failed": "tried to connect with a bad or revoked key, and was refused",
    "vault.unlock": "unlocked the vault",
    "vault.lock": "locked the vault",
    "vault.create": "created the vault",
    "records.export": "exported records",
    "records.import": "imported records",
  };
  return { who, text: map[e.action] || e.action, refused: e.action === "passport.auth_failed" || e.detail === "denied" };
}

async function activity() {
  say("Here's everything that's happened, newest first. Every AI request is on this list.", "happy");
  const log = await call("audit", { limit: 120 });
  ui.contentEl.append(h("h2", { class: "section-title" }, "Recent activity"),
    h("ul", { class: "log" }, log.map((e) => {
      const s = sentence(e);
      return h("li", {}, h("time", {}, when(e.ts)), h("span", { class: s.refused ? "refused" : "" }, h("span", { class: "who" }, s.who), " ", s.text));
    })));
}

// ---------- boot & polling ----------

function startPolling() {
  stopPolling();
  statusTimer = setInterval(async () => {
    try {
      const s = await call("status");
      if (s.locked) locked("I locked up after a while to keep things safe.");
    } catch { /* transient */ }
  }, 5000);
}
function stopPolling() { if (statusTimer) clearInterval(statusTimer); statusTimer = null; }

async function boot() {
  try {
    const s = await call("status");
    if (!s.exists) return onboarding();
    if (s.locked) return locked();
    return await shell();
  } catch (e) {
    fatal(e.message);
  }
}

if (!window.mycore) await import("./mock.js");
await boot();
