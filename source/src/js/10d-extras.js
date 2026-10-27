/* ===================== doublons ===================== */
const LOSSLESS = new Set(["FLAC", "WAV", "ALAC", "AIFF", "AIF"]);
const Dupes = {
  quality(t) { return (LOSSLESS.has((t.codec || "").toUpperCase()) ? 1e7 : 0) + (t.bitrate || 0) * 1000 + (t.size || 0) / 1e4; },
  find() {
    const m = new Map();
    for (const t of L.tracks.values()) {
      if (t.demo || !t.title) continue;
      const k = fpOf(t) + "|" + Math.round((t.duration || 0) / 4);
      if (!m.has(k)) m.set(k, []); m.get(k).push(t.id);
    }
    return [...m.values()].filter((ids) => ids.length > 1).map((ids) => ids.sort((a, b) => this.quality(L.tracks.get(b)) - this.quality(L.tracks.get(a))));
  },
  /* masque les doublons : écoutes, likes et playlists passent sur la version gardée */
  merge(keep, drop) {
    const k = (L.stats[keep] ||= { p: 0, l: 0, ms: 0 });
    for (const id of drop) {
      const s = L.stats[id]; if (s) { k.p += s.p || 0; k.ms += s.ms || 0; k.l = Math.max(k.l || 0, s.l || 0); delete L.stats[id]; }
      if (L.likes.has(id)) { L.likes.delete(id); L.likes.add(keep); }
      for (const p of L.playlists) p.ids = [...new Set(p.ids.map((x) => (x === id ? keep : x)))];
      for (const h of L.history) if (h[0] === id) h[0] = keep;
      Q.manual = Q.manual.map((x) => (x === id ? keep : x));
      L.hidden.add(id); L.tracks.delete(id); L.files.delete(id); DB.del("tracks", id);
    }
  },
  async apply(choices, trash) {
    let n = 0; const paths = [];
    for (const { keep, drop } of choices) { if (trash) for (const id of drop) { const f = L.files.get(id); if (f && f.abs) paths.push(f.abs); } this.merge(keep, drop); n += drop.length; }
    DB.put("kv", "hidden", [...L.hidden]); DB.put("kv", "likes", [...L.likes]); savePlaylists(); saveStats(); DB.put("kv", "history", L.history);
    if (trash && paths.length && NATIVE_WIN && NATIVE_WIN.trash) { try { await NATIVE_WIN.trash(paths); } catch { /* ancienne version */ } }
    rebuildIndex(); An.cache = null; UI.onLibraryChanged(); if (NP && NP.ok) NP.exportSoon();
    toast(trash ? `${plural(n, "doublon mis", "doublons mis")} à la corbeille de Windows.` : `${plural(n, "doublon masqué", "doublons masqués")}. Les fichiers sont toujours là (Réglages pour les réafficher).`, { ms: 6000 });
  },
  restore() {
    const n = L.hidden.size; L.hidden.clear(); DB.put("kv", "hidden", []); closeSheet();
    toast(`${plural(n, "titre réaffiché", "titres réaffichés")} : ils reviennent à la prochaine recherche de musique.`);
    if (NATIVE_WIN) nativeScan({ quiet: true }); else if (AndroidMusic) AndroidMusic.scan({ quiet: true });
  },
  open() {
    const groups = this.find();
    const info = (t) => [t.codec, t.bitrate ? t.bitrate + " kbps" : "", t.size ? fmtBytes(t.size) : "", dirOf(t.path || "")].filter(Boolean).join(" · ");
    openSheet(html`<div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><h2>Titres en double</h2><button class="icon-btn" data-act="close-sheet" aria-label="Fermer">${icon("x")}</button></div>
${groups.length ? html`<p class="dup-intro">${plural(groups.length, "titre existe", "titres existent")} en plusieurs exemplaires. aurore garde la meilleure qualité (choix modifiable) ; écoutes, likes et playlists passent sur la version gardée.</p>
<form id="dup-form" class="dups">${groups.map((ids, g) => { const t0 = L.tracks.get(ids[0]); return html`<fieldset class="dup"><legend><b>${t0.title}</b><span>${t0.artist}</span></legend>${ids.map((id, i) => { const t = L.tracks.get(id); return html`<label class="dup-v"><input type="radio" name="g${g}" value="${id}" ${raw(i === 0 ? "checked" : "")}><span><b>${i === 0 ? "Meilleure qualité" : "Autre version"}</b><small>${info(t)}</small></span></label>`; })}</fieldset>`; })}</form>
<div class="dup-actions"><button class="btn primary" data-act="dup-hide">${icon("check", "sm")} Masquer les doublons</button>${NATIVE_WIN && NATIVE_WIN.trash ? html`<button class="btn danger" data-act="dup-trash">${icon("trash", "sm")} Mettre à la corbeille</button>` : ""}</div>`
    : html`<div class="empty" style="padding:24px 0"><div class="big-ic">${icon("check", "lg")}</div><h2>Aucun doublon</h2><p>Chaque titre n'est qu'une fois dans ta bibliothèque.</p></div>`}
${L.hidden.size ? html`<p class="lan-note" style="margin-top:14px">${icon("info", "sm")}<span>${plural(L.hidden.size, "titre masqué", "titres masqués")} auparavant. <button class="link" data-act="dup-restore">Tout réafficher</button></span></p>` : ""}`);
    this.groups = groups;
  },
  chosen() {
    const f = $("#dup-form"); if (!f) return [];
    return this.groups.map((ids, g) => { const keep = new FormData(f).get("g" + g) || ids[0]; return { keep, drop: ids.filter((x) => x !== keep) }; });
  },
};

/* ===================== playlists intelligentes ===================== */
const SMART_FIELDS = [
  ["mood", "Humeur"], ["added", "Ajouté il y a moins de"], ["plays", "Nombre d'écoutes"], ["never", "Jamais écouté"], ["liked", "Liké"],
  ["duration", "Durée (minutes)"], ["artist", "Artiste contient"], ["genre", "Genre contient"], ["year", "Année"], ["bpm", "Tempo (BPM)"],
];
const Smart = {
  /* même ordre aléatoire toute la journée */
  seeded(ids, seed) { let h = 2166136261; for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619); const r = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296; const a = ids.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
  test(t, r, moods) {
    const num = (x) => (r.op === "<" ? x < +r.v : x > +r.v);
    switch (r.f) {
      case "mood": return (moods[r.v] || new Set()).has(t.id);
      case "added": return (t.addedAt || 0) > Date.now() - (+r.v || 30) * 864e5;
      case "plays": return num(playsOf(t.id));
      case "never": return !playsOf(t.id);
      case "liked": return L.likes.has(t.id);
      case "duration": return num((t.duration || 0) / 60);
      case "artist": return norm(t.artist || "").includes(norm(r.v || ""));
      case "genre": return norm(t.genre || "").includes(norm(r.v || ""));
      case "year": return t.year ? num(t.year) : false;
      case "bpm": return t.an && t.an.bpm ? num(t.an.bpm) : false;
    }
    return true;
  },
  eval(s, seed = "") {
    const mo = An.moods(), moods = Object.fromEntries(Object.entries(mo).map(([k, v]) => [k, new Set(v)]));
    const rules = (s.rules || []).filter((r) => r && r.f);
    let ids = L.sorted.tracks.filter((id) => { const t = L.tracks.get(id); if (!t || t.demo) return false; if (!rules.length) return true; return s.match === "any" ? rules.some((r) => this.test(t, r, moods)) : rules.every((r) => this.test(t, r, moods)); });
    if (s.sort === "plays") ids.sort((a, b) => playsOf(b) - playsOf(a));
    else if (s.sort === "recent") ids.sort((a, b) => (L.tracks.get(b).addedAt || 0) - (L.tracks.get(a).addedAt || 0));
    else if (s.sort === "random") ids = this.seeded(ids, seed + dayKey());
    return s.limit ? ids.slice(0, +s.limit) : ids;
  },
  draft: null,
  open(id) {
    const p = id && L.playlists.find((x) => x.id === id);
    this.draft = p ? { id, name: p.name, ...JSON.parse(JSON.stringify(p.smart)) } : { id: null, name: "Ma playlist intelligente", rules: [{ f: "mood", v: "energique" }, { f: "added", v: 60 }], match: "all", limit: 50, sort: "random" };
    this.render();
  },
  render() {
    const d = this.draft, n = this.eval(d, d.id || "draft").length;
    const valueHTML = (r, i) => {
      if (r.f === "mood") return html`<select data-i="${i}" data-k="v">${HUMEURS.map((m) => html`<option value="${m.k}" ${raw(r.v === m.k ? "selected" : "")}>${m.name}</option>`)}</select>`;
      if (r.f === "never" || r.f === "liked") return html`<span class="sm-yes">oui</span>`;
      if (r.f === "artist" || r.f === "genre") return html`<input data-i="${i}" data-k="v" value="${r.v || ""}" placeholder="${r.f === "artist" ? "ex. Angèle" : "ex. rap"}">`;
      if (r.f === "added") return html`<span class="sm-num"><input type="number" min="1" data-i="${i}" data-k="v" value="${r.v || 30}"> jours</span>`;
      return html`<span class="sm-num"><select data-i="${i}" data-k="op"><option value=">" ${raw(r.op !== "<" ? "selected" : "")}>plus de</option><option value="<" ${raw(r.op === "<" ? "selected" : "")}>moins de</option></select><input type="number" min="0" data-i="${i}" data-k="v" value="${r.v ?? ""}"></span>`;
    };
    openSheet(html`<div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><h2>${d.id ? "Modifier les règles" : "Playlist intelligente"}</h2><button class="icon-btn" data-act="close-sheet" aria-label="Fermer">${icon("x")}</button></div>
<div class="smart" id="smart">
  <p class="dup-intro">Elle se remplit toute seule selon tes règles, et se met à jour quand tu ajoutes de la musique ou que tu écoutes.</p>
  <label class="field"><span>Nom</span><input data-k="name" value="${d.name}" maxlength="80"></label>
  <div class="sm-match"><span>Garder les titres qui respectent</span><div class="seg" role="radiogroup"><button data-act="sm-match" data-v="all" aria-pressed="${String(d.match !== "any")}">toutes les règles</button><button data-act="sm-match" data-v="any" aria-pressed="${String(d.match === "any")}">au moins une</button></div></div>
  <div class="sm-rules">${d.rules.map((r, i) => html`<div class="sm-rule"><select data-i="${i}" data-k="f">${SMART_FIELDS.map(([k, l]) => html`<option value="${k}" ${raw(r.f === k ? "selected" : "")}>${l}</option>`)}</select>${valueHTML(r, i)}<button class="icon-btn" data-act="sm-del" data-i="${i}" aria-label="Retirer la règle">${icon("x", "sm")}</button></div>`)}</div>
  <button class="btn sm" data-act="sm-add">${icon("plus", "sm")} Ajouter une règle</button>
  <div class="field-row"><label class="field"><span>Ordre</span><select data-k="sort"><option value="random" ${raw(d.sort === "random" ? "selected" : "")}>Mélangé (change chaque jour)</option><option value="plays" ${raw(d.sort === "plays" ? "selected" : "")}>Les plus écoutés d'abord</option><option value="recent" ${raw(d.sort === "recent" ? "selected" : "")}>Ajoutés récemment d'abord</option><option value="title" ${raw(d.sort === "title" ? "selected" : "")}>Par artiste</option></select></label><label class="field"><span>Maximum</span><input type="number" min="0" data-k="limit" value="${d.limit || ""}" placeholder="Pas de limite"></label></div>
  <div class="edit-actions"><span class="sm-count" aria-live="polite"><b>${n}</b> ${n > 1 ? "titres" : "titre"} pour l'instant</span><button class="btn primary" data-act="sm-save">${d.id ? "Enregistrer" : "Créer la playlist"}</button></div>
</div>`);
    for (const el of $$("#smart [data-k]")) el.addEventListener(el.tagName === "SELECT" ? "change" : "input", () => {
      const k = el.dataset.k, i = el.dataset.i;
      if (i != null) { const r = d.rules[+i]; r[k] = el.value; if (k === "f") { r.v = { mood: "calme", added: 30, plays: 5, duration: 4, year: 2020, bpm: 120 }[el.value] ?? ""; r.op = ">"; return this.render(); } }
      else d[k] = el.value;
      const c = $("#smart .sm-count"); if (c) { const m = this.eval(d, d.id || "draft").length; setHTML(c, html`<b>${m}</b> ${m > 1 ? "titres" : "titre"} pour l'instant`); }
    });
  },
  save() {
    const d = this.draft, smart = { rules: d.rules, match: d.match, limit: +d.limit || 0, sort: d.sort };
    let p = d.id && L.playlists.find((x) => x.id === d.id);
    if (p) { p.name = d.name || p.name; p.smart = smart; }
    else { p = { id: "p" + Date.now().toString(36), name: d.name || "Playlist intelligente", ids: [], smart, created: Date.now() }; L.playlists.push(p); }
    savePlaylists(); closeSheet(); UI.renderNav(); UI.go("list", p.id); if (NP && NP.ok) NP.exportSoon();
    toast("Playlist intelligente prête : elle se met à jour toute seule.");
  },
};

/* ===================== boucle A-B ===================== */
const AB = {
  a: null, b: null, id: null, timer: null,
  press() {
    if (!Player.id) return;
    const t = Player.currentTime;
    if (this.a == null || this.id !== Player.id) { this.clear(true); this.a = t; this.id = Player.id; toast("Point A posé. Touche encore A-B à la fin du passage."); }
    else if (this.b == null) { if (t < this.a + .5) return toast("Le point B doit être après le point A."); this.b = t; toast(`Boucle de ${fmtTime(this.a)} à ${fmtTime(this.b)}. Touche A-B pour l'arrêter.`); this.start(); }
    else { this.clear(); toast("Boucle arrêtée."); }
    this.sync();
  },
  start() {
    clearInterval(this.timer);
    if (Player.mode === "native") { NP.call("pab", { a: Math.round(this.a * 1000), b: Math.round(this.b * 1000) }).catch(() => {}); return; }
    this.timer = setInterval(() => { if (this.b == null || Player.id !== this.id) return this.clear(); if (Player.currentTime >= this.b || Player.currentTime < this.a - 1) Player.seek(this.a); }, 60);
  },
  clear(silent) {
    clearInterval(this.timer); this.timer = null;
    if (this.b != null && NP && NP.ok) NP.call("pab", { a: -1, b: -1 }).catch(() => {});
    this.a = this.b = null; this.id = null; if (!silent) this.sync();
  },
  sync() {
    const d = Player.duration || 0;
    for (const b of $$(".js-ab")) { b.classList.toggle("on", this.a != null); b.textContent = this.b != null ? "A-B ✓" : this.a != null ? "A…" : "A-B"; b.setAttribute("aria-pressed", String(this.b != null)); }
    for (const s of $$(".d-seek")) {
      if (this.a == null || !d) { s.style.removeProperty("--ab-a"); s.style.removeProperty("--ab-b"); s.classList.remove("ab"); continue; }
      s.classList.add("ab"); s.style.setProperty("--ab-a", (this.a / d * 100) + "%"); s.style.setProperty("--ab-b", ((this.b ?? this.a) / d * 100) + "%");
    }
  },
};

/* ===================== sauvegarde ===================== */
const Backup = {
  async build() {
    const fpOfId = (id) => { const t = L.tracks.get(id); return t ? fpOf(t) : null; };
    const stats = {}; for (const [id, s] of Object.entries(L.stats)) { const fp = fpOfId(id); if (fp) stats[fp] = s; }
    const keys = new Set([...L.playlists.map((p) => p.artKey), ...Object.values(L.edits || {}).map((e) => e.artKey)].filter(Boolean));
    const art = {};
    for (const k of keys) { const a = L.art.get(k); if (a && a.big) art[k] = { big: await blobB64(a.big), small: a.small ? await blobB64(a.small) : "", type: a.big.type || "image/webp", colors: a.colors || null }; }
    return {
      app: "aurore", kind: "sauvegarde", v: 1, at: Date.now(), from: IS_MOBILE ? "téléphone" : "PC",
      playlists: L.playlists.map((p) => ({ id: p.id, name: p.name, fps: p.smart ? [] : Sync.playlistFps(p), smart: p.smart || null, artKey: p.artKey || "", created: p.created || 0, updated: p.updated || 0 })),
      likes: [...L.likes].map(fpOfId).filter(Boolean), stats, days: L.days,
      history: L.history.slice(-20000).map(([id, ts]) => [fpOfId(id), ts]).filter((h) => h[0]),
      edits: L.edits || {}, hidden: [...(L.hidden || [])], art,
      settings: { theme: Theme.bg, accent: Theme.accent, eq: Fx.eq, eqOn: Fx.eqOn, eqPreset: Fx.preset, norm: Fx.norm, viz: Viz.mode, calm: Viz.calm },
    };
  },
  name() { return `aurore-sauvegarde-${dayKey()}.json`; },
  async export() {
    toast("Préparation de la sauvegarde…", { ms: 2000 });
    const data = await this.build(), json = JSON.stringify(data);
    const n = `${plural(data.playlists.length, "playlist", "playlists")}, ${plural(data.likes.length, "like", "likes")}, ${plural(Object.keys(data.stats).length, "titre écouté", "titres écoutés")}`;
    if (AndroidMusic) {
      try { await AndroidMusic.call("saveFile", { name: this.name(), mime: "application/json", data: btoa(unescape(encodeURIComponent(json))) }); toast(`Sauvegarde enregistrée dans Téléchargements (${n}).`, { ms: 7000 }); return; }
      catch { /* ancienne version : téléchargement classique */ }
    }
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([json], { type: "application/json" })); a.download = this.name(); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(`Sauvegarde prête : ${n}.`, { ms: 6000 });
  },
  pick() { const i = document.createElement("input"); i.type = "file"; i.accept = ".json,application/json"; i.onchange = () => i.files[0] && this.import(i.files[0]); i.click(); },
  async import(file) {
    let d; try { d = JSON.parse(await file.text()); } catch { return toast("Ce fichier n'est pas une sauvegarde d'aurore."); }
    if (!d || d.app !== "aurore" || d.kind !== "sauvegarde") return toast("Ce fichier n'est pas une sauvegarde d'aurore.");
    const idx = fpIndex(), ids = (fp) => idx.get(fp) || [];
    let pl = 0, lk = 0, st = 0;
    for (const [k, a] of Object.entries(d.art || {})) { if (L.art.has(k)) continue; try { const dec = (b64) => new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: a.type }); const art = { big: dec(a.big), small: a.small ? dec(a.small) : dec(a.big), colors: a.colors }; L.art.set(k, art); DB.put("art", k, art); } catch { /* image abîmée */ } }
    for (const p of d.playlists || []) {
      const cur = L.playlists.find((x) => x.id === p.id);
      const np = { id: p.id, name: p.name, ids: p.smart ? [] : p.fps.flatMap((fp) => ids(fp).slice(0, 1)), fps: p.fps, smart: p.smart || undefined, artKey: p.artKey || undefined, created: p.created, updated: p.updated };
      if (!cur) { L.playlists.push(np); pl++; } else if ((p.updated || 0) > (cur.updated || 0)) { Object.assign(cur, np); pl++; }
    }
    for (const fp of d.likes || []) for (const id of ids(fp).slice(0, 1)) if (!L.likes.has(id)) { L.likes.add(id); lk++; }
    for (const [fp, s] of Object.entries(d.stats || {})) { const id = ids(fp)[0]; if (!id) continue; const c = (L.stats[id] ||= { p: 0, l: 0, ms: 0 }); if ((s.p || 0) > (c.p || 0)) { c.p = s.p; st++; } c.ms = Math.max(c.ms || 0, s.ms || 0); c.l = Math.max(c.l || 0, s.l || 0); }
    for (const [k, v] of Object.entries(d.days || {})) L.days[k] = Math.max(L.days[k] || 0, v);
    const seen = new Set(L.history.map((h) => h[1])); for (const [fp, ts] of d.history || []) { const id = ids(fp)[0]; if (id && !seen.has(ts)) L.history.push([id, ts]); } L.history.sort((a, b) => a[1] - b[1]);
    for (const [id, e] of Object.entries(d.edits || {})) if (!L.edits[id]) { L.edits[id] = e; const t = L.tracks.get(id); if (t) { Edit.applyTo(t); DB.put("tracks", t.id, t); } }
    const s = d.settings || {}; if (s.theme) Theme.set(s.theme, s.accent); if (s.eq) { Fx.eqOn = !!s.eqOn; store.set("eqOn", Fx.eqOn); Fx.set(s.eq, s.eqPreset); } if (s.norm != null) Fx.setNorm(s.norm);
    savePlaylists(); DB.put("kv", "likes", [...L.likes]); saveStats(); DB.put("kv", "history", L.history); DB.put("kv", "edits", L.edits);
    rebuildIndex(); UI.onLibraryChanged(); UI.renderNav(); closeSheet();
    toast(`Sauvegarde du ${new Date(d.at).toLocaleDateString("fr-FR")} restaurée : ${plural(pl, "playlist", "playlists")}, ${plural(lk, "like", "likes")}, ${plural(st, "statistique", "statistiques")}.`, { ms: 8000 });
  },
};

/* ===================== carte « J'écoute » (image à partager) ===================== */
const Card = {
  W: 1080, H: 1920,
  canvas() { const c = document.createElement("canvas"); c.width = this.W; c.height = this.H; return c; }, // vrai canvas : toBlob et toDataURL
  async img(url) { if (!url) return null; return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url; }); },
  wrap(g, text, max, lines) { const words = String(text).split(/\s+/); const out = []; let cur = ""; for (const w of words) { const t = cur ? cur + " " + w : w; if (g.measureText(t).width > max && cur) { out.push(cur); cur = w; } else cur = t; } if (cur) out.push(cur); if (out.length > lines) { out.length = lines; out[lines - 1] = out[lines - 1].replace(/.{0,2}$/, "") + "…"; } return out; },
  bg(g, cover, pal) {
    const { W, H } = this;
    g.fillStyle = "#07070d"; g.fillRect(0, 0, W, H);
    if (cover) { g.save(); g.filter = "blur(70px) saturate(1.4)"; g.globalAlpha = .55; g.drawImage(cover, -300, -200, H + 200, H + 200); g.restore(); }
    for (const [c, x, y, r] of [[pal.c1, .15, .12, .7], [pal.c2, .9, .55, .6], [pal.c3, .25, .95, .65]]) { const gr = g.createRadialGradient(x * W, y * H, 0, x * W, y * H, r * W); gr.addColorStop(0, c); gr.addColorStop(1, "transparent"); g.globalAlpha = .35; g.fillStyle = gr; g.fillRect(0, 0, W, H); }
    g.globalAlpha = 1; const sh = g.createLinearGradient(0, 0, 0, H); sh.addColorStop(0, "rgba(7,7,13,.15)"); sh.addColorStop(1, "rgba(7,7,13,.75)"); g.fillStyle = sh; g.fillRect(0, 0, W, H);
  },
  logo(g, y) {
    const { W } = this; const cols = ["#a08cff", "#7fb0f0", "#5fd0d8", "#3fe0c5"], hs = [26, 40, 32, 48];
    g.font = "700 40px Unbounded, Figtree, sans-serif"; const tw = g.measureText("aurore").width, x0 = W / 2 - (tw + 70) / 2;
    hs.forEach((h, i) => { g.fillStyle = cols[i]; g.beginPath(); g.roundRect ? g.roundRect(x0 + i * 14, y - h, 9, h, 4.5) : g.rect(x0 + i * 14, y - h, 9, h); g.fill(); });
    g.fillStyle = "#f4f2ff"; g.textAlign = "left"; g.fillText("aurore", x0 + 70, y);
  },
  async render(id) {
    const t = L.tracks.get(id); if (!t) return null;
    const cv = this.canvas(), g = cv.getContext("2d"), { W, H } = this, pal = Theme.palette(palOf(t.artKey));
    const cover = await this.img(artBig(t.artKey));
    this.bg(g, cover, pal);
    g.textAlign = "center"; g.fillStyle = "rgba(244,242,255,.75)"; g.font = "700 34px Figtree, sans-serif"; g.fillText("J'ÉCOUTE", W / 2, 230);
    const S = 760, x = (W - S) / 2, y = 330;
    g.save(); g.shadowColor = "rgba(0,0,0,.6)"; g.shadowBlur = 90; g.shadowOffsetY = 40; g.fillStyle = "#15142a"; g.beginPath(); g.roundRect ? g.roundRect(x, y, S, S, 56) : g.rect(x, y, S, S); g.fill(); g.restore();
    g.save(); g.beginPath(); g.roundRect ? g.roundRect(x, y, S, S, 56) : g.rect(x, y, S, S); g.clip();
    if (cover) { const s = Math.max(S / cover.width, S / cover.height); g.drawImage(cover, x + (S - cover.width * s) / 2, y + (S - cover.height * s) / 2, cover.width * s, cover.height * s); }
    else { const gr = g.createLinearGradient(x, y, x + S, y + S); gr.addColorStop(0, pal.c1); gr.addColorStop(1, pal.c2); g.fillStyle = gr; g.fillRect(x, y, S, S); }
    g.restore();
    g.fillStyle = "#ffffff"; g.font = "800 76px Unbounded, Figtree, sans-serif";
    const lines = this.wrap(g, t.title, W - 140, 2); lines.forEach((l, i) => g.fillText(l, W / 2, 1230 + i * 92));
    g.fillStyle = "rgba(244,242,255,.8)"; g.font = "500 44px Figtree, sans-serif"; g.fillText(this.wrap(g, t.artist + (t.album ? " · " + t.album : ""), W - 160, 1)[0], W / 2, 1230 + lines.length * 92 + 20);
    const n = 48, bw = 12, gap = 8, total = n * (bw + gap) - gap, bx = (W - total) / 2, by = 1690;
    const gr = g.createLinearGradient(bx, 0, bx + total, 0); gr.addColorStop(0, pal.c1); gr.addColorStop(.5, pal.c2); gr.addColorStop(1, pal.c3); g.fillStyle = gr;
    for (let i = 0; i < n; i++) { const v = Player.playing ? Math.max(.06, Viz.sample(Viz.bands, (i + .5) / n * .85)) : Viz.sample(Viz.idleShape, i / (n - 1)); const h = 16 + v * 150; g.beginPath(); g.roundRect ? g.roundRect(bx + i * (bw + gap), by - h, bw, h, 6) : g.rect(bx + i * (bw + gap), by - h, bw, h); g.fill(); }
    this.logo(g, 1830);
    return cv;
  },
  async open(id = Player.id || Q.current) {
    if (!id) return toast("Lance un titre pour créer ta carte.");
    await document.fonts?.ready;
    const cv = await this.render(id); if (!cv) return;
    this.last = { cv, name: `aurore-${(L.tracks.get(id).title || "titre").replace(/[^\w\-À-ÿ]+/g, "-").slice(0, 40)}.png`, text: `J'écoute « ${L.tracks.get(id).title} » de ${L.tracks.get(id).artist} sur aurore` };
    this.preview();
  },
  preview() {
    const { cv } = this.last; const url = cv.toDataURL("image/jpeg", .85);
    const canShare = !!AndroidMusic || (navigator.canShare && navigator.share);
    openSheet(html`<div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><h2>Ta carte</h2><button class="icon-btn" data-act="close-sheet" aria-label="Fermer">${icon("x")}</button></div>
<div class="card-prev"><img src="${url}" alt="Aperçu de la carte à partager"></div>
<div class="dup-actions">${canShare ? html`<button class="btn primary" data-act="card-share">${icon("send", "sm")} Partager</button>` : ""}${!AndroidMusic && navigator.clipboard && window.ClipboardItem ? html`<button class="btn${canShare ? "" : " primary"}" data-act="card-copy">${icon("image", "sm")} Copier l'image</button>` : ""}<button class="btn" data-act="card-save">${icon("download", "sm")} Enregistrer</button></div>
<p class="lan-note">${icon("info", "sm")}<span>Format story (1080 × 1920), parfait pour Instagram ou Snapchat.</span></p>`);
  },
  blob() { return new Promise((res) => this.last.cv.toBlob(res, "image/png")); },
  async share() {
    const b = await this.blob();
    if (AndroidMusic) { try { await AndroidMusic.call("shareFile", { name: this.last.name, mime: "image/png", data: await blobB64(b), text: this.last.text }); return; } catch { /* ancienne version */ } }
    const f = new File([b], this.last.name, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], text: this.last.text }); } catch { /* annulé */ } } else this.save();
  },
  async copy() { try { await navigator.clipboard.write([new ClipboardItem({ "image/png": await this.blob() })]); toast("Image copiée : colle-la où tu veux (Ctrl+V)."); } catch { this.save(); } },
  async save() {
    const b = await this.blob();
    if (AndroidMusic) { try { await AndroidMusic.call("saveFile", { name: this.last.name, mime: "image/png", data: await blobB64(b), images: true }); toast("Image enregistrée dans ta galerie (Images › aurore)."); return; } catch { /* ancienne version */ } }
    const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = this.last.name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  },
};

/* ===================== récap façon Wrapped ===================== */
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const Recap = {
  period: "month", i: 0, slides: [], timer: null, paused: false,
  range(p) {
    const now = new Date();
    if (p === "month") return { from: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), to: Date.now() + 1, label: `${MONTHS[now.getMonth()]} ${now.getFullYear()}`, de: `d'${/^[aeiouéè]/.test(MONTHS[now.getMonth()]) ? "" : ""}${MONTHS[now.getMonth()]}` };
    if (p === "year") return { from: new Date(now.getFullYear(), 0, 1).getTime(), to: Date.now() + 1, label: String(now.getFullYear()), de: `de ${now.getFullYear()}` };
    return { from: 0, to: Date.now() + 1, label: "depuis le début", de: "depuis le début" };
  },
  data(p) {
    const r = this.range(p), plays = L.history.filter(([id, ts]) => ts >= r.from && ts < r.to && L.tracks.has(id) && !L.tracks.get(id).demo);
    let sec = 0; for (const [k, v] of Object.entries(L.days)) { const d = new Date(k + "T12:00").getTime(); if (d >= r.from - 864e5 && d < r.to) sec += v; }
    const count = (keyOf) => { const m = new Map(); for (const [id] of plays) for (const k of [].concat(keyOf(L.tracks.get(id)))) if (k) m.set(k, (m.get(k) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
    const artists = count((t) => t.artists.map((a) => norm(a))), tracks = count((t) => t.id), albums = count((t) => t.albumKey);
    const hours = new Array(24).fill(0); for (const [, ts] of plays) hours[new Date(ts).getHours()]++;
    const parts = [["la nuit", [0, 1, 2, 3, 4, 5]], ["le matin", [6, 7, 8, 9, 10, 11]], ["l'après-midi", [12, 13, 14, 15, 16, 17]], ["le soir", [18, 19, 20, 21, 22, 23]]].map(([n, hs]) => [n, hs.reduce((s, h) => s + hours[h], 0)]).sort((a, b) => b[1] - a[1]);
    const mo = An.moods(), moodCount = HUMEURS.map((m) => { const s = new Set(mo[m.k]); return [m, plays.filter(([id]) => s.has(id)).length]; }).sort((a, b) => b[1] - a[1]);
    const first = new Map(); for (const [id, ts] of L.history) if (!first.has(id)) first.set(id, ts);
    const discovered = [...new Set(plays.map(([id]) => id))].filter((id) => first.get(id) >= r.from);
    const dayset = new Set(plays.map(([, ts]) => dayKey(new Date(ts)))); let streak = 0, best = 0; const d0 = new Date(Math.max(r.from, plays.length ? plays[0][1] : r.from)); d0.setHours(12);
    for (let d = new Date(d0); d.getTime() < r.to; d.setDate(d.getDate() + 1)) { if (dayset.has(dayKey(d))) { streak++; best = Math.max(best, streak); } else streak = 0; }
    /* temps d'écoute : compteur par jour, sinon estimé avec la durée des titres écoutés */
    const est = plays.reduce((n, [id]) => n + Math.min(L.tracks.get(id).duration || 0, 600) * .85, 0); if (sec < est * .5) sec = est;
    return { r, plays: plays.length, minutes: Math.round(sec / 60), artists, tracks, albums, part: parts[0], mood: moodCount[0] && moodCount[0][1] ? moodCount[0][0] : null, discovered: discovered.length, days: dayset.size, best, distinctArtists: artists.length };
  },
  available() { return L.history.some(([id, ts]) => ts >= this.range("month").from && L.tracks.has(id)); },
  build() {
    const d = this.data(this.period); this.d = d;
    const A = (k) => L.artists.get(k), T = (id) => L.tracks.get(id), Al = (k) => L.albums.get(k);
    const s = [];
    s.push({ cls: "rc-intro", c: ["#8b5cff", "#3fe0c5"], body: html`<small>Ton récap</small><h2>${d.r.label}</h2><p>${d.plays ? `${plural(d.plays, "écoute", "écoutes")} à raconter.` : "Pas encore assez d'écoutes sur cette période."}</p><div class="rc-period" role="group">${[["month", "Ce mois"], ["year", "Cette année"], ["all", "Depuis le début"]].map(([k, l]) => html`<button data-act="rc-period" data-v="${k}" aria-pressed="${String(this.period === k)}">${l}</button>`)}</div>` });
    if (!d.plays) return (this.slides = s);
    s.push({ cls: "rc-big", c: ["#ff5c8a", "#ffb547"], body: html`<small>Tu as écouté</small><h2 class="rc-num" data-count="${d.minutes}">${d.minutes.toLocaleString("fr-FR")}</h2><p>minutes de musique${d.minutes >= 60 ? `, soit ${fmtLong(d.minutes * 60)}` : ""}.</p><p class="rc-sub">${plural(d.days, "jour", "jours")} d'écoute · meilleure série : ${plural(d.best, "jour", "jours")} d'affilée</p>` });
    const a0 = d.artists[0] && A(d.artists[0][0]);
    if (a0) s.push({ cls: "rc-artist", c: ["#4fa8ff", "#8b5cff"], art: a0.artKey, body: html`<small>Ton artiste n°1</small><h2>${a0.name}</h2><p>${plural(d.artists[0][1], "écoute", "écoutes")}</p><ol class="rc-list">${d.artists.slice(1, 5).map(([k, n]) => html`<li><b>${A(k)?.name || k}</b><span>${n}</span></li>`)}</ol>` });
    s.push({ cls: "rc-tracks", c: ["#ff4fbf", "#4fe3b5"], body: html`<small>Tes titres préférés</small><ol class="rc-top">${d.tracks.slice(0, 5).map(([id, n], i) => { const t = T(id); return html`<li style="--i:${i}"><span class="rc-rank">${i + 1}</span><span class="rc-cov">${artSmall(t.artKey) ? html`<img src="${artSmall(t.artKey)}" alt="">` : icon("music", "sm")}</span><span class="rc-t"><b>${t.title}</b><small>${t.artist} · ${plural(n, "écoute", "écoutes")}</small></span></li>`; })}</ol>` });
    if (d.mood) s.push({ cls: "rc-mood", c: d.mood.c, body: html`<small>Ton humeur</small><h2>${d.mood.name}</h2><p>C'est l'ambiance qui revient le plus dans tes écoutes : ${d.mood.hint.toLowerCase()}.</p><div class="rc-mood-ic">${icon(d.mood.ic, "lg")}</div>` });
    s.push({ cls: "rc-time", c: ["#ffd84d", "#ff5c6c"], body: html`<small>Ton moment</small><h2>${d.part[0]}</h2><p>C'est ${d.part[0]} que tu écoutes le plus de musique.</p>${d.discovered ? html`<p class="rc-sub">Et tu as découvert ${plural(d.discovered, "nouveau titre", "nouveaux titres")}.</p>` : ""}` });
    const al = d.albums[0] && Al(d.albums[0][0]);
    s.push({ cls: "rc-end", c: ["#a08cff", "#3fe0c5"], art: al && al.artKey, body: html`<small>En résumé</small><h2>${d.r.label}</h2><div class="rc-grid"><div><b>${d.minutes.toLocaleString("fr-FR")}</b><span>minutes</span></div><div><b>${d.plays}</b><span>écoutes</span></div><div><b>${d.distinctArtists}</b><span>artistes</span></div><div><b>${d.discovered}</b><span>découvertes</span></div></div>${a0 ? html`<p>Artiste n°1 : <b>${a0.name}</b>${d.tracks[0] ? html`<br>Titre n°1 : <b>${T(d.tracks[0][0]).title}</b>` : ""}</p>` : ""}<button class="btn primary" data-act="rc-share">${icon("send", "sm")} Partager mon récap</button>` });
    this.slides = s;
  },
  open(period) {
    if (period) this.period = period;
    this.build(); this.i = 0;
    const el = $("#recap"); el.hidden = false; requestAnimationFrame(() => el.classList.add("open")); UI.histPush("recap"); this.bind(); this.show();
  },
  close(fromPop) { const el = $("#recap"); if (!el || el.hidden) return; if (!fromPop) UI.histPop(); clearTimeout(this.timer); el.classList.remove("open"); setTimeout(() => { el.hidden = true; el.innerHTML = ""; }, 260); },
  show() {
    const s = this.slides[this.i], n = this.slides.length;
    clearTimeout(this.timer);
    setHTML($("#recap"), html`<div class="rc" style="--r1:${s.c[0]};--r2:${s.c[1]}">
  ${s.art && artBig(s.art) ? html`<div class="rc-bg" style="background-image:url('${artBig(s.art)}')"></div>` : ""}
  <div class="rc-bars" aria-hidden="true">${this.slides.map((_, k) => html`<i class="${k < this.i ? "done" : k === this.i ? "on" : ""}"><b></b></i>`)}</div>
  <button class="icon-btn rc-close" data-act="rc-close" aria-label="Fermer le récap">${icon("x")}</button>
  <div class="rc-slide ${s.cls}" aria-live="polite">${s.art && artBig(s.art) ? html`<img class="rc-art" src="${artBig(s.art)}" alt="">` : ""}${s.body}</div>
  <button class="rc-nav rc-prev" data-act="rc-prev" aria-label="Précédent"></button><button class="rc-nav rc-next" data-act="rc-next" aria-label="Suivant"></button>
  <p class="rc-count">${this.i + 1} / ${n}</p>
</div>`);
    const num = $("#recap .rc-num");
    if (num && !Viz.calm) { const end = +num.dataset.count, t0 = performance.now(); const step = (now) => { const p = Math.min(1, (now - t0) / 1400); num.textContent = Math.round(end * (1 - Math.pow(1 - p, 3))).toLocaleString("fr-FR"); if (p < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); }
    if (this.i < n - 1 && this.i > 0) this.timer = setTimeout(() => this.go(1), 7000);
  },
  go(d) { const n = this.i + d; if (n < 0) return; if (n >= this.slides.length) return this.close(); this.i = n; this.show(); },
  bind() {
    if (this.bound) return; this.bound = true;
    document.addEventListener("keydown", (e) => { if ($("#recap").hidden) return; if (e.key === "ArrowRight") this.go(1); else if (e.key === "ArrowLeft") this.go(-1); else if (e.key === "Escape") this.close(); });
  },
  /* image de résumé pour les stories */
  async share() {
    const d = this.d, { W, H } = Card, cv = Card.canvas(), g = cv.getContext("2d");
    const a0 = d.artists[0] && L.artists.get(d.artists[0][0]);
    await document.fonts?.ready;
    Card.bg(g, await Card.img(a0 && artBig(a0.artKey)), Theme.palette(null));
    g.textAlign = "center"; g.fillStyle = "rgba(244,242,255,.75)"; g.font = "700 36px Figtree, sans-serif"; g.fillText("MON RÉCAP", W / 2, 230);
    g.fillStyle = "#fff"; g.font = "800 92px Unbounded, Figtree, sans-serif"; g.fillText(d.r.label.charAt(0).toUpperCase() + d.r.label.slice(1), W / 2, 350);
    const box = (x, y, v, l) => { g.fillStyle = "rgba(255,255,255,.08)"; g.beginPath(); g.roundRect ? g.roundRect(x, y, 440, 220, 36) : g.rect(x, y, 440, 220); g.fill(); g.fillStyle = "#fff"; g.font = "800 84px Unbounded, Figtree, sans-serif"; g.fillText(v, x + 220, y + 120); g.fillStyle = "rgba(244,242,255,.7)"; g.font = "500 36px Figtree, sans-serif"; g.fillText(l, x + 220, y + 180); };
    box(80, 450, d.minutes.toLocaleString("fr-FR"), "minutes"); box(560, 450, String(d.plays), "écoutes"); box(80, 700, String(d.distinctArtists), "artistes"); box(560, 700, String(d.discovered), "découvertes");
    g.textAlign = "left"; g.fillStyle = "rgba(244,242,255,.7)"; g.font = "700 34px Figtree, sans-serif"; g.fillText("TOP ARTISTES", 100, 1030); g.fillText("TOP TITRES", 100, 1390);
    g.font = "700 46px Figtree, sans-serif"; g.fillStyle = "#fff";
    d.artists.slice(0, 4).forEach(([k], i) => g.fillText(`${i + 1}.  ${Card.wrap(g, L.artists.get(k)?.name || k, 860, 1)[0]}`, 100, 1100 + i * 66));
    d.tracks.slice(0, 4).forEach(([id], i) => g.fillText(`${i + 1}.  ${Card.wrap(g, L.tracks.get(id).title, 860, 1)[0]}`, 100, 1460 + i * 66));
    Card.logo(g, 1830);
    Card.last = { cv, name: `aurore-recap-${d.r.label.replace(/\s+/g, "-")}.png`, text: `Mon récap aurore : ${d.minutes} minutes de musique` };
    this.close(); Card.preview();
  },
};
