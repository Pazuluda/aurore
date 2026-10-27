/* ===================== actions & démarrage ===================== */
function listOf(el) { const w = el.closest("[data-list]"); return w ? LISTS.get(w.dataset.list) : null; }
function rowCtx(el) { const row = el.closest(".row"); const list = listOf(el); if (!row || !list) return null; const i = +row.dataset.row; return { i, id: list.ids[i], list, row }; }
function playRow(c) {
  if (c.id === Q.current && Player.id) return Player.toggle();
  Q.playList(c.list.ids, c.i, c.list.opts.label || "", c.list.opts.ref || null);
}
function toggleLike(id) {
  if (NP && NP.ok) NP.exportSoon();
  if (!id) return;
  if (L.likes.has(id)) { L.likes.delete(id); toast("Retiré des titres likés."); }
  else { L.likes.add(id); toast("Ajouté aux titres likés."); }
  saveLikes(); UI.syncControls(); UI.renderNav();
  if (UI.view.name === "list" && UI.view.param === "liked") UI.rerender(); else UI.refreshRowsHard();
}
UI.refreshRowsHard = function () {
  for (const row of $$("#view .row")) { const list = listOf(row); if (!list) continue; const i = +row.dataset.row; const tmp = document.createElement("div"); setHTML(tmp, rowHTML(list.ids[i], i, list.opts)); row.replaceWith(tmp.firstElementChild); }
};
function newPlaylist(ids = [], open = true) {
  const n = L.playlists.length + 1;
  const p = { id: "p" + Date.now().toString(36), name: `Ma playlist n° ${n}`, ids: [...ids], created: Date.now() };
  L.playlists.push(p); savePlaylists(); UI.renderNav();
  if (open) { UI.editing = p.id; UI.go("list", p.id); setTimeout(() => { const i = $("#pl-title"); if (i) { i.focus(); i.select(); } }, 30); }
  return p;
}
function addToPlaylist(p, ids) {
  const before = p.ids.length; for (const id of ids) if (!p.ids.includes(id)) p.ids.push(id);
  savePlaylists(); UI.renderNav();
  const added = p.ids.length - before;
  toast(added ? `${plural(added, "titre ajouté", "titres ajoutés")} à « ${p.name} ».` : `Déjà dans « ${p.name} ».`);
  if (UI.view.name === "list" && UI.view.param === p.id) UI.rerender();
}
function playlistSub(ids) {
  return () => [{ title: "Ajouter à…" }, { icon: "plus", label: "Nouvelle playlist", fn: () => { const p = newPlaylist(ids, false); toast(`Playlist « ${p.name} » créée.`, { action: { label: "Ouvrir", fn: () => UI.go("list", p.id) } }); } }, ...(L.playlists.length ? ["sep"] : []), ...L.playlists.map((p) => ({ icon: "music", label: p.name, fn: () => addToPlaylist(p, ids) }))];
}
/* envoyer plusieurs titres d'un coup (album, playlist, artiste, humeur…) */
function sendItems(ids) {
  const out = [];
  if (LanPC && LanPC.hasPhone) { const n = ids.filter((id) => L.files.get(id)?.abs).length; if (n) out.push({ icon: "send", label: `Envoyer au téléphone (${n})`, fn: () => LanPC.send(ids) }); }
  if (LanPhone && LanPhone.pc) { const n = ids.filter((id) => L.files.get(id)?.media).length; if (n) out.push({ icon: "send", label: `Envoyer au PC (${n})`, fn: () => LanPhone.send(ids) }); }
  return out.length ? ["sep", ...out] : [];
}
function trackMenu(at, id, list) {
  const t = L.tracks.get(id); if (!t) return;
  const items = [
    { icon: "playnext", label: "Lire ensuite", fn: () => { Q.addNext([id]); toast("Sera lu juste après."); } },
    { icon: "addq", label: "Ajouter à la file d'attente", fn: () => { Q.addEnd([id]); toast("Ajouté à la file d'attente."); } },
    { icon: "plus", label: "Ajouter à une playlist", sub: playlistSub([id]) },
    { icon: "heart", label: L.likes.has(id) ? "Retirer des titres likés" : "Ajouter aux titres likés", fn: () => toggleLike(id) },
    "sep",
  ];
  if (t.albumKey && !(UI.view.name === "album" && UI.view.param === t.albumKey)) items.push({ icon: "disc", label: "Aller à l'album", fn: () => UI.go("album", t.albumKey) });
  for (const a of t.artists.slice(0, 3)) items.push({ icon: "artist", label: `Aller à ${a}`, fn: () => UI.go("artist", norm(a)) });
  items.push({ icon: "sparkles", label: "Artistes proches", fn: () => discoverFrom(t.artists[0]) });
  if (LanPC && LanPC.hasPhone && L.files.get(id)?.abs) items.push({ icon: "send", label: "Envoyer au téléphone", fn: () => LanPC.send([id]) });
  if (LanPhone && LanPhone.pc && L.files.get(id)?.media) items.push({ icon: "send", label: `Envoyer au PC`, fn: () => LanPhone.send([id]) });
  items.push("sep", { icon: "pencil", label: "Modifier les infos", fn: () => Edit.openTrack(id) });
  if (list && list.opts.playlist) { const p = L.playlists.find((x) => x.id === list.opts.playlist); if (p) items.push("sep", { icon: "trash", label: "Retirer de cette playlist", fn: () => { p.ids = p.ids.filter((x) => x !== id); savePlaylists(); UI.renderNav(); UI.rerender(); toast("Retiré de la playlist."); } }); }
  Menu.open(at, items);
}
function discoverFrom(name) { Disc.seed = name || ""; UI.stack = []; UI.go("discover", null, { push: false }); if (Disc.api && Disc.state !== "loading") Disc.run(true); }

const ACTIONS = {
  nav: (el) => { UI.stack = []; UI.go(el.dataset.view, null, { push: false }); if (el.dataset.id === "saved") setTimeout(() => $("#saved")?.scrollIntoView({ behavior: "smooth" }), 60); },
  back: () => UI.back(),
  "import-dir": (el) => {
    if (NATIVE_WIN) return Menu.open(el, [{ icon: "plus", label: "Ajouter des titres…", fn: () => $("#pick-files").click() }, { icon: "files", label: "Suivre un dossier existant…", fn: () => nativePickFolder() }, "sep", { icon: "folder", label: "Ouvrir mon dossier aurore", fn: () => openLibraryFolder() }]);
    if (!IS_MOBILE) return openFolder();
    if (AndroidMusic) return Menu.open(el, [{ icon: "search", label: "Rechercher la musique du téléphone", fn: () => AndroidMusic.find() }, { icon: "files", label: "Choisir des fichiers…", fn: () => $("#pick-files").click() }]);
    if (IS_IOS || CAP) return $("#pick-files").click();
    Menu.open(el, [{ icon: "files", label: "Choisir des titres", fn: () => $("#pick-files").click() }, { icon: "folder", label: "Choisir un dossier entier", fn: () => $("#pick-dir").click() }]);
  },
  install: () => Install.run(),
  upd: () => Updates.click(),
  "upd-check": () => Updates.check(true),
  "import-files": () => $("#pick-files").click(),
  reopen: () => reopenFolder(),
  demo: (el) => loadDemo(el),
  settings: () => openSettings(),
  "open-album": (el) => UI.go("album", el.dataset.key),
  "open-artist": (el) => UI.go("artist", el.dataset.key),
  "open-list": (el) => UI.go("list", el.dataset.id),
  "play-album": (el) => playAlbum(el.dataset.key),
  "play-ctx": (el) => playCtx(el.dataset.ctx),
  "shuffle-ctx": (el) => playCtx(el.dataset.ctx, { shuffle: true }),
  "row-play": (el) => { const c = rowCtx(el); if (c) playRow(c); },
  "row-menu": (el) => { const c = rowCtx(el); if (c) trackMenu(el, c.id, c.list); },
  like: (el) => { const c = rowCtx(el); if (c) toggleLike(c.id); },
  "like-current": () => toggleLike(Q.current),
  "like-many": (el) => { const c = ctxResolve(el.dataset.ctx); if (!c) return; const all = c.ids.every((id) => L.likes.has(id)); for (const id of c.ids) all ? L.likes.delete(id) : L.likes.add(id); saveLikes(); toast(all ? "Retiré des titres likés." : `${plural(c.ids.length, "titre liké", "titres likés")}.`); UI.renderNav(); UI.rerender(); },
  "ctx-menu": (el) => { const c = ctxResolve(el.dataset.ctx); if (!c) return; Menu.open(el, [{ icon: "playnext", label: "Lire ensuite", fn: () => { Q.addNext(c.ids); toast("Sera lu juste après."); } }, { icon: "addq", label: "Ajouter à la file d'attente", fn: () => { Q.addEnd(c.ids); toast(`${plural(c.ids.length, "titre ajouté", "titres ajoutés")} à la file.`); } }, { icon: "plus", label: "Ajouter à une playlist", sub: playlistSub(c.ids) }, ...sendItems(c.ids), ...(el.dataset.ctx.startsWith("album:") ? ["sep", { icon: "pencil", label: "Modifier l'album", fn: () => Edit.openAlbum(el.dataset.ctx.slice(6)) }] : [])]); },
  sort: (el) => { const k = el.dataset.key; const s = UI.trackSort; UI.trackSort = k === "default" ? { key: "default", dir: 1 } : s.key === k ? { key: k, dir: -s.dir } : { key: k, dir: k === "plays" || k === "added" ? -1 : 1 }; store.set("trackSort", UI.trackSort); UI.rerender(); },
  "album-sort": (el) => { UI.albumSort = el.dataset.key; store.set("albumSort", UI.albumSort); UI.rerender(); },
  "album-genre": (el) => { UI.albumGenre = el.dataset.key || null; UI.rerender(); },
  "artist-sort": (el) => { UI.artistSort = el.dataset.key; UI.rerender(); },
  "artist-all": (el) => { UI.artistAll = UI.artistAll === el.dataset.key ? null : el.dataset.key; UI.rerender(); },
  "toggle-play": () => { if (!Player.id && Q.current) { if (L.files.has(Q.current)) Q.go(Q.current); else UI.needFiles(); return; } Player.toggle(); },
  next: () => Q.next(), prev: () => Q.prev(),
  shuffle: () => Q.toggleShuffle(), repeat: () => Q.cycleRepeat(),
  mute: () => Player.toggleMute(),
  "toggle-np": () => UI.toggleNP(),
  "show-queue": () => { if (isPhone()) { UI.openImm(); UI.immQueue = true; UI.renderImm(); } else UI.toggleNP(true); },
  immersive: () => UI.openImm(),
  "open-imm-phone": () => { if (isPhone() && Q.current) UI.openImm(); },
  "close-imm": () => UI.closeImm(),
  "viz-mode": (el) => {
    Viz.mode = el.dataset.mode; store.set("vizMode", Viz.mode); Viz.particles.length = 0; Viz.sparks.length = 0; Viz.land.length = 0;
    const c = $("#imm canvas"); if (c) c.getContext("2d").clearRect(0, 0, c.width, c.height);
    for (const b of $$("#imm [data-act='viz-mode']")) b.setAttribute("aria-pressed", b.dataset.mode === Viz.mode);
    const m = VIZ_MODES.find((x) => x[0] === Viz.mode), p = $("#imm .viz-pick"); if (p && m) setHTML(p, html`${icon(m[2], "sm")}<span>${m[1]}</span>`);
    Viz.kick();
  },
  "viz-menu": (el) => Menu.open(el, [{ title: "Visualiseur" }, ...VIZ_MODES.map(([k, l, ic]) => ({ icon: Viz.mode === k ? "check" : ic, label: l, fn: () => ACTIONS["viz-mode"]({ dataset: { mode: k } }) }))]),
  "imm-queue": () => { UI.immQueue = !UI.immQueue; UI.renderImmQueue(); const b = $("#imm [data-act='imm-queue']"); if (b) { b.classList.toggle("on", UI.immQueue); b.setAttribute("aria-pressed", UI.immQueue); } },
  "q-jump": (el) => Q.jumpTo(+el.dataset.pos),
  "q-manual": (el) => Q.playManual(+el.dataset.i),
  "q-remove": (el) => { Q.manual.splice(+el.dataset.i, 1); UI.onQueueChanged(); },
  "q-clear": () => { Q.manual = []; UI.onQueueChanged(); },
  noop: () => {},
  "new-playlist": () => newPlaylist(),
  "rename-list": (el) => { UI.editing = el.dataset.id; UI.render(); const i = $("#pl-title"); if (i) { i.focus(); i.select(); } },
  "list-menu": (el) => { const id = el.dataset.id; Menu.open(el, [{ icon: "pencil", label: "Renommer", fn: () => ACTIONS["rename-list"]({ dataset: { id } }) }, { icon: "addq", label: "Ajouter à la file d'attente", fn: () => { const s = listSpec(id); Q.addEnd(s.ids); toast("Ajouté à la file d'attente."); } }, ...sendItems(listSpec(id).ids), "sep", { icon: "trash", label: "Supprimer la playlist", fn: () => { UI.confirmDelete = id; UI.rerender(); } }]); },
  "delete-list": (el) => { const id = el.dataset.id; const p = L.playlists.find((x) => x.id === id); L.playlists = L.playlists.filter((x) => x.id !== id); savePlaylists(); UI.confirmDelete = null; UI.stack = []; UI.go("home", null, { push: false }); toast(`Playlist « ${p ? p.name : ""} » supprimée.`, { action: { label: "Annuler", fn: () => { if (p) { L.playlists.push(p); savePlaylists(); UI.renderNav(); } } } }); },
  "cancel-delete": () => { UI.confirmDelete = null; UI.rerender(); },
  "disc-run": (el) => Disc.run(el.dataset.fresh === "1"),
  "disc-stop": () => Disc.stop(),
  "disc-mood": (el) => { Disc.mood = el.dataset.key; UI.rerender(); },
  "disc-seed-clear": () => { Disc.seed = ""; UI.rerender(); },
  "discover-from": (el) => discoverFrom(el.dataset.key),
  "save-artist": (el) => { const it = Disc.items[+el.dataset.i]; if (!it || L.saved.some((x) => norm(x.artist) === norm(it.artist))) return; L.saved.push({ ...it, savedAt: Date.now() }); saveSaved(); UI.renderNav(); toast(`${it.artist} est dans ta liste À découvrir.`); UI.rerender(); },
  "unsave-artist": (el) => { L.saved.splice(+el.dataset.i, 1); saveSaved(); UI.renderNav(); UI.rerender(); },
  "dismiss-artist": (el) => { const i = +el.dataset.i; const it = Disc.items[i]; if (!it) return; Disc.items.splice(i, 1); DB.put("kv", "disc", { items: Disc.items, mood: Disc.mood, seed: Disc.seed }); UI.rerender(); },
  "close-sheet": () => closeSheet(),
  "set-memo": () => { L.memorize = !L.memorize; DB.put("kv", "memorize", L.memorize); store.set("askedMemo", true); if (L.memorize) { memorizeFiles(); toast("Ta musique sera gardée dans le lecteur."); } else { forgetFiles(); toast("Copie supprimée. Ton dossier reste la source."); } openSettings(); UI.onLibraryProgress(); },
  "set-calm": () => { setCalm(!Viz.calm); openSettings(); },
  "auto-guide": () => { closeSheet(); Guide.open(0); },
  "guide-close": () => Guide.close(),
  "guide-next": () => Guide.go(1),
  "guide-prev": () => Guide.go(-1),
  "guide-open-auto": () => Guide.openAuto(),
  "set-norm": () => { Fx.setNorm(!Fx.norm); openSettings(); },
  "eq-open": () => openEq(),
  "eq-toggle": () => { Fx.setOn(!Fx.eqOn); openEq(); },
  "eq-preset": (el) => { const p = EQ_PRESETS.find((x) => x[0] === el.dataset.v); if (p) { if (!Fx.eqOn) Fx.setOn(true); Fx.set(p[2], p[0]); openEq(); } },
  "edit-nopic": () => { const d = new FormData($("#edit-form")); Edit.reset(); Edit.dropPic = true; Edit.render(d.get("title"), d.get("artist"), d.get("album"), d.get("year"), d.get("genre"), ""); },
  "edit-undo": () => Edit.undo(),
  "edit-recrop": () => Edit.recrop(Edit._artKey),
  "lan-open": () => (LanPC || LanPhone).open(),
  "lan-code": async () => { await NATIVE_WIN.lan.code(); LanPC.refresh(); LanPC.open(); },
  "lan-stop": async () => { await NATIVE_WIN.lan.stop(); LanPC.open(); },
  "lan-forget": async (el) => { await NATIVE_WIN.lan.forget(el.dataset.id); await LanPC.refresh(); LanPC.open(); },
  "lan-find": () => LanPhone.find(),
  "lan-pick": (el) => LanPhone.pick(el),
  "lan-sync": async () => { try { if (!(await LanPhone.reach())) return toast(`${LanPhone.pc.name} est introuvable : ouvre aurore sur le PC, sur le même Wi-Fi.`); await LanPhone.sync(false); LanPhone.openPaired(); } catch { toast("La synchro n'a pas marché."); } },
  "lan-receive": async () => { try { if (!(await LanPhone.reach())) return toast(`${LanPhone.pc.name} est introuvable.`); await LanPhone.receive(false); } catch { toast("Réception impossible pour l'instant."); } },
  "lan-unpair": () => { LanPhone.pc = null; store.set("pc", null); closeSheet(); toast("PC oublié. Tu peux l'associer à nouveau quand tu veux."); },
  "remote-open": () => LanPhone.remote(),
  rm: (el) => LanPhone.cmd(el.dataset.cmd),
  "theme-bg": (el) => { Theme.set(el.dataset.v); openSettings(); },
  "theme-accent": (el) => { Theme.set(null, el.dataset.v); openSettings(); },
  "set-clear": () => { UI.confirmClear = true; openSettings(); },
  "drop-missing": () => { const ids = [...L.tracks.keys()].filter((id) => !L.files.has(id) && !L.tracks.get(id).demo); removeTracks(ids); UI.onLibraryChanged(); toast(`${plural(ids.length, "titre retiré", "titres retirés")} de la bibliothèque.`); },
  "folder-add": async () => { closeSheet(); await nativePickFolder(); },
  "open-library": () => openLibraryFolder(),
  "media-find": () => AndroidMusic && AndroidMusic.find(),
  "pick-folder": () => nativePickFolder(),
  "open-folder": (el) => NATIVE_WIN.openPath(el.dataset.dir),
  "paths-copy": () => { const p = UI.pendingPaths || []; UI.pendingPaths = null; closeSheet(); nativeImportPaths(p, "copy"); },
  "paths-link": () => { const p = UI.pendingPaths || []; UI.pendingPaths = null; closeSheet(); nativeImportPaths(p, "link"); },
  "folder-remove": async (el) => { await NATIVE_WIN.removeFolder(el.dataset.dir); await nativeScan({ quiet: true }); if (!(await NATIVE_WIN.getFolders()).length) { removeTracks([...L.tracks.keys()].filter((id) => L.files.get(id)?.disk || !L.files.has(id))); UI.onLibraryChanged(); } openSettings(); },
  "set-clear-yes": async () => { UI.confirmClear = false; closeSheet(); if (NATIVE_WIN) for (const d of await NATIVE_WIN.getFolders()) await NATIVE_WIN.removeFolder(d); await clearLibrary(); Q.ctx = []; Q.order = []; Q.manual = []; Q.current = null; Q.pos = -1; store.set("q", null); UI.setTrackInfo(null); UI.stack = []; UI.go("home", null, { push: false }); UI.onLibraryProgress(); toast("Bibliothèque vidée. Tes fichiers sont intacts."); },
  "set-clear-no": () => { UI.confirmClear = false; openSettings(); },
  keys: () => openKeys(),
};

/* ---- installation (PWA) ---- */
const Install = {
  evt: null,
  get iosHint() { return IS_IOS && !isStandalone() && !IN_FRAME; },
  get visible() { return !isStandalone() && !store.get("installHidden", false) && (!!this.evt || this.iosHint || (IN_FRAME && !!APP_URL)); },
  init() {
    window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); this.evt = e; this.refresh(); });
    window.addEventListener("appinstalled", () => { this.evt = null; this.refresh(); toast("aurore est installée : retrouve-la avec tes autres apps."); });
    this.refresh();
  },
  refresh() {
    const slot = $("#install-slot"); if (slot) setHTML(slot, this.visible ? (this.evt || this.iosHint ? html`<button class="btn sm primary" data-act="install" style="width:100%">${icon("save", "sm")} Installer l'app</button>` : html`<a class="btn sm" href="${APP_URL}" target="_blank" rel="noopener" style="width:100%">${icon("external", "sm")} Version à installer</a>`) : "");
    if (UI.view.name === "home") UI.rerender();
  },
  async run() {
    if (this.evt) { const e = this.evt; e.prompt(); try { await e.userChoice; } catch { /* ignoré */ } this.evt = null; this.refresh(); return; }
    if (this.iosHint) openSheet(html`<div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><h2>Installer sur iPhone</h2><button class="icon-btn" data-act="close-sheet" aria-label="Fermer">${icon("x")}</button></div>
<ol class="steps-ios"><li>Ouvre cette page dans <b>Safari</b>.</li><li>Touche le bouton <b>Partager</b> (le carré avec une flèche vers le haut).</li><li>Choisis <b>Sur l'écran d'accueil</b>, puis <b>Ajouter</b>.</li></ol>
<p class="note">aurore s'ouvrira ensuite en plein écran, comme une vraie app.</p>`);
  },
};
function setCalm(v) {
  Viz.calm = v; store.set("calm", v);
  document.documentElement.classList.toggle("calm", v);
  UI.syncControls();
}
function openSheet(content) { const s = $("#sheet"); setHTML(s, html`<div class="sheet-card" role="dialog" aria-modal="true">${content}</div>`); s.hidden = false; const f = s.querySelector("button"); f && f.focus(); }
function closeSheet() { const s = $("#sheet"); s.hidden = true; s.innerHTML = ""; UI.confirmClear = false; }
async function openSettings() {
  const bytes = libraryBytes();
  const folders = NATIVE_WIN ? await NATIVE_WIN.getFolders().catch(() => []) : null;
  openSheet(html`<div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><h2>Réglages</h2><button class="icon-btn" data-act="close-sheet" aria-label="Fermer">${icon("x")}</button></div>
<div style="margin-top:10px">
<div class="set-row theme-row"><div style="min-width:0;flex:1"><b>Fond</b>
  <div class="theme-bgs" role="radiogroup" aria-label="Fond">${BACKGROUNDS.map(([k, l, d]) => html`<button class="theme-bg tb-${k}" role="radio" aria-checked="${String(Theme.bg === k)}" data-act="theme-bg" data-v="${k}"><span class="tb-prev" aria-hidden="true"><i></i><i></i><i></i></span><b>${l}</b><small>${d}</small></button>`)}</div>
  <b style="display:block;margin-top:16px">Couleurs</b><p>${Theme.accent === "pochette" ? "Elles changent avec la pochette du titre en cours." : "Les mêmes couleurs pour tous les titres."}</p>
  <div class="theme-acc" role="radiogroup" aria-label="Couleurs">${Object.entries(ACCENTS).map(([k, a]) => html`<button role="radio" aria-checked="${String(Theme.accent === k)}" data-act="theme-accent" data-v="${k}" title="${a.name}"><span class="sw${k === "pochette" ? " auto" : ""}" style="${a.c1 ? `background:conic-gradient(${a.c1} 0 120deg, ${a.c2} 0 240deg, ${a.c3} 0)` : ""}"></span><small>${a.name}</small></button>`)}</div>
</div></div>
${NATIVE_WIN ? html`<div class="set-row" style="align-items:flex-start"><div style="min-width:0;flex:1"><b>Mes dossiers de musique</b><p>aurore les surveille : ajoute ou supprime de la musique dedans, la bibliothèque suit toute seule.</p>${folders.map((d) => { const lib = d === NATIVE_LIBRARY; return html`<div class="folder-row"><span class="mono" title="${d}">${lib ? html`<b>Dossier aurore</b> · ` : ""}${d}</span><button class="icon-btn" data-act="open-folder" data-dir="${d}" aria-label="Ouvrir dans l'Explorateur" title="Ouvrir dans l'Explorateur">${icon("external", "sm")}</button>${lib ? "" : html`<button class="icon-btn" data-act="folder-remove" data-dir="${d}" aria-label="Ne plus suivre ce dossier" title="Ne plus suivre">${icon("x", "sm")}</button>`}</div>`; })}</div><button class="btn sm" data-act="folder-add">${icon("plus", "sm")} Suivre un dossier</button></div>` : ""}
${IS_NATIVE ? "" : html`<div class="set-row"><div><b>Garder ma musique dans le lecteur</b><p>Copie tes fichiers (${bytes ? fmtBytes(bytes) : "0 Ko"}) dans le stockage du navigateur pour ne plus avoir à rouvrir ton dossier. Tes originaux ne bougent pas.${L.memorizing ? ` En cours : ${L.memorizing.done}/${L.memorizing.total}.` : ""}</p></div><button class="switch" role="switch" aria-checked="${String(L.memorize)}" data-act="set-memo" aria-label="Garder ma musique dans le lecteur"></button></div>`}
<div class="set-row"><div><b>Égaliseur</b><p>${Fx.eqOn ? `Activé : ${(EQ_PRESETS.find((p) => p[0] === Fx.preset) || ["", "Perso"])[1]}.` : "Désactivé."} Basses, voix, aigus… sur 6 bandes.</p></div><button class="btn sm" data-act="eq-open">${icon("eq", "sm")} Régler</button></div>
<div class="set-row"><div><b>Volume égalisé</b><p>Tous les titres au même volume, plus de sursaut d'un morceau à l'autre. <span id="an-status">${anStatus()}</span></p></div><button class="switch" role="switch" aria-checked="${String(Fx.norm)}" data-act="set-norm" aria-label="Volume égalisé"></button></div>
<div class="set-row"><div><b>Animations douces</b><p>Fond fixe, pochette qui ne tourne plus, pas de pulsation. Le spectre reste.</p></div><button class="switch" role="switch" aria-checked="${String(Viz.calm)}" data-act="set-calm" aria-label="Animations douces"></button></div>
${Install.visible ? html`<div class="set-row"><div><b>Installer l'app</b><p>${IS_MOBILE ? "Icône sur l'écran d'accueil, plein écran, musique écran verrouillé." : "Sa propre fenêtre et ton dossier retrouvé tout seul à chaque lancement."}</p></div>${Install.evt || Install.iosHint ? html`<button class="btn sm primary" data-act="install">Installer</button>` : html`<a class="btn sm" href="${APP_URL}" target="_blank" rel="noopener">Ouvrir</a>`}</div>` : ""}
${IS_MOBILE ? "" : html`<div class="set-row"><div><b>Raccourcis clavier</b><p>Espace, flèches, F pour le mode immersif…</p></div><button class="btn sm" data-act="keys">${icon("keyboard", "sm")} Voir</button></div>`}
${AndroidMusic ? html`<div class="set-row"><div><b>Musique du téléphone</b><p>${AndroidMusic.perm === "granted" ? `aurore cherche les nouveautés à chaque ouverture (${plural(AndroidMusic.count, "titre trouvé", "titres trouvés")}). Les mémos vocaux, sonneries et messages WhatsApp sont ignorés.` : "aurore n'a pas accès à ta musique : autorise-la pour qu'elle trouve tout seule tes titres."}</p></div><button class="btn sm${AndroidMusic.perm === "granted" ? "" : " primary"}" data-act="media-find">${icon(AndroidMusic.perm === "granted" ? "refresh" : "search", "sm")} ${AndroidMusic.perm === "granted" ? "Rechercher" : "Autoriser"}</button></div>` : ""}
${LanPC ? html`<div class="set-row"><div><b>Ton téléphone</b><p>Télécommande, échange de titres, mêmes playlists, likes et statistiques, sur le Wi-Fi de la maison.</p></div><button class="btn sm${LanPC.hasPhone ? "" : " primary"}" data-act="lan-open">${icon("phone", "sm")} ${LanPC.hasPhone ? "Gérer" : "Associer"}</button></div>` : ""}
${LanPhone ? html`<div class="set-row"><div><b>Mon PC</b><p>${LanPhone.pc ? `Associé à ${LanPhone.pc.name} : télécommande, échange de titres, synchro.` : "Pilote la musique de ton PC, échangez des titres, gardez les mêmes playlists, likes et stats (même Wi-Fi)."}</p></div><button class="btn sm${LanPhone.pc ? "" : " primary"}" data-act="lan-open">${icon("monitor", "sm")} ${LanPhone.pc ? "Ouvrir" : "Associer"}</button></div>` : ""}
${CAP ? html`<div class="set-row"><div><b>Widget sur l'écran d'accueil</b><p>Appuie longuement sur un espace vide de l'écran d'accueil, choisis « Widgets », puis aurore : pochette, titre et boutons, sans ouvrir l'app.</p></div></div>` : ""}
${CAP ? html`<div class="set-row"><div><b>Android Auto</b><p>Retrouve tes playlists, albums et artistes sur l'écran de ta voiture. Un réglage à faire une seule fois, montré pas à pas.</p></div><button class="btn sm primary" data-act="auto-guide">${icon("car", "sm")} Voir le guide</button></div>` : ""}
${IS_NATIVE ? "" : html`<div class="set-row"><div><b>Apps Windows et Android</b><p>La même app, sans navigateur : installateur pour ton PC et APK pour ton téléphone.</p></div><a class="btn sm" href="${RELEASES_URL}" target="_blank" rel="noopener">${icon("external", "sm")} Télécharger</a></div>`}
${IS_NATIVE ? html`<div class="set-row"><div><b>Version ${Updates.current || APP_VERSION}</b><p>${NATIVE_WIN ? "aurore vérifie les mises à jour à chaque démarrage et les télécharge toute seule." : "aurore vérifie les mises à jour à chaque démarrage."}</p></div><button class="btn sm" data-act="upd-check">${icon("refresh", "sm")} Rechercher</button></div>` : ""}
<div class="set-row"><div><b>Vider la bibliothèque</b><p>${NATIVE_WIN ? "Oublie tes dossiers, les titres et les pochettes. Tes playlists, likes et statistiques restent. Rien n'est supprimé de ton ordinateur." : CAP ? "Oublie les titres, pochettes et copies gardées dans l'app. Tes playlists, likes et statistiques restent. Les fichiers de ton téléphone ne sont pas touchés." : "Oublie les titres, pochettes et copies. Tes playlists, likes et statistiques restent. Rien n'est supprimé de ton ordinateur."}</p></div>${UI.confirmClear ? html`<span style="display:flex;gap:6px"><button class="btn sm danger" data-act="set-clear-yes">Vider</button><button class="btn sm ghost" data-act="set-clear-no">Annuler</button></span>` : html`<button class="btn sm danger" data-act="set-clear">Vider</button>`}</div>
</div>`);
}
function anStatus() { const left = An.total - An.done; return left > 0 ? `Analyse en cours : ${An.done} / ${An.total} titres.` : An.done ? `${plural(An.done, "titre analysé", "titres analysés")}.` : ""; }
/* égaliseur : préréglages, 6 curseurs, courbe */
function eqCurve() {
  const W = 320, H = 90, fs = Array.from({ length: 80 }, (_, i) => 30 * Math.pow(16000 / 30, i / 79)), r = Fx.response(fs);
  const pts = fs.map((f, i) => `${(i / 79 * W).toFixed(1)},${(H / 2 - clamp(r[i], -14, 14) / 14 * (H / 2 - 6)).toFixed(1)}`).join(" ");
  return html`<svg class="eq-curve" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" class="eq-zero"/><polyline points="${pts} ${W},${H} 0,${H}" class="eq-fill"/><polyline points="${pts}" class="eq-line"/></svg>`;
}
function openEq() {
  const lbl = (f) => (f >= 1000 ? f / 1000 + " k" : f) + "";
  openSheet(html`<div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><h2>Égaliseur</h2><span style="display:flex;gap:8px;align-items:center"><button class="switch" role="switch" aria-checked="${String(Fx.eqOn)}" data-act="eq-toggle" aria-label="Activer l'égaliseur"></button><button class="icon-btn" data-act="close-sheet" aria-label="Fermer">${icon("x")}</button></span></div>
<div class="eqz${Fx.eqOn ? "" : " off"}">
  <div class="eq-presets" role="radiogroup" aria-label="Préréglages">${EQ_PRESETS.map(([k, n]) => html`<button role="radio" aria-checked="${String(Fx.eqOn && Fx.preset === k)}" data-act="eq-preset" data-v="${k}">${n}</button>`)}${Fx.preset === "perso" && Fx.eqOn ? html`<button role="radio" aria-checked="true">Perso</button>` : ""}</div>
  <div class="eq-graph" id="eq-graph">${eqCurve()}</div>
  <div class="eq-bands">${EQ_FREQS.map((f, i) => html`<label class="eq-band"><span class="mono eq-val" id="eq-v${i}">${Fx.eq[i] > 0 ? "+" : ""}${Fx.eq[i]}</span><input type="range" min="-12" max="12" step="0.5" value="${Fx.eq[i]}" data-band="${i}" aria-label="${lbl(f)}Hz" style="--p:${((Fx.eq[i] + 12) / 24 * 100).toFixed(1)}%"><span class="mono">${lbl(f)}Hz</span></label>`)}</div>
  <p class="eq-note">${NP && NP.ok ? "Appliqué aussi quand l'app est fermée." : Player.split ? "Sur téléphone dans le navigateur, l'égaliseur ne s'applique pas : installe l'app aurore." : "Les réglages restent d'une écoute à l'autre."}</p>
</div>`);
  for (const inp of $$("#sheet .eq-bands input")) inp.addEventListener("input", () => {
    const eq = Fx.eq.slice(); eq[+inp.dataset.band] = +inp.value; if (!Fx.eqOn) { Fx.eqOn = true; store.set("eqOn", true); $("#sheet .eqz")?.classList.remove("off"); $("#sheet [data-act='eq-toggle']")?.setAttribute("aria-checked", "true"); }
    inp.style.setProperty("--p", ((+inp.value + 12) / 24 * 100).toFixed(1) + "%");
    Fx.set(eq, "perso"); const v = $("#eq-v" + inp.dataset.band); if (v) v.textContent = (eq[+inp.dataset.band] > 0 ? "+" : "") + eq[+inp.dataset.band];
    setHTML($("#eq-graph"), eqCurve()); for (const b of $$("#sheet [data-act='eq-preset']")) b.setAttribute("aria-checked", "false");
  });
}
function openKeys() {
  const k = [["Espace", "Lecture / pause"], ["→ / ←", "Avancer / reculer de 5 s"], ["Maj + → / ←", "Titre suivant / précédent"], ["Ctrl + ↑ / ↓", "Volume"], ["M", "Couper le son"], ["S", "Aléatoire"], ["R", "Répéter"], ["L", "Liker le titre en cours"], ["F", "Mode immersif"], ["1 à 6", "Visualiseur : halo, spectre, onde, paysage, éclats, rétro"], ["/", "Rechercher"], ["Échap", "Fermer"]];
  openSheet(html`<div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><h2>Raccourcis</h2><button class="icon-btn" data-act="close-sheet" aria-label="Fermer">${icon("x")}</button></div><div class="keys">${k.map(([a, b]) => html`<kbd>${a}</kbd><span>${b}</span>`)}</div>`);
}

function bindEvents() {
  document.addEventListener("click", (e) => {
    if (Menu.isOpen && !e.target.closest("#menu")) { Menu.close(); if (e.target.closest("[data-act='row-menu'],[data-act='ctx-menu'],[data-act='list-menu']")) { e.preventDefault(); return; } }
    if (!$("#sheet").hidden && e.target.id === "sheet") return closeSheet();
    const el = e.target.closest("[data-act]");
    const row = e.target.closest("#view .row");
    if (row && (!el || el === row)) {
      const c = rowCtx(row); if (!c) return;
      if (isTouch()) return playRow(c);
      UI.sel = c.id; for (const r of $$("#view .row.sel")) r.classList.remove("sel"); row.classList.add("sel");
      return;
    }
    if (!el) return;
    const fn = ACTIONS[el.dataset.act]; if (!fn) return;
    if (el.tagName === "A") return;
    e.preventDefault(); e.stopPropagation();
    fn(el, e);
  });
  document.addEventListener("dblclick", (e) => {
    const row = e.target.closest("#view .row"); if (!row || e.target.closest("button")) return;
    const c = rowCtx(row); if (c) { window.getSelection()?.removeAllRanges(); playRow(c); }
  });
  document.addEventListener("contextmenu", (e) => {
    const row = e.target.closest("#view .row"); if (!row) return;
    const c = rowCtx(row); if (!c) return; e.preventDefault(); trackMenu({ x: e.clientX, y: e.clientY }, c.id, c.list);
  });
  document.addEventListener("keydown", (e) => {
    const tag = e.target.tagName; const typing = tag === "INPUT" && e.target.type !== "range" || tag === "TEXTAREA" || e.target.isContentEditable;
    if (e.key === "Escape") { if (Menu.isOpen) return Menu.close(); if (!$("#guide").hidden) return Guide.close(); if (!$("#sheet").hidden) return closeSheet(); if (UI.imm) return UI.closeImm(); if (typing) e.target.blur(); return; }
    if (e.target.id === "pl-title" && e.key === "Enter") { e.target.blur(); return; }
    if (typing) return;
    if ((e.key === "Enter" || e.key === " ") && e.target.matches("[role='button'][data-act]")) { e.preventDefault(); e.target.click(); return; }
    if (e.ctrlKey || e.metaKey) {
      if (e.key === "ArrowUp") { e.preventDefault(); Player.setVolume(Player.volume + .05); }
      else if (e.key === "ArrowDown") { e.preventDefault(); Player.setVolume(Player.volume - .05); }
      return;
    }
    if (e.altKey) return;
    const k = e.key;
    if (k === " " && !e.target.closest("button")) { e.preventDefault(); ACTIONS["toggle-play"](); }
    else if (k === "ArrowRight" && tag !== "INPUT") { e.preventDefault(); e.shiftKey ? Q.next() : Player.seek(Player.currentTime + 5); }
    else if (k === "ArrowLeft" && tag !== "INPUT") { e.preventDefault(); e.shiftKey ? Q.prev() : Player.seek(Player.currentTime - 5); }
    else if (k === "m" || k === "M") Player.toggleMute();
    else if (k === "s" || k === "S") Q.toggleShuffle();
    else if (k === "r" || k === "R") Q.cycleRepeat();
    else if (k === "l" || k === "L") toggleLike(Q.current);
    else if (k === "f" || k === "F") UI.imm ? UI.closeImm() : UI.openImm();
    else if (k === "/") { e.preventDefault(); $("#q").focus(); }
    else if (k === "?") openKeys();
    else if (UI.imm && ["1", "2", "3", "4", "5", "6"].includes(k)) ACTIONS["viz-mode"]({ dataset: { mode: VIZ_MODES[+k - 1][0] } });
  });
  document.addEventListener("focusout", (e) => {
    if (e.target.id === "pl-title") {
      const p = L.playlists.find((x) => x.id === UI.editing); const v = e.target.value.trim();
      if (p && v) { p.name = v.slice(0, 80); savePlaylists(); }
      UI.editing = null; UI.renderNav(); setTimeout(() => UI.render(), 0);
    }
  });
  const q = $("#q");
  q.addEventListener("input", debounce(() => {
    const v = q.value.trim();
    if (v) { if (UI.view.name === "search") { UI.view.param = v; UI.render(); } else UI.go("search", v); }
    else if (UI.view.name === "search") UI.back();
  }, 140));
  const sc = $("#scroll");
  sc.addEventListener("scroll", () => $("#main").classList.toggle("scrolled", sc.scrollTop > 4), { passive: true });

  // curseurs (position, volume)
  document.addEventListener("input", (e) => {
    if (e.target.classList.contains("js-seek")) {
      UI.seeking = true; const p = e.target.value / 1000; e.target.style.setProperty("--p", p * 100 + "%");
      for (const el of $$(".js-cur")) el.textContent = fmtTime(p * (Player.duration || 0));
    } else if (e.target.id === "vol") { Player.setVolume(e.target.value / 100); }
  });
  document.addEventListener("change", (e) => {
    if (e.target.classList.contains("js-seek")) { UI.seeking = false; if (Player.id) Player.seek((e.target.value / 1000) * Player.duration); UI.syncTime(); }
  });

  // fichiers
  const fromInput = (inp) => { const files = [...inp.files]; inp.value = ""; return files.map((f) => ({ file: f, path: f.webkitRelativePath || f.name })); };
  $("#pick-dir").addEventListener("change", (e) => { const list = fromInput(e.target); if (list.length) importEntries(list); });
  $("#pick-files").addEventListener("change", (e) => {
    if (NATIVE_WIN && NATIVE_WIN.pathFor) { const paths = [...e.target.files].map((f) => NATIVE_WIN.pathFor(f)).filter(Boolean); e.target.value = ""; if (paths.length) return nativeAddPaths(paths); }
    const list = fromInput(e.target); if (list.length) importEntries(list);
  });
  let depth = 0; const drop = $("#drop");
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
  window.addEventListener("dragenter", (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; drop.hidden = false; });
  window.addEventListener("dragover", (e) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
  window.addEventListener("dragleave", () => { depth = Math.max(0, depth - 1); if (!depth) drop.hidden = true; });
  window.addEventListener("drop", async (e) => {
    if (!hasFiles(e)) return; e.preventDefault(); depth = 0; drop.hidden = true;
    if (NATIVE_WIN && NATIVE_WIN.pathFor) { const paths = [...e.dataTransfer.files].map((f) => NATIVE_WIN.pathFor(f)).filter(Boolean); if (paths.length) return nativeAddPaths(paths); }
    const items = [...(e.dataTransfer.items || [])];
    const entries = items.map((it) => (it.webkitGetAsEntry ? it.webkitGetAsEntry() : null)).filter(Boolean);
    let out = [];
    if (entries.length) { L.importing = { done: 0, total: 0 }; UI.onLibraryProgress(); for (const en of entries) await walkEntry(en, out); L.importing = null; }
    else out = [...e.dataTransfer.files].map((f) => ({ file: f, path: f.name }));
    if (out.length) importEntries(out); else { UI.onLibraryProgress(); toast("Rien de lisible dans ce que tu as déposé."); }
  });

  // lecteur
  Player.on("track", (id) => { UI.setTrackInfo(id); UI.refreshRows(); UI.syncTime(); });
  Player.on("state", () => { UI.syncControls(); UI.refreshRows(); if (Player.playing) { UI.progressLoop(); Viz.kick(); } UI.syncTime(); });
  Player.on("meta", () => UI.syncTime());
  Player.on("seek", () => { UI.syncTime(); if (Q.session) Q.session.last = null; });
  Player.on("volume", () => UI.syncVolume());
  Player.on("ended", () => { Q.flushSession(); Q.next(true); });
  Player.on("error", (id) => {
    const t = L.tracks.get(id);
    toast(`Impossible de lire « ${t ? t.title : "ce titre"} » (${t ? t.codec : "format"} non pris en charge par ce navigateur).`);
    if (Q.ctx.length > 1 || Q.manual.length) setTimeout(() => Q.next(), 600);
  });
  setInterval(() => Q.tick(), 250);
  setInterval(() => { if (Player.playing) Q.save(); }, 5000);
  window.addEventListener("pagehide", () => { Q.flushSession(); Q.saveNow(); });
  matchMedia("(max-width: 1240px)").addEventListener("change", () => { $("#app").classList.remove("np-open"); $("#app").classList.toggle("np-off", !matchMedia("(max-width: 1240px)").matches && !UI.npOpen); });
}

async function boot() {
  for (const [sel, ic] of [["[data-act='new-playlist']", "plus"], ["[data-act='settings']", "sliders"], ["#back-btn", "back"], ["#np-toggle", "panel"]]) for (const el of $$(sel)) setHTML(el, icon(ic, "sm"));
  setHTML($("#search-ic"), icon("search", "sm"));
  setHTML($("#drop-ic"), icon("folder"));
  for (const el of $$("[data-act='import-dir']")) if (!el.closest("#view")) setHTML(el, html`${icon("folder", "sm")}<span class="lbl">Ajouter de la musique</span>`);
  setCalm(store.get("calm", matchMedia("(prefers-reduced-motion: reduce)").matches));
  Theme.apply();
  Player.init();
  UI.buildDock();
  UI.toggleNP(UI.npOpen);
  bindEvents();
  UI.render(); UI.renderNP(); UI.onLibraryProgress();
  await loadLibrary();
  const startView = (location.hash || "").replace("#", "");
  if (["tracks", "albums", "artists", "discover"].includes(startView)) UI.view = { name: startView, param: null };
  UI.render(); UI.onLibraryProgress();
  setTimeout(() => { document.documentElement.classList.add("booted"); setTimeout(() => $("#boot")?.remove(), 600); }, Math.max(0, 900 - performance.now()));
  Q.restore();
  if (NP) await NP.boot(); /* Android : la musique jouait peut-être encore, app fermée */
  UI.bindImmGestures();
  Install.init();
  window.addEventListener("popstate", () => UI.onPop());
  document.addEventListener("visibilitychange", () => { if (!document.hidden && AndroidMusic && AndroidMusic.perm === "granted" && Date.now() - AndroidMusic.lastScan > 30000) AndroidMusic.scan({ quiet: true }); });
  if (CAP) { $("#pick-files").accept = "audio/*"; L.memorize = true; }
  if (NATIVE_WIN) {
    NATIVE_WIN.onOpenFiles(openNativeFiles);
    try { NATIVE_LIBRARY = await NATIVE_WIN.library(); } catch { /* ancienne version */ }
    if (NATIVE_WIN.onChanged) NATIVE_WIN.onChanged(() => nativeScan({ quiet: true }));
    if (!L.tracks.size) UI.render();
  }
  UI.syncControls(); UI.syncTime();
  Disc.init();
  await autoReattach();
  setTimeout(() => An.start(), 2500);
  if (LanPC) { LanPC.init(); LanPC.refresh(); }
  if (LanPhone) { setTimeout(() => LanPhone.auto(), 4000); document.addEventListener("visibilitychange", () => { if (!document.hidden) LanPhone.auto(); }); }
  if (Q.current && !Player.id && L.files.has(Q.current)) { Q.session = { id: Q.current, listened: 0, counted: false, last: null }; Player.load(Q.current, { autoplay: false, startAt: store.get("q", {})?.t || 0 }); }
  Updates.init();
}
/* Windows : fichiers audio lâchés sur l'icône d'aurore */
async function openNativeFiles(list) {
  const entries = (list || []).filter((o) => AUDIO_EXT.has(extOf(o.name))).map((o) => ({ file: new DiskFile(o), path: o.name }));
  if (!entries.length) return;
  while (L.importing) await sleep(200);
  await importEntries(entries, { quiet: true });
  const ids = entries.map((e) => "t" + hash(e.path + "|" + e.file.size)).filter((id) => L.tracks.has(id));
  if (ids.length) Q.playList(ids, 0, ids.length > 1 ? "Fichiers ouverts" : "Fichier ouvert", null);
}
/* app installée sur Windows : « Ouvrir avec aurore » sur un fichier audio */
if ("launchQueue" in window) {
  window.launchQueue.setConsumer(async (params) => {
    if (!params.files || !params.files.length) return;
    const files = []; for (const h of params.files) { try { files.push(await h.getFile()); } catch { /* ignoré */ } }
    const entries = files.filter((f) => AUDIO_EXT.has(extOf(f.name))).map((f) => ({ file: f, path: f.name }));
    if (!entries.length) return;
    while (L.importing) await sleep(200);
    await importEntries(entries);
    const ids = entries.map((e) => "t" + hash(e.path + "|" + e.file.size)).filter((id) => L.tracks.has(id));
    if (ids.length) Q.playList(ids, 0, ids.length > 1 ? "Fichiers ouverts" : "Fichier ouvert", null);
  });
}
if (location.protocol === "file:" || location.hostname === "localhost") window.__aurore = { L, Q, Player, UI, Viz, Disc, importEntries, AndroidMusic, NP, NV, Theme, ACTIONS, closeSheet, Guide, Updates, An, Fx, HUMEURS, Edit, LanPC, LanPhone };
boot();
