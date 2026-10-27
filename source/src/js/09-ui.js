/* ===================== interface : socle ===================== */
const ROW = 56;
const LISTS = new Map(); let listSeq = 0;

function toast(msg, opts = {}) {
  const box = $("#toasts"); if (!box) return;
  const el = document.createElement("div"); el.className = "toast";
  const span = document.createElement("span"); span.textContent = msg; el.append(span);
  if (opts.action) {
    const b = document.createElement("button"); b.textContent = opts.action.label;
    b.onclick = () => { opts.action.fn(); close(); }; el.append(b);
  }
  box.append(el);
  while (box.children.length > 3) box.firstChild.remove();
  let gone = false;
  const close = () => { if (gone) return; gone = true; el.classList.add("out"); setTimeout(() => el.remove(), 200); };
  setTimeout(close, opts.ms || (opts.action ? 7000 : 3200));
}

/* ---- menu contextuel ---- */
const Menu = {
  el: null, pages: [], anchor: null,
  open(at, items) {
    this.el = $("#menu"); this.pages = [items]; this.anchor = at; this.draw();
  },
  push(items) { this.pages.push(items); this.draw(); },
  pop() { this.pages.pop(); this.draw(); },
  draw() {
    const items = this.pages[this.pages.length - 1]; const el = this.el;
    el.innerHTML = "";
    if (this.pages.length > 1) items.unshift({ icon: "back", label: "Retour", keep: true, fn: () => this.pop() });
    for (const it of items) {
      if (it === "sep") { el.append(document.createElement("hr")); continue; }
      if (it.title) { const d = document.createElement("div"); d.className = "m-title"; d.textContent = it.title; el.append(d); continue; }
      const b = document.createElement("button"); b.setAttribute("role", "menuitem");
      b.innerHTML = icon(it.icon || "right").s; const s = document.createElement("span"); s.textContent = it.label; b.append(s);
      if (it.sub) b.insertAdjacentHTML("beforeend", `<span style="margin-left:auto;color:var(--text-3)">${icon("right", "sm").s}</span>`);
      b.onclick = (e) => { e.stopPropagation(); if (it.sub) return this.push(it.sub()); if (!it.keep) this.close(); it.fn && it.fn(); };
      el.append(b);
    }
    el.hidden = false;
    const r = el.getBoundingClientRect(); let x, y;
    if (this.anchor instanceof Element) { const a = this.anchor.getBoundingClientRect(); x = a.right - r.width; y = a.bottom + 6; if (y + r.height > innerHeight - 12) y = a.top - r.height - 6; }
    else { x = this.anchor.x; y = this.anchor.y; }
    el.style.left = clamp(x, 12, innerWidth - r.width - 12) + "px";
    el.style.top = clamp(y, 12, innerHeight - r.height - 12) + "px";
    const first = el.querySelector("button"); first && first.focus({ preventScroll: true });
  },
  close() { if (this.el) { this.el.hidden = true; this.el.innerHTML = ""; } this.pages = []; },
  get isOpen() { return this.el && !this.el.hidden; },
};

/* ---- briques HTML partagées ---- */
function placeholderColor(s) { const h = parseInt(hash(String(s)).slice(0, 4), 36) % 360; return `hsl(${h} 32% 24%)`; }
function coverHTML(artKey, seed, ic = "disc", big = true) {
  const url = big ? artBig(artKey) : artSmall(artKey); const p = palOf(artKey);
  return html`<div class="cover" style="--cc:${p ? p.c1 : placeholderColor(seed)}">${url ? html`<img src="${url}" alt="" loading="lazy" decoding="async">` : html`<div class="ph">${icon(ic)}</div>`}`;
}
function thumbHTML(artKey) {
  const url = artSmall(artKey);
  return url ? html`<img src="${url}" alt="" loading="lazy" decoding="async">` : html`<span class="thumb">${icon("music")}</span>`;
}
function artistLinks(t) {
  return t.artists.map((a, i) => html`${i ? ", " : ""}<button data-act="open-artist" data-key="${norm(a)}">${a}</button>`);
}
function rowHTML(id, i, opts) {
  const t = L.tracks.get(id); if (!t) return "";
  const now = id === Q.current, liked = L.likes.has(id);
  const num = opts.numbering === "track" ? (t.track || i + 1) : i + 1;
  const style = opts.virtual ? `transform:translateY(${i * ROW}px)` : "";
  return html`<div class="row${now ? " now" : ""}${L.files.has(id) ? "" : " missing"}${UI.sel === id ? " sel" : ""}" role="row" data-row="${i}" data-id="${id}" style="${style}">
<div class="c-num">${now ? html`<span class="eq"><i></i><i></i><i></i></span>` : html`<span class="n">${num}</span>`}<button class="rp" data-act="row-play" data-state="${now ? (Player.playing ? "pause" : "play") + "now" : "idle"}" aria-label="${now && Player.playing ? "Pause" : "Lire " + t.title}">${icon(now && Player.playing ? "pause" : "play", "sm")}</button></div>
<div class="c-title">${opts.cover ? thumbHTML(t.artKey) : ""}<div><div class="t-name" title="${t.title}">${t.title}</div><div class="t-artist">${artistLinks(t)}</div></div></div>
${opts.album ? html`<div class="c-album">${t.albumKey ? html`<button data-act="open-album" data-key="${t.albumKey}">${t.album}</button>` : ""}</div>` : ""}
<div class="c-plays">${playsOf(id) || ""}</div>
<div class="c-like"><button class="icon-btn heart${liked ? " on" : ""}" data-act="like" aria-pressed="${liked}" aria-label="${liked ? "Retirer des titres likés" : "Ajouter aux titres likés"}">${icon("heart", "sm")}</button></div>
<div class="c-dur">${t.duration ? fmtTime(t.duration) : "–"}</div>
<div class="c-more"><button class="icon-btn" data-act="row-menu" aria-label="Plus d'options pour ${t.title}">${icon("more", "sm")}</button></div>
</div>`;
}
const SORTS = { title: "Titre", album: "Album", plays: "Écoutes", duration: "Durée", added: "Ajout" };
function listHead(opts) {
  const s = opts.sort;
  const b = (key, label, cls = "") => s ? html`<button class="${cls}${s.key === key ? " on" : ""}" data-act="sort" data-key="${key}">${label}${s.key === key ? (s.dir > 0 ? " ↑" : " ↓") : ""}</button>` : html`<span class="${cls}">${label}</span>`;
  return html`<div class="tl-head" role="row"><span class="c-num">#</span>${b("title", "Titre")}${opts.album ? b("album", "Album", "c-album") : ""}${b("plays", "Écoutes", "r c-plays")}<span class="c-like"></span>${b("duration", icon("clock", "sm"), "r c-dur")}<span></span></div>`;
}
/* liste de titres : rendu direct ou virtualisé (au-delà de 250 lignes) */
function trackList(ids, opts = {}) {
  const lid = "l" + ++listSeq;
  opts = { album: true, cover: true, numbering: "index", ...opts };
  opts.virtual = ids.length > 250;
  LISTS.set(lid, { ids, opts });
  if (opts.virtual) UI.mount(() => UI.mountVirtual(lid));
  let body;
  if (opts.virtual) body = html`<div class="tl-body virtual" style="height:${ids.length * ROW}px"></div>`;
  else if (opts.discs) {
    let last = null; const parts = [];
    ids.forEach((id, i) => { const d = L.tracks.get(id).disc || 1; if (d !== last) { last = d; parts.push(html`<div class="disc-head">${icon("disc", "sm")} Disque ${d}</div>`); } parts.push(rowHTML(id, i, opts)); });
    body = html`<div class="tl-body">${parts}</div>`;
  } else body = html`<div class="tl-body">${ids.map((id, i) => rowHTML(id, i, opts))}</div>`;
  return html`<div class="tl${opts.album ? "" : " no-album"}" data-list="${lid}" role="table">${listHead(opts)}${body}</div>`;
}
function albumCard(key) {
  const a = L.albums.get(key); if (!a) return "";
  const playing = Q.current && L.tracks.get(Q.current)?.albumKey === key && Player.playing;
  return html`<div class="card" data-act="open-album" data-key="${key}" role="button" tabindex="0" aria-label="${a.title}, ${a.artist}">
${coverHTML(a.artKey, a.title)}<button class="card-play${playing ? " playing" : ""}" data-act="play-album" data-key="${key}" aria-label="Lire ${a.title}">${icon(playing ? "pause" : "play")}</button></div>
<div class="card-title">${a.title}</div><div class="card-sub">${a.year ? a.year + " · " : ""}${a.artist}</div></div>`;
}
function artistCard(key) {
  const a = L.artists.get(key); if (!a) return "";
  const arts = [...a.albums].map((k) => L.albums.get(k)?.artKey).filter((k) => k && artBig(k)).slice(0, 4);
  const p = palOf(a.artKey);
  const inner = arts.length >= 4 ? html`<div class="mosaic">${arts.map((k) => html`<img src="${artSmall(k)}" alt="" loading="lazy">`)}</div>`
    : a.artKey && artBig(a.artKey) ? html`<img src="${artBig(a.artKey)}" alt="" loading="lazy">` : html`<div class="ph">${icon("artist")}</div>`;
  const nAlb = a.albums.size;
  return html`<div class="card artist" data-act="open-artist" data-key="${key}" role="button" tabindex="0" aria-label="${a.name}">
<div class="cover" style="--cc:${p ? p.c1 : placeholderColor(a.name)}">${inner}</div>
<div class="card-title">${a.name}</div><div class="card-sub">${nAlb ? plural(nAlb, "album", "albums") : plural(a.tracks.length, "titre", "titres")}</div></div>`;
}

/* ---- l'objet UI ---- */
const VIZ_MODES = [["halo", "Halo", "halo"], ["spectre", "Spectre", "bars"], ["onde", "Onde", "wave"], ["paysage", "Paysage", "mountain"], ["eclats", "Éclats", "burst"], ["retro", "Rétro", "retro"]];
/* petit cœur qui s'envole (double toucher) */
function heartBurst(x, y) {
  const d = document.createElement("div"); d.className = "heart-burst"; d.style.left = x + "px"; d.style.top = y + "px"; setHTML(d, icon("heart")); document.body.append(d);
  d.animate([{ transform: "translate(-50%,-50%) scale(.3)", opacity: 0 }, { transform: "translate(-50%,-50%) scale(1.25)", opacity: 1, offset: .35 }, { transform: "translate(-50%,-120%) scale(1)", opacity: 0 }], { duration: 850, easing: "cubic-bezier(.2,.8,.2,1)" }).onfinish = () => d.remove();
}
/* ===================== thèmes ===================== */
const ACCENTS = {
  pochette: { name: "Pochette", c1: "", c2: "", c3: "" },
  aurore: { name: "Aurore", c1: "#a08cff", c2: "#3fe0c5", c3: "#ff7ab6" },
  ocean: { name: "Océan", c1: "#4fa8ff", c2: "#35e0d0", c3: "#8a7dff" },
  couchant: { name: "Couchant", c1: "#ff8a5b", c2: "#ffc94d", c3: "#ff5c8a" },
  foret: { name: "Forêt", c1: "#59d68c", c2: "#c6e86a", c3: "#2fb8a6" },
  rose: { name: "Bonbon", c1: "#ff79b4", c2: "#c08cff", c3: "#ffb36b" },
  glace: { name: "Givre", c1: "#9cc8ff", c2: "#d7ecff", c3: "#b9a6ff" },
};
const BACKGROUNDS = [["aurore", "Aurore", "Sombre, avec l'aurore animée"], ["noir", "Noir pur", "Écrans OLED, économise la batterie"], ["clair", "Clair", "Pour le plein jour"]];
const Theme = {
  bg: store.get("theme", "aurore"), accent: store.get("accent", "pochette"),
  apply() {
    const d = document.documentElement;
    d.classList.toggle("th-noir", this.bg === "noir"); d.classList.toggle("th-clair", this.bg === "clair");
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = this.bg === "clair" ? "#f4f2fa" : this.bg === "noir" ? "#000000" : "#07070d";
    if (typeof UI !== "undefined" && UI.applyPalette) UI.applyPalette(UI._pal);
  },
  set(bg, accent) { if (bg) { this.bg = bg; store.set("theme", bg); } if (accent) { this.accent = accent; store.set("accent", accent); } this.apply(); },
  /* couleurs : celles de la pochette, ou une palette fixe ; en thème clair, assombries pour rester lisibles */
  palette(p) {
    const a = ACCENTS[this.accent];
    let out = a && a.c1 ? { c1: a.c1, c2: a.c2, c3: a.c3 } : { ...(p || DEFAULT_PAL) };
    const rgb = (c) => Viz.parseColor(c);
    if (this.bg === "clair") for (const k of ["c1", "c2", "c3"]) out[k] = shade(rgb(out[k]), .42);
    const [r, g, b] = rgb(out.c1); const lum = (.2126 * r + .7152 * g + .0722 * b) / 255;
    out.on = lum > .5 ? "#0b0a14" : "#ffffff";
    return out;
  },
};
/* couleur → même teinte avec une luminosité maximale l (0–1) */
function shade([r, g, b], lmax) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2;
  if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
  return `hsl(${Math.round(h * 360)} ${Math.round(Math.max(s, .45) * 100)}% ${Math.round(Math.min(l, lmax) * 100)}%)`;
}

const UI = {
  view: { name: "home", param: null }, stack: [], mounts: [], sel: null,
  trackSort: store.get("trackSort", { key: "default", dir: 1 }),
  albumSort: store.get("albumSort", "artist"), albumGenre: null, artistSort: "az",
  imm: false, immQueue: false,

  mount(fn) { this.mounts.push(fn); },
  /* bouton Retour d'Android / geste retour : chaque page ouverte ajoute une entrée d'historique */
  histDepth: 0, skipPop: false,
  histPush(kind) { if (!HIST) return; try { history.pushState({ aurore: kind }, ""); this.histDepth++; } catch { /* ignoré */ } },
  histPop() { if (!HIST || this.histDepth <= 0) return; this.histDepth--; this.skipPop = true; history.back(); },
  histReset() { if (!HIST || this.histDepth <= 0) return; this.skipPop = true; const n = this.histDepth; this.histDepth = 0; history.go(-n); },
  onPop() {
    if (this.skipPop) { this.skipPop = false; return; }
    this.histDepth = Math.max(0, this.histDepth - 1);
    if (Menu.isOpen) Menu.close();
    if (!$("#sheet").hidden) { $("#sheet").hidden = true; $("#sheet").innerHTML = ""; return; }
    if (!$("#guide").hidden) return Guide.close(true);
    if (this.imm) return this.closeImm(true);
    if (this.stack.length) this.back(true);
  },
  go(name, param = null, { push = true } = {}) {
    let reuse = false; /* sur téléphone, l'écran En cours se ferme et son entrée d'historique sert à la nouvelle page */
    if (this.imm && isPhone()) { this.closeImm(true); reuse = true; }
    if (!push) this.histReset();
    if (push && (this.view.name !== name || this.view.param !== param)) { this.stack.push({ ...this.view, scroll: $("#scroll").scrollTop }); if (!reuse) this.histPush("view"); }
    if (this.stack.length > 40) this.stack.shift();
    this.view = { name, param };
    if (name !== "search") { const q = $("#q"); if (q.value) q.value = ""; }
    Menu.close();
    this.render();
    $("#scroll").scrollTop = 0;
  },
  back(fromPop) {
    if (!fromPop) this.histPop();
    const prev = this.stack.pop(); if (!prev) return this.go("home", null, { push: false });
    this.view = { name: prev.name, param: prev.param };
    if (prev.name !== "search") $("#q").value = "";
    this.render(); $("#scroll").scrollTop = prev.scroll || 0;
  },
  render() {
    LISTS.clear(); this.mounts = []; Viz.prune();
    const v = this.view; let out;
    try { out = (VIEWS[v.name] || VIEWS.home)(v.param); } catch (e) { console.error(e); out = html`<div class="empty"><h2>Oups</h2><p>Cette page n'a pas pu s'afficher.</p></div>`; }
    setHTML($("#view"), html`${missingBanner()}${out}`);
    const mounts = this.mounts; this.mounts = []; for (const fn of mounts) fn();
    this.renderNav();
    $("#back-btn").hidden = !this.stack.length;
  },
  rerender: debounce(function () {
    const a = document.activeElement;
    if (a && a.closest && a.closest("#view") && a.matches("input")) return;
    const s = $("#scroll").scrollTop; UI.render(); $("#scroll").scrollTop = s;
  }, 120),

  /* ---- navigation latérale ---- */
  renderNav() {
    const cur = this.view.name;
    const items = [["home", "Accueil", "home"], ["tracks", "Titres", "tracks", L.tracks.size], ["albums", "Albums", "disc", L.albums.size], ["artists", "Artistes", "artist", L.artists.size], ["discover", "Découvertes", "sparkles"]];
    setHTML($("#nav"), items.map(([k, label, ic, n]) => html`<button class="nav-item" data-act="nav" data-view="${k}" ${raw(cur === k ? 'aria-current="page"' : "")}>${icon(ic)}<span>${label}</span>${n ? html`<span class="nav-count">${n.toLocaleString("fr-FR")}</span>` : ""}</button>`));
    setHTML($("#tabs"), items.map(([k, label, ic]) => html`<button data-act="nav" data-view="${k}" ${raw(cur === k ? 'aria-current="page"' : "")}>${icon(ic)}<span>${label}</span></button>`));
    const pv = this.view.param;
    const special = [
      ["liked", "Titres likés", `${L.likes.size} titres`, "heart", "liked"],
      ["top", "Les plus écoutés", "Ta playlist auto", "bars", ""],
      ["saved", "À découvrir", `${L.saved.length} artistes notés`, "bookmark", "saved"],
    ];
    setHTML($("#side-lists"), html`${special.map(([id, name, sub, ic, cls]) => html`<button class="pl-item" data-act="${id === "saved" ? "nav" : "open-list"}" data-view="discover" data-id="${id}" ${raw((cur === "list" && pv === id) ? 'aria-current="page"' : "")}><span class="pl-thumb ${cls}">${icon(ic, "sm")}</span><span class="pl-meta"><span class="pl-name" style="display:block">${name}</span><span class="pl-sub">${sub}</span></span></button>`)}
${L.playlists.map((p) => { const first = p.ids.map((id) => L.tracks.get(id)).find((t) => t && artSmall(t.artKey)); return html`<button class="pl-item" data-act="open-list" data-id="${p.id}" ${raw(cur === "list" && pv === p.id ? 'aria-current="page"' : "")}><span class="pl-thumb">${first ? html`<img src="${artSmall(first.artKey)}" alt="">` : icon("music", "sm")}</span><span class="pl-meta"><span class="pl-name" style="display:block">${p.name}</span><span class="pl-sub">Playlist · ${plural(p.ids.length, "titre", "titres")}</span></span></button>`; })}`);
  },
  onLibraryProgress() {
    const el = $("#lib-status"); if (!el) return;
    const imp = L.importing, mem = L.memorizing;
    let body;
    if (imp && imp.total) body = html`<span>Analyse de ta musique… <b class="mono">${imp.done}/${imp.total}</b></span><div class="progress-line"><i style="width:${(imp.done / imp.total) * 100}%"></i></div>`;
    else if (imp) body = html`<span>Ouverture du dossier…</span><div class="progress-line"><i style="width:30%"></i></div>`;
    else if (mem) body = html`<span>Mémorisation… <b class="mono">${mem.done}/${mem.total}</b></span><div class="progress-line"><i style="width:${(mem.done / mem.total) * 100}%"></i></div>`;
    else if (L.tracks.size) {
      let dur = 0; for (const t of L.tracks.values()) dur += t.duration || 0;
      body = html`<span><b>${plural(L.tracks.size, "titre", "titres")}</b> · ${fmtLong(dur)}</span><span>${L.memorize ? "Gardée dans le navigateur" : L.rootName ? `Dossier « ${L.rootName} »` : "Fichiers ouverts"}</span>`;
    } else body = html`<span>Ta bibliothèque est vide.</span>`;
    setHTML(el, body);
  },
  onLibraryChanged() { this.renderNav(); this.onLibraryProgress(); if (["home", "tracks", "albums", "artists", "album", "artist", "list", "search", "discover"].includes(this.view.name)) this.rerender(); },
  onStatsChanged() { if (this.view.name === "home" && !this.imm) this.rerender(); },
  onQueueChanged() { this.renderNP(); if (this.immQueue) this.renderImmQueue(); Q.save(); if (NP && Player.mode === "native") NP.refreshSoon(); },

  /* ---- bannière fichiers manquants ---- */
  needFiles() {
    if (NATIVE_WIN) { toast("Ce titre n'est plus sur ton PC.", { action: { label: "Relire mes dossiers", fn: () => nativeScan() } }); return this.rerender(); }
    toast(L.rootName ? `Rouvre ton dossier « ${L.rootName} » pour écouter.` : "Rouvre ton dossier de musique pour écouter.", { action: { label: "Rouvrir", fn: () => reopenFolder() } });
    this.rerender();
  },
  offerMemorize() {
    store.set("askedMemo", true);
    toast(`Garder ta musique (${fmtBytes(libraryBytes())}) dans le lecteur pour ne plus réimporter ?`, { ms: 12000, action: { label: "Oui, garder", fn: () => { L.memorize = true; DB.put("kv", "memorize", true); memorizeFiles(); } } });
  },

  /* ---- dock ---- */
  buildDock() {
    setHTML($("#dock"), html`
<div class="d-left">
  <button class="d-cover js-cover" data-act="open-imm-phone" aria-label="Ouvrir le lecteur">${icon("music")}</button>
  <div class="d-meta" data-act="open-imm-phone"><div class="d-title js-title">Rien en lecture</div><div class="d-artist js-artist">Choisis un titre pour commencer</div></div>
  <button class="icon-btn heart js-like" data-act="like-current" aria-label="Ajouter aux titres likés" hidden>${icon("heart", "sm")}</button>
  <div class="d-lcd" title="Spectre"><canvas id="lcd" aria-hidden="true"></canvas></div>
</div>
<div class="d-center">
  <div class="d-ctrls">
    <button class="icon-btn opt js-shuffle" data-act="shuffle" aria-label="Lecture aléatoire" title="Aléatoire (S)">${icon("shuffle", "sm")}</button>
    <button class="icon-btn" data-act="prev" aria-label="Précédent" title="Précédent">${icon("prev")}</button>
    <button class="d-play js-play" data-act="toggle-play" aria-label="Lecture" title="Lecture / pause (Espace)" disabled>${icon("play")}</button>
    <button class="icon-btn" data-act="next" aria-label="Suivant" title="Suivant">${icon("next")}</button>
    <button class="icon-btn opt js-repeat" data-act="repeat" aria-label="Répéter" title="Répéter (R)">${icon("repeat", "sm")}</button>
  </div>
  <div class="d-seek"><span class="mono js-cur">0:00</span><input type="range" class="js-seek" min="0" max="1000" step="1" value="0" aria-label="Position dans le titre"><span class="mono js-dur">0:00</span></div>
</div>
<div class="d-right">
  <button class="icon-btn" data-act="immersive" aria-label="Mode immersif" title="Mode immersif (F)">${icon("expand", "sm")}</button>
  <button class="icon-btn" data-act="show-queue" aria-label="File d'attente" title="File d'attente">${icon("queue", "sm")}</button>
  <div class="vol"><button class="icon-btn js-mute" data-act="mute" aria-label="Couper le son" title="Muet (M)">${icon("vol", "sm")}</button><input type="range" id="vol" min="0" max="100" step="1" aria-label="Volume"></div>
</div>
<div class="mini-progress" aria-hidden="true"><i class="js-mini"></i></div>`);
    Viz.add($("#lcd"), "lcd");
    const vol = $("#vol"); vol.value = Math.round(Player.volume * 100); vol.style.setProperty("--p", vol.value + "%");
    this.syncControls(); this.syncVolume();
  },
  syncControls() {
    const has = !!Player.id;
    for (const b of $$(".js-play")) { b.disabled = !has && !Q.current; b.innerHTML = icon(Player.playing ? "pause" : "play").s; b.setAttribute("aria-label", Player.playing ? "Pause" : "Lecture"); }
    for (const b of $$(".js-shuffle")) { b.classList.toggle("on", Q.shuffle); b.setAttribute("aria-pressed", Q.shuffle); }
    for (const b of $$(".js-repeat")) { b.classList.toggle("on", Q.repeat !== "off"); b.innerHTML = icon(Q.repeat === "one" ? "repeat1" : "repeat", "sm").s; b.setAttribute("aria-label", Q.repeat === "one" ? "Répéter ce titre" : Q.repeat === "all" ? "Répéter tout" : "Répéter"); b.setAttribute("aria-pressed", Q.repeat !== "off"); }
    const liked = Q.current && L.likes.has(Q.current);
    for (const b of $$(".js-like")) { b.hidden = !Q.current; b.classList.toggle("on", !!liked); b.setAttribute("aria-pressed", !!liked); b.setAttribute("aria-label", liked ? "Retirer des titres likés" : "Ajouter aux titres likés"); }
    document.documentElement.style.setProperty("--eq", Player.playing ? "running" : "paused");
    if (NativeMedia && Player.mode !== "native") NativeMedia.state();
    try { if (navigator.mediaSession) navigator.mediaSession.playbackState = Player.id ? (Player.playing ? "playing" : "paused") : "none"; } catch { /* ignoré */ }
    this.keepAwake(Player.playing);
    document.documentElement.style.setProperty("--drift", Player.playing && !Viz.calm ? "running" : "paused");
  },
  syncVolume() {
    const v = Player.muted ? 0 : Player.volume; const vol = $("#vol");
    if (vol) { vol.value = Math.round(v * 100); vol.style.setProperty("--p", vol.value + "%"); }
    for (const b of $$(".js-mute")) b.innerHTML = icon(v === 0 ? "mute" : v < .5 ? "vol1" : "vol", "sm").s;
  },
  seeking: false,
  syncTime() {
    const d = Player.duration || L.tracks.get(Q.current)?.duration || 0, t = Player.id ? Player.currentTime : (store.get("q", {})?.t || 0);
    for (const el of $$(".js-cur")) if (!this.seeking) el.textContent = fmtTime(t);
    for (const el of $$(".js-dur")) el.textContent = fmtTime(d);
    const p = d ? clamp(t / d, 0, 1) : 0;
    if (!this.seeking) for (const s of $$(".js-seek")) { s.value = Math.round(p * 1000); s.style.setProperty("--p", p * 100 + "%"); }
    for (const m of $$(".js-mini")) m.style.width = p * 100 + "%";
    const now = performance.now();
    if (Player.mode === "native") { /* notification gérée par le service natif */ }
    else if (NativeMedia && Player.id && d) NativeMedia.position(d, t);
    else if (Player.id && d && navigator.mediaSession?.setPositionState && (!this._posAt || now - this._posAt > 1000)) {
      this._posAt = now;
      try { navigator.mediaSession.setPositionState({ duration: d, playbackRate: 1, position: clamp(t, 0, d) }); } catch { /* ignoré */ }
    }
  },
  progressLoop() {
    if (this._loop) return;
    const step = () => { this.syncTime(); if (Player.playing) this._loop = requestAnimationFrame(step); else this._loop = null; };
    this._loop = requestAnimationFrame(step);
  },
  showIdleTrack(id) { this.setTrackInfo(id); this.syncTime(); },
  setTrackInfo(id) {
    const t = id && L.tracks.get(id);
    for (const el of $$(".js-title")) el.textContent = t ? t.title : "Rien en lecture";
    for (const el of $$(".js-artist")) setHTML(el, t ? artistLinks(t) : "Choisis un titre pour commencer");
    for (const el of $$(".js-cover")) setHTML(el, t && artSmall(t.artKey) ? html`<img src="${artSmall(t.artKey)}" alt="">` : icon("music"));
    const p = t ? palOf(t.artKey) : null;
    this.applyPalette(p);
    Viz.setCover(t ? artBig(t.artKey) : "");
    this.syncControls();
    this.renderNP();
    if (this.imm) this.renderImm();
    this.mediaSession(t);
  },
  applyPalette(p) {
    this._pal = p; p = Theme.palette(p); const r = document.documentElement.style;
    r.setProperty("--c1", p.c1); r.setProperty("--c2", p.c2); r.setProperty("--c3", p.c3); r.setProperty("--on-c1", p.on);
    Viz.setPalette(p);
  },
  refreshRows() {
    for (const row of $$("#view .row")) {
      const list = LISTS.get(row.closest("[data-list]")?.dataset.list); if (!list) continue;
      const i = +row.dataset.row; const id = list.ids[i];
      const isNow = id === Q.current;
      const btn = row.querySelector(".rp"); const icNow = btn && btn.dataset.state;
      const want = isNow ? (Player.playing ? "pause" : "play") + "now" : "idle";
      if (row.classList.contains("now") !== isNow || icNow !== want) {
        const tmp = document.createElement("div"); setHTML(tmp, rowHTML(id, i, list.opts));
        row.replaceWith(tmp.firstElementChild);
      }
    }
    for (const b of $$("#view .card-play")) {
      const key = b.dataset.key; const playing = Player.playing && Q.current && L.tracks.get(Q.current)?.albumKey === key;
      b.classList.toggle("playing", !!playing); b.innerHTML = icon(playing ? "pause" : "play").s;
    }
    for (const b of $$("#view [data-play-ctx]")) {
      const playing = Player.playing && Q.ref === b.dataset.playCtx;
      b.innerHTML = icon(playing ? "pause" : "play").s; b.setAttribute("aria-label", playing ? "Pause" : "Lecture");
    }
  },
  mountVirtual(lid) {
    const wrap = $(`[data-list="${lid}"]`); if (!wrap) return;
    const body = wrap.querySelector(".tl-body"); const { ids, opts } = LISTS.get(lid);
    const sc = $("#scroll"); let lastFirst = -1, lastLast = -1;
    const draw = () => {
      if (!body.isConnected) { sc.removeEventListener("scroll", onScroll); return; }
      const top = body.getBoundingClientRect().top - sc.getBoundingClientRect().top;
      const first = Math.max(0, Math.floor(-top / ROW) - 8), last = Math.min(ids.length, first + Math.ceil(sc.clientHeight / ROW) + 16);
      if (first === lastFirst && last === lastLast) return;
      lastFirst = first; lastLast = last;
      const parts = []; for (let i = first; i < last; i++) parts.push(rowHTML(ids[i], i, opts));
      setHTML(body, parts);
    };
    let raf = 0; const onScroll = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };
    sc.addEventListener("scroll", onScroll, { passive: true });
    wrap._redraw = () => { lastFirst = -1; draw(); };
    draw();
  },

  /* ---- panneau En cours ---- */
  npOpen: store.get("npOpen", true),
  renderNP() {
    const np = $("#np"); if (!np) return;
    const t = Q.current && L.tracks.get(Q.current);
    if (!t) {
      setHTML(np, html`<div class="np-head"><span class="np-ctx">En cours</span><button class="icon-btn" data-act="toggle-np" aria-label="Fermer le panneau">${icon("x", "sm")}</button></div>
<div class="np-empty"><div><div class="big-ic">${icon("music", "lg")}</div><p>Lance un titre : sa pochette, le spectre en direct et la suite de ta file s'afficheront ici.</p></div></div>`);
      return;
    }
    const liked = L.likes.has(t.id);
    const info = [t.codec, t.sampleRate ? (t.sampleRate / 1000).toLocaleString("fr-FR") + " kHz" : "", t.bitrate ? t.bitrate + " kb/s" : ""].filter(Boolean).join(" · ");
    const up = Q.upcoming(30);
    setHTML(np, html`<div class="np-head"><span class="np-ctx" title="${Q.label}">${Q.label || "En cours"}</span><button class="icon-btn" data-act="toggle-np" aria-label="Fermer le panneau">${icon("x", "sm")}</button></div>
<div class="np-body">
  <div class="np-cover">${artBig(t.artKey) ? html`<img src="${artBig(t.artKey)}" alt="Pochette de ${t.album || t.title}">` : html`<div class="ph">${icon("music", "lg")}</div>`}<button class="icon-btn" data-act="immersive" aria-label="Mode immersif">${icon("expand", "sm")}</button></div>
  <div class="np-titles"><div><div class="np-title">${t.title}</div><div class="np-artist">${artistLinks(t)}</div></div><button class="icon-btn heart js-like${liked ? " on" : ""}" data-act="like-current" aria-pressed="${liked}" aria-label="${liked ? "Retirer des titres likés" : "Ajouter aux titres likés"}">${icon("heart")}</button></div>
  <div class="viz-box"><canvas id="np-viz" aria-hidden="true"></canvas><div class="viz-cap"><span>32 Hz</span><span>${info}</span><span>16 kHz</span></div></div>
  ${this.queueHTML(up)}
</div>`);
    Viz.add($("#np-viz"), "panel");
  },
  queueHTML(up) {
    const qrow = (id, act, data, extra = "") => { const t = L.tracks.get(id); if (!t) return ""; return html`<div class="q-item${act === "noop" ? " now" : ""}"><button class="q-row" data-act="${act}" ${raw(data)}>${thumbHTML(t.artKey)}<div><div class="t-name">${t.title}</div><div class="t-artist">${t.artist}</div></div></button>${extra}</div>`; };
    const cur = Q.current;
    return html`
<div class="q-sec"><h3><span>En cours</span></h3>${cur ? qrow(cur, "noop", "") : ""}</div>
${Q.manual.length ? html`<div class="q-sec"><h3><span>Ensuite dans ta file</span><button class="btn sm ghost" data-act="q-clear">Vider</button></h3>${Q.manual.slice(0, 50).map((id, i) => qrow(id, "q-manual", `data-i="${i}"`, html`<button class="icon-btn x" data-act="q-remove" data-i="${i}" aria-label="Retirer de la file">${icon("x", "sm")}</button>`))}</div>` : ""}
${up.length ? html`<div class="q-sec"><h3><span>Ensuite depuis : ${Q.label || "ta sélection"}</span></h3>${up.map((u) => qrow(u.id, "q-jump", `data-pos="${u.pos}"`))}</div>` : ""}`;
  },
  toggleNP(force) {
    const app = $("#app");
    const wide = matchMedia("(min-width: 1241px)").matches;
    if (wide) { this.npOpen = force ?? !this.npOpen; store.set("npOpen", this.npOpen); app.classList.toggle("np-off", !this.npOpen); app.classList.remove("np-open"); }
    else { const open = force ?? !app.classList.contains("np-open"); app.classList.toggle("np-open", open); app.classList.remove("np-off"); }
    if (!isPhone() && (wide ? this.npOpen : app.classList.contains("np-open"))) this.renderNP();
  },

  /* ---- mode immersif ---- */
  openImm() {
    const el = $("#imm"); if (this.imm) return;
    this.imm = true; el.hidden = false; this.renderImm(); this.histPush("imm");
    requestAnimationFrame(() => el.classList.add("open"));
    if (!isTouch()) $("#imm [data-act='close-imm']")?.focus();
    this.keepAwake(true);
  },
  closeImm(fromPop) {
    const el = $("#imm"); if (!this.imm) return;
    if (!fromPop) this.histPop();
    this.imm = false; this.immQueue = false; el.classList.remove("open"); el.style.transform = "";
    this.keepAwake(false);
    setTimeout(() => { if (!this.imm) { const c = el.querySelector("canvas"); if (c) Viz.remove(c); el.hidden = true; el.innerHTML = ""; } }, 320);
  },
  renderImm() {
    const el = $("#imm"); const t = Q.current && L.tracks.get(Q.current);
    const old = el.querySelector("canvas"); if (old) Viz.remove(old);
    const modes = VIZ_MODES;
    const big = t ? artBig(t.artKey) : "";
    setHTML(el, html`<div class="imm-bg" style="${big ? `background-image:url('${big}')` : ""}"></div><canvas aria-hidden="true"></canvas>
<div class="imm-top"><button class="icon-btn" data-act="close-imm" aria-label="Fermer le mode immersif" title="Fermer (Échap)">${icon("down")}</button>
<div class="ctx"><small>Lecture depuis</small><span>${Q.label || "ta bibliothèque"}</span></div>
<div class="seg viz-seg" role="group" aria-label="Visualiseur">${modes.map(([k, l, ic]) => html`<button data-act="viz-mode" data-mode="${k}" aria-pressed="${Viz.mode === k}" title="${l}">${icon(ic, "sm")}<span class="lbl">${l}</span></button>`)}</div>
<button class="viz-pick" data-act="viz-menu" aria-label="Changer de visualiseur">${icon((modes.find((m) => m[0] === Viz.mode) || modes[0])[2], "sm")}<span>${(modes.find((m) => m[0] === Viz.mode) || modes[0])[1]}</span></button>
<button class="icon-btn${this.immQueue ? " on" : ""}" data-act="imm-queue" aria-label="File d'attente" aria-pressed="${this.immQueue}">${icon("queue", "sm")}</button></div>
<div></div>
<div class="imm-bottom">
  <div class="imm-meta"><div class="d-cover">${t && artSmall(t.artKey) ? html`<img src="${artSmall(t.artKey)}" alt="">` : icon("music")}</div><div><div class="imm-title">${t ? t.title : "Rien en lecture"}</div><div class="imm-artist">${t ? html`${t.artist}${t.album ? " · " + t.album : ""}` : "Lance un titre depuis ta bibliothèque"}</div></div><button class="icon-btn heart js-like" data-act="like-current" aria-label="Ajouter aux titres likés">${icon("heart")}</button></div>
  <div class="d-seek"><span class="mono js-cur">0:00</span><input type="range" class="js-seek" min="0" max="1000" step="1" value="0" aria-label="Position dans le titre"><span class="mono js-dur">0:00</span></div>
  <div class="d-ctrls">
    <button class="icon-btn js-shuffle" data-act="shuffle" aria-label="Lecture aléatoire">${icon("shuffle")}</button>
    <button class="icon-btn" data-act="prev" aria-label="Précédent">${icon("prev", "lg")}</button>
    <button class="d-play js-play" data-act="toggle-play" aria-label="Lecture">${icon("play")}</button>
    <button class="icon-btn" data-act="next" aria-label="Suivant">${icon("next", "lg")}</button>
    <button class="icon-btn js-repeat" data-act="repeat" aria-label="Répéter">${icon("repeat")}</button>
  </div>
</div>
<div class="imm-queue" ${raw(this.immQueue ? "" : "hidden")}></div>`);
    Viz.add(el.querySelector("canvas"), "imm");
    Viz.particles.length = 0;
    if (this.immQueue) this.renderImmQueue();
    this.syncControls(); this.syncTime(); Viz.kick();
  },
  async keepAwake(on) {
    try {
      if (on && this.imm && Player.playing && !document.hidden && navigator.wakeLock && !this._wake) { this._wake = await navigator.wakeLock.request("screen"); this._wake.addEventListener("release", () => { this._wake = null; }); }
      else if ((!on || !Player.playing) && this._wake) { await this._wake.release(); this._wake = null; }
    } catch { this._wake = null; }
  },
  /* gestes : glisser vers le bas pour fermer, à gauche / à droite pour changer de titre */
  bindImmGestures() {
    const el = $("#imm"); let s = null;
    el.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "touch" || e.target.closest(".imm-bottom, .imm-top, .imm-queue")) { s = null; return; }
      s = { x: e.clientX, y: e.clientY, t: performance.now(), dir: null };
    });
    el.addEventListener("pointermove", (e) => {
      if (!s) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (!s.dir && Math.hypot(dx, dy) > 12) s.dir = Math.abs(dy) > Math.abs(dx) ? "y" : "x";
      if (s.dir === "y" && dy > 0) { el.style.transition = "none"; el.style.transform = `translateY(${dy * .7}px)`; }
    });
    const end = (e) => {
      if (!s) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y, fast = performance.now() - s.t < 300;
      el.style.transition = ""; el.style.transform = "";
      if (s.dir === "y" && (dy > 140 || (fast && dy > 60))) this.closeImm();
      else if (s.dir === "x" && Math.abs(dx) > 70) { const meta = $("#imm .imm-meta"); if (meta) meta.animate([{ transform: `translateX(${dx > 0 ? 24 : -24}px)`, opacity: .3 }, { transform: "none", opacity: 1 }], { duration: 260, easing: "ease-out" }); dx < 0 ? Q.next() : Q.prev(); }
      s = null;
    };
    el.addEventListener("pointerup", end); el.addEventListener("pointercancel", () => { s = null; el.style.transition = ""; el.style.transform = ""; });
    /* toucher deux fois l'image : j'aime */
    let lastTap = 0;
    el.addEventListener("pointerup", (e) => {
      if (e.pointerType !== "touch" || e.target.closest(".imm-bottom, .imm-top, .imm-queue")) return;
      const now = performance.now();
      if (now - lastTap < 380 && Q.current) { lastTap = 0; if (!L.likes.has(Q.current)) toggleLike(Q.current); heartBurst(e.clientX, e.clientY); }
      else lastTap = now;
    });
    this.bindDockGestures(); this.bindRowSwipe();
  },
  /* lecteur du bas (téléphone) : glisser à gauche/droite pour changer de titre, vers le haut pour l'ouvrir */
  bindDockGestures() {
    const el = $("#dock"); let s = null;
    el.addEventListener("pointerdown", (e) => { if (e.pointerType !== "touch" || !isPhone() || e.target.closest(".d-ctrls button, .js-like")) { s = null; return; } s = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    el.addEventListener("pointermove", (e) => { if (!s) return; const dx = e.clientX - s.x; if (Math.abs(dx) > 12) { const l = el.querySelector(".d-left"); if (l) { l.style.transition = "none"; l.style.transform = `translateX(${dx * .5}px)`; l.style.opacity = String(1 - Math.min(.6, Math.abs(dx) / 300)); } } });
    const end = (e) => {
      if (!s) return; const dx = e.clientX - s.x, dy = e.clientY - s.y; const l = el.querySelector(".d-left");
      if (l) { l.style.transition = ""; l.style.transform = ""; l.style.opacity = ""; }
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5 && Q.current) { this._swiped = performance.now(); dx < 0 ? Q.next() : Q.prev(); }
      else if (dy < -50 && Math.abs(dy) > Math.abs(dx) && Q.current) { this._swiped = performance.now(); this.openImm(); }
      s = null;
    };
    el.addEventListener("pointerup", end); el.addEventListener("pointercancel", () => { s = null; const l = el.querySelector(".d-left"); if (l) { l.style.transform = ""; l.style.opacity = ""; } });
    el.addEventListener("click", (e) => { if (this._swiped && performance.now() - this._swiped < 400) { e.stopPropagation(); e.preventDefault(); } }, true);
  },
  /* liste de titres : glisser un titre vers la droite pour le mettre « à suivre » */
  bindRowSwipe() {
    const view = $("#view"); let s = null;
    view.addEventListener("pointerdown", (e) => { const row = e.target.closest(".row"); if (e.pointerType !== "touch" || !row || e.target.closest("button")) { s = null; return; } s = { row, x: e.clientX, y: e.clientY, dir: null }; });
    view.addEventListener("pointermove", (e) => {
      if (!s) return; const dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (!s.dir && Math.hypot(dx, dy) > 10) s.dir = Math.abs(dx) > Math.abs(dy) * 1.4 && dx > 0 ? "x" : "y";
      if (s.dir === "x") { s.row.classList.add("swiping"); s.row.style.translate = `${Math.min(dx, 140) * .8}px 0`; s.row.classList.toggle("swipe-ok", dx > 90); }
    });
    const end = (e) => {
      if (!s) return; const { row, dir } = s, dx = e.clientX - s.x; s = null;
      row.style.translate = ""; row.classList.remove("swiping", "swipe-ok");
      if (dir !== "x") return;
      this._swiped = performance.now();
      if (dx > 90) { const c = rowCtx(row); if (c) { Q.addNext([c.id]); const t = L.tracks.get(c.id); toast(`« ${t ? t.title : "Titre"} » joue juste après.`); row.animate([{ background: "color-mix(in srgb, var(--c2) 30%, transparent)" }, { background: "transparent" }], { duration: 600 }); } }
    };
    view.addEventListener("pointerup", end); view.addEventListener("pointercancel", () => { if (s) { s.row.style.translate = ""; s.row.classList.remove("swiping", "swipe-ok"); } s = null; });
    view.addEventListener("click", (e) => { if (this._swiped && performance.now() - this._swiped < 400 && e.target.closest(".row")) { e.stopPropagation(); e.preventDefault(); } }, true);
  },
  renderImmQueue() { const q = $("#imm .imm-queue"); if (q) { q.hidden = !this.immQueue; if (this.immQueue) setHTML(q, this.queueHTML(Q.upcoming(40))); } },

  mediaSession(t) {
    if (NativeMedia) { if (Player.mode !== "native") NativeMedia.track(t); return; }
    const ms = navigator.mediaSession; if (!ms) return;
    try {
      ms.metadata = t ? new MediaMetadata({ title: t.title, artist: t.artist, album: t.album || "", artwork: artBig(t.artKey) ? [{ src: artBig(t.artKey), sizes: "640x640", type: "image/webp" }] : [] }) : null;
      if (!this._msBound) {
        this._msBound = true;
        ms.setActionHandler("play", () => Player.play()); ms.setActionHandler("pause", () => Player.pause());
        ms.setActionHandler("previoustrack", () => Q.prev()); ms.setActionHandler("nexttrack", () => Q.next());
        ms.setActionHandler("seekto", (d) => Player.seek(d.seekTime));
        try { ms.setActionHandler("seekbackward", (d) => Player.seek(Player.currentTime - (d.seekOffset || 10))); ms.setActionHandler("seekforward", (d) => Player.seek(Player.currentTime + (d.seekOffset || 10))); } catch { /* facultatif */ }
      }
    } catch { /* non pris en charge */ }
  },
};
