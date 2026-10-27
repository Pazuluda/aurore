/* ===================== PC ↔ téléphone, sur le Wi-Fi de la maison ===================== */
/* Le PC (app Windows) sert de point de rendez-vous ; le téléphone (app Android) le trouve, s'y associe
   avec un code, puis : synchronise playlists, likes et statistiques ; reçoit les titres que le PC lui
   envoie ; envoie ses titres au PC ; pilote la musique du PC (télécommande). */

/* ---- empreinte d'un titre : la même sur les deux appareils, même si les fichiers ont un autre nom ---- */
const fpOf = (t) => norm(t.artist || "") + "|" + norm(t.title || "");
function fpIndex() {
  const m = new Map();
  for (const t of L.tracks.values()) { if (t.demo) continue; const k = fpOf(t); if (!m.has(k)) m.set(k, []); m.get(k).push(t.id); }
  return m;
}

/* ---- statistiques des autres appareils (ajoutées aux tiennes, sans double compte) ---- */
function rebuildPeerPlays() {
  L.peerPlays = new Map();
  const idx = fpIndex();
  for (const peer of Object.values(L.peers || {})) for (const [fp, v] of Object.entries(peer.stats || {})) { const ids = idx.get(fp); if (ids) L.peerPlays.set(ids[0], (L.peerPlays.get(ids[0]) || 0) + (v[0] || 0)); }
}

const Sync = {
  device() { let d = store.get("deviceId", ""); if (!d) { d = "d" + Math.random().toString(36).slice(2, 10); store.set("deviceId", d); } return d; },
  state() { return (L.syncState ||= { likes: null, pls: {}, deleted: {}, likeLog: {} }); },
  /* repère ce qui a changé depuis la dernière fois (likes ajoutés ou retirés, playlists modifiées ou supprimées) */
  stamp() {
    const st = this.state(), now = Date.now(), cur = new Set();
    for (const id of L.likes) { const t = L.tracks.get(id); if (t) cur.add(fpOf(t)); }
    if (st.likes) {
      const prev = new Set(st.likes);
      for (const fp of cur) if (!prev.has(fp)) st.likeLog[fp] = [1, now];
      for (const fp of prev) if (!cur.has(fp)) st.likeLog[fp] = [0, now];
    } else for (const fp of cur) st.likeLog[fp] ||= [1, 0];
    st.likes = [...cur];
    const ids = new Set();
    for (const p of L.playlists) {
      ids.add(p.id);
      const fps = this.playlistFps(p), sig = p.name + "§" + fps.join("¤") + (p.smart ? JSON.stringify(p.smart) : "");
      if (st.pls[p.id] !== sig) { st.pls[p.id] = sig; p.updated = now; p.fps = fps; }
    }
    for (const id of Object.keys(st.pls)) if (!ids.has(id)) { delete st.pls[id]; st.deleted[id] = now; }
    DB.put("kv", "syncState", st); savePlaylists();
  },
  playlistFps(p) {
    const out = [], local = new Set();
    for (const id of p.ids) { const t = L.tracks.get(id); if (t) { const fp = fpOf(t); out.push(fp); local.add(fp); } }
    for (const fp of p.fps || []) if (!local.has(fp) && !out.includes(fp)) out.push(fp); /* titres présents seulement sur l'autre appareil */
    return out;
  },
  payload() {
    this.stamp();
    const st = this.state(), stats = {};
    for (const [id, s] of Object.entries(L.stats)) { const t = L.tracks.get(id); if (t && !t.demo && (s.p || s.ms)) { const fp = fpOf(t); const v = (stats[fp] ||= [0, 0]); v[0] += s.p || 0; v[1] += Math.round((s.ms || 0) / 1000); } }
    return { v: 1, device: this.device(), name: IS_MOBILE ? "téléphone" : "PC", likes: st.likeLog, playlists: L.playlists.map((p) => ({ id: p.id, name: p.name, fps: p.smart ? [] : p.fps || this.playlistFps(p), smart: p.smart || null, created: p.created || 0, updated: p.updated || 0 })), deleted: st.deleted, stats };
  },
  merge(r) {
    if (!r || r.v !== 1) return { likes: 0, playlists: 0 };
    const st = this.state(), idx = fpIndex(); let nl = 0, np = 0;
    for (const [fp, [v, ts]] of Object.entries(r.likes || {})) {
      const mine = st.likeLog[fp];
      if (mine && mine[1] >= ts) continue;
      st.likeLog[fp] = [v, ts];
      for (const id of idx.get(fp) || []) { if (v && !L.likes.has(id)) { L.likes.add(id); nl++; } else if (!v && L.likes.has(id)) { L.likes.delete(id); nl++; } }
    }
    const toIds = (fps) => fps.flatMap((fp) => (idx.get(fp) || []).slice(0, 1));
    for (const [id, ts] of Object.entries(r.deleted || {})) {
      if ((st.deleted[id] || 0) < ts) st.deleted[id] = ts;
      const i = L.playlists.findIndex((p) => p.id === id);
      if (i >= 0 && (L.playlists[i].updated || 0) <= ts) { L.playlists.splice(i, 1); delete st.pls[id]; np++; }
    }
    for (const rp of r.playlists || []) {
      if ((st.deleted[rp.id] || 0) >= rp.updated) continue;
      let p = L.playlists.find((x) => x.id === rp.id);
      if (!p) { p = { id: rp.id, name: rp.name, ids: toIds(rp.fps), fps: rp.fps, created: rp.created || Date.now(), updated: rp.updated }; if (rp.smart) p.smart = rp.smart; L.playlists.push(p); np++; }
      else if ((rp.updated || 0) > (p.updated || 0)) { p.name = rp.name; p.ids = toIds(rp.fps); p.fps = rp.fps; p.updated = rp.updated; if (rp.smart) p.smart = rp.smart; np++; }
      else continue;
      st.pls[p.id] = p.name + "§" + this.playlistFps(p).join("¤");
    }
    const cur = new Set(); for (const id of L.likes) { const t = L.tracks.get(id); if (t) cur.add(fpOf(t)); } st.likes = [...cur];
    L.peers ||= {}; L.peers[r.device] = { name: r.name, stats: r.stats || {}, at: Date.now() };
    DB.put("kv", "syncState", st); DB.put("kv", "peers", L.peers); DB.put("kv", "likes", [...L.likes]); savePlaylists();
    rebuildPeerPlays(); UI.renderNav(); UI.onStatsChanged(); if (["list", "home"].includes(UI.view.name)) UI.rerender();
    return { likes: nl, playlists: np };
  },
};

/* ===================== côté PC (app Windows) ===================== */
const LanPC = NATIVE_WIN && NATIVE_WIN.lan ? {
  outbox: store.get("outbox", []), hasPhone: false,
  async refresh() { try { const i = await NATIVE_WIN.lan.info(); this.hasPhone = (i.phones || []).length > 0; } catch { /* ancienne version */ } },
  init() {
    NATIVE_WIN.lan.onAsk((kind, p) => this.answer(kind, p));
    NATIVE_WIN.lan.onEvent((ev) => {
      if (ev.type === "paired") { toast(`« ${ev.name} » est associé à ce PC.`); this.hasPhone = true; if (!$("#sheet").hidden) this.open(); }
      if (ev.type === "received") toast(`Reçu de ${ev.from} : ${ev.name}`);
    });
  },
  async answer(kind, p) {
    if (kind === "state") {
      const t = Player.id && L.tracks.get(Player.id);
      return { id: Player.id || "", title: t ? t.title : "", artist: t ? t.artist : "", album: t ? t.album || "" : "", playing: Player.playing, t: Player.currentTime || 0, d: Player.duration || 0, volume: Player.volume, muted: Player.muted, shuffle: Q.shuffle, repeat: Q.repeat, art: t && t.artKey ? t.artKey : "", artData: t && t.artKey ? await this.artData(t.artKey) : "", up: Q.upcoming(5).map((x) => { const u = L.tracks.get(x.id); return u ? [u.title, u.artist] : null; }).filter(Boolean) };
    }
    if (kind === "cmd") {
      const c = p.cmd;
      if (c === "toggle") ACTIONS["toggle-play"](); else if (c === "next") Q.next(); else if (c === "prev") Q.prev();
      else if (c === "seek") Player.seek(+p.value || 0); else if (c === "volume") Player.setVolume(clamp(+p.value, 0, 1));
      else if (c === "shuffle") Q.toggleShuffle(); else if (c === "repeat") Q.cycleRepeat();
      else if (c === "mix") playCtx("mix", { shuffle: true });
      return { ok: true };
    }
    if (kind === "sync") { const mine = Sync.payload(); const r = Sync.merge(p.data); return { ...mine, merged: r }; }
    if (kind === "outbox") return { items: this.outbox.filter((o) => L.tracks.has(o.id)).map((o) => { const t = L.tracks.get(o.id); const f = L.files.get(o.id); return { id: o.id, name: f ? f.name : t.name, title: t.title, artist: t.artist, size: f ? f.size : t.size }; }) };
    if (kind === "outbox-done") { const ids = new Set(p.ids || []); this.outbox = this.outbox.filter((o) => !ids.has(o.id)); store.set("outbox", this.outbox); if (ids.size) toast(`${plural(ids.size, "titre envoyé", "titres envoyés")} au téléphone.`); return { ok: true }; }
    if (kind === "file") { const f = L.files.get(p.id); return f && f.abs ? { path: f.abs } : null; }
    return { error: "inconnu" };
  },
  artCache: new Map(),
  async artData(key) { if (this.artCache.has(key)) return this.artCache.get(key); const a = L.art.get(key); if (!a || !a.small) return ""; const d = "data:" + (a.small.type || "image/webp") + ";base64," + (await blobB64(a.small)); this.artCache.set(key, d); return d; },
  send(ids) {
    const have = new Set(this.outbox.map((o) => o.id)); let n = 0;
    for (const id of ids) if (!have.has(id) && L.files.get(id)?.abs) { this.outbox.push({ id, at: Date.now() }); n++; }
    store.set("outbox", this.outbox);
    toast(n ? `${plural(n, "titre partira", "titres partiront")} sur ton téléphone dès que tu ouvres aurore dessus (même Wi-Fi).` : "Déjà prévu pour ton téléphone.", { ms: 6000 });
  },
  async open() {
    const i = await NATIVE_WIN.lan.info();
    const phones = i.phones || [];
    openSheet(html`<div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><h2>Ton téléphone</h2><button class="icon-btn" data-act="close-sheet" aria-label="Fermer">${icon("x")}</button></div>
<div class="lan">
  <p class="lan-intro">Sur le même Wi-Fi, ton téléphone peut piloter la musique de ce PC, s'échanger des titres avec lui, et garder les mêmes playlists, likes et statistiques.</p>
  ${i.code ? html`<div class="lan-code"><small>Dans aurore sur ton téléphone : Réglages → Mon PC → Associer, puis tape</small><b class="mono" aria-label="Code ${i.code.split("").join(" ")}">${i.code.slice(0, 3)} ${i.code.slice(3)}</b><small>Ce code marche 10 minutes. PC : ${i.name}${i.ips && i.ips.length ? ` (${i.ips[0]})` : ""}</small></div>`
    : html`<button class="btn primary lan-big" data-act="lan-code">${icon("phone", "sm")} ${phones.length ? "Associer un autre téléphone" : "Associer mon téléphone"}</button>${i.on ? "" : html`<p class="lan-note">${icon("info", "sm")}<span>Windows peut demander d'autoriser aurore sur le réseau : accepte pour les « réseaux privés ».</span></p>`}`}
  ${phones.length ? html`<div class="lan-list"><b>Associés</b>${phones.map((p) => html`<div class="folder-row"><span>${icon("phone", "sm")} ${p.name}${p.synced ? html` · <small>synchronisé ${fmtAgo(p.synced)}</small>` : ""}</span><button class="icon-btn" data-act="lan-forget" data-id="${p.id}" aria-label="Oublier ${p.name}" title="Oublier">${icon("x", "sm")}</button></div>`)}</div>` : ""}
  ${this.outbox.length ? html`<p class="lan-note">${icon("send", "sm")}<span>${plural(this.outbox.length, "titre attend", "titres attendent")} d'être envoyé${this.outbox.length > 1 ? "s" : ""} au téléphone.</span></p>` : ""}
  ${i.on ? html`<button class="btn ghost sm" data-act="lan-stop" style="align-self:flex-start">Couper le lien Wi-Fi</button>` : ""}
</div>`);
  },
} : null;

/* ===================== côté téléphone (app Android) ===================== */
const LanPhone = AndroidMusic ? {
  pc: store.get("pc", null), busy: false, lastAuto: 0, remoteOn: false,
  call(m, o) { try { return CAP.nativePromise("AuroreMusic", m, o || {}); } catch (e) { return Promise.reject(e); } },
  url(p) { return `http://${this.pc.host}:${this.pc.port}${p}`; },
  async api(p, { method = "GET", body = null, timeout = 6000 } = {}) {
    const r = await this.call("lanFetch", { url: this.url(p), method, body: body == null ? "" : JSON.stringify(body), token: this.pc.token, timeout });
    if (r.status === 401) { this.pc = null; store.set("pc", null); throw new Error("dissocié"); }
    if (r.status < 200 || r.status >= 300) throw new Error("HTTP " + r.status);
    return r.body ? JSON.parse(r.body) : {};
  },
  async discover() { try { return (await this.call("lanDiscover")).pcs || []; } catch { return []; } },
  /* retrouve le PC même si son adresse a changé */
  async reach() {
    if (!this.pc) return false;
    try { const h = JSON.parse((await this.call("lanFetch", { url: this.url("/hello"), method: "GET", body: "", token: "", timeout: 1500 })).body || "{}"); if (h.id === this.pc.id) return true; } catch { /* adresse changée */ }
    const found = (await this.discover()).find((x) => x.id === this.pc.id);
    if (!found) return false;
    this.pc.host = found.host; this.pc.port = found.port; store.set("pc", this.pc); return true;
  },
  /* à chaque ouverture de l'app (au plus une fois par minute) : synchro + titres envoyés par le PC */
  async auto() {
    if (!this.pc || this.busy || Date.now() - this.lastAuto < 60000) return;
    this.lastAuto = Date.now();
    try { if (await this.reach()) { await this.sync(true); await this.receive(true); } } catch { /* PC éteint ou autre réseau */ }
  },
  async sync(quiet) {
    this.busy = true;
    try {
      const r = await this.api("/sync", { method: "POST", body: Sync.payload(), timeout: 20000 });
      const m = Sync.merge(r); this.pc.synced = Date.now(); store.set("pc", this.pc);
      if (!quiet) toast(m.likes || m.playlists ? `Synchronisé avec ${this.pc.name} : ${plural(m.playlists, "playlist", "playlists")}, ${plural(m.likes, "like", "likes")} mis à jour.` : `Tout est déjà à jour avec ${this.pc.name}.`);
      return m;
    } finally { this.busy = false; }
  },
  async receive(quiet) {
    const { items = [] } = await this.api("/outbox");
    if (!items.length) { if (!quiet) toast("Rien en attente sur le PC."); return 0; }
    const done = [];
    for (const [k, it] of items.entries()) {
      toast(`Réception ${k + 1}/${items.length} : ${it.title}`, { ms: 4000 });
      try { await this.call("lanDownload", { url: this.url("/file?id=" + encodeURIComponent(it.id)), token: this.pc.token, name: it.name }); done.push(it.id); }
      catch (e) { toast(/ANDROID_9/.test(String(e && (e.code || e.message))) ? "Recevoir des titres demande Android 10 ou plus récent." : `« ${it.title} » n'a pas pu être reçu.`); break; }
    }
    if (done.length) { await this.api("/done", { method: "POST", body: { ids: done } }).catch(() => {}); toast(`${plural(done.length, "titre reçu", "titres reçus")} du PC, rangé${done.length > 1 ? "s" : ""} dans Musique › aurore.`); setTimeout(() => AndroidMusic.scan({ quiet: true }), 1500); }
    return done.length;
  },
  async send(ids) {
    if (!this.pc) return toast("Associe d'abord ton PC : Réglages → Mon PC.", { action: { label: "Associer", fn: () => this.open() } });
    if (!(await this.reach())) return toast(`${this.pc.name} est introuvable : ouvre aurore sur le PC, sur le même Wi-Fi.`);
    let n = 0;
    for (const id of ids) {
      const f = L.files.get(id), t = L.tracks.get(id); if (!f || !f.media) continue;
      toast(`Envoi au PC : ${t.title}`, { ms: 3000 });
      try { const r = await this.call("lanUpload", { url: this.url("/upload?name=" + encodeURIComponent(f.name)), token: this.pc.token, mid: f.mid }); if (r.status === 200) n++; } catch { /* suivant */ }
    }
    toast(n ? `${plural(n, "titre envoyé", "titres envoyés")} : il${n > 1 ? "s sont" : " est"} dans Musique › aurore › Du téléphone, sur le PC.` : "L'envoi n'a pas marché. Vérifie que les deux sont sur le même Wi-Fi.");
  },
  /* ---- association ---- */
  async open() {
    if (this.pc) return this.openPaired();
    openSheet(html`<div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><h2>Mon PC</h2><button class="icon-btn" data-act="close-sheet" aria-label="Fermer">${icon("x")}</button></div>
<div class="lan"><p class="lan-intro">Relie ton téléphone à aurore sur ton PC (même Wi-Fi) : télécommande, échange de titres, mêmes playlists, likes et statistiques.</p>
<ol class="lan-steps"><li>Sur le PC, ouvre aurore → Réglages → <b>Ton téléphone</b> → <b>Associer mon téléphone</b>.</li><li>Touche « Chercher mon PC » ici, puis tape le code affiché.</li></ol>
<div id="lan-found"></div>
<button class="btn primary lan-big" data-act="lan-find">${icon("search", "sm")} Chercher mon PC</button></div>`);
  },
  async find() {
    const box = $("#lan-found"); if (!box) return;
    setHTML(box, html`<p class="lan-note"><span class="pulse-dot"></span><span>Recherche sur le Wi-Fi…</span></p>`);
    const pcs = await this.discover();
    if (!$("#lan-found")) return;
    setHTML($("#lan-found"), pcs.length ? html`<div class="lan-list">${pcs.map((p) => html`<button class="lan-pc" data-act="lan-pick" data-host="${p.host}" data-port="${p.port}" data-id="${p.id}" data-name="${p.name}">${icon("monitor", "sm")}<span><b>${p.name}</b><small>${p.host}</small></span>${icon("right", "sm")}</button>`)}</div>`
      : html`<p class="lan-note">${icon("info", "sm")}<span>Aucun PC trouvé. Vérifie que le téléphone et le PC sont sur le même Wi-Fi, qu'aurore est ouverte sur le PC et que tu as cliqué sur « Associer mon téléphone ».</span></p>`);
  },
  pick(el) {
    const pc = { host: el.dataset.host, port: +el.dataset.port, id: el.dataset.id, name: el.dataset.name };
    setHTML($("#lan-found"), html`<form class="lan-pair" id="lan-pair"><label class="field"><span>Code affiché sur ${pc.name}</span><input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" pattern="[0-9 ]{6,7}" placeholder="123 456" required></label><button class="btn primary" type="submit">Associer</button></form>`);
    const f = $("#lan-pair"); f.querySelector("input").focus();
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const code = String(new FormData(f).get("code") || "").replace(/\D/g, "");
      try {
        const r = await this.call("lanFetch", { url: `http://${pc.host}:${pc.port}/pair`, method: "POST", body: JSON.stringify({ code, name: "Téléphone" }), token: "", timeout: 6000 });
        if (r.status === 403) return toast("Code incorrect ou expiré : vérifie le code affiché sur le PC.");
        if (r.status !== 200) throw new Error("HTTP " + r.status);
        const j = JSON.parse(r.body); this.pc = { ...pc, token: j.token, name: j.name || pc.name }; store.set("pc", this.pc);
        toast(`Associé à ${this.pc.name}.`); this.lastAuto = 0; this.openPaired(); this.sync(true).then(() => this.openPaired()).catch(() => {});
      } catch { toast("Impossible de joindre le PC. Vérifie le Wi-Fi."); }
    });
  },
  openPaired() {
    const pc = this.pc;
    openSheet(html`<div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><h2>${pc.name}</h2><button class="icon-btn" data-act="close-sheet" aria-label="Fermer">${icon("x")}</button></div>
<div class="lan">
  <button class="lan-tile" data-act="remote-open">${icon("remote")}<span><b>Télécommande</b><small>Pilote la musique du PC</small></span>${icon("right", "sm")}</button>
  <button class="lan-tile" data-act="lan-sync">${icon("refresh")}<span><b>Synchroniser maintenant</b><small>${pc.synced ? `Dernière fois ${fmtAgo(pc.synced)}` : "Playlists, likes et statistiques"}</small></span>${icon("right", "sm")}</button>
  <button class="lan-tile" data-act="lan-receive">${icon("download")}<span><b>Recevoir les titres du PC</b><small>Ceux que tu as envoyés depuis le PC</small></span>${icon("right", "sm")}</button>
  <p class="lan-note">${icon("info", "sm")}<span>Pour envoyer un titre au PC : menu ⋯ d'un titre → « Envoyer au PC ». La synchro se fait aussi toute seule quand tu ouvres aurore.</span></p>
  <button class="btn ghost sm" data-act="lan-unpair" style="align-self:flex-start">Oublier ce PC</button>
</div>`);
  },
  /* ---- télécommande ---- */
  async remote() {
    if (!(await this.reach())) return toast(`${this.pc.name} est introuvable : ouvre aurore sur le PC, sur le même Wi-Fi.`);
    this.remoteOn = true; this.rs = null; this.drawRemote(); this.pollRemote();
  },
  async pollRemote() {
    while (this.remoteOn && $("#remote")) {
      try { const s = await this.api("/state", { timeout: 3000 }); this.rs = s; this.rsAt = Date.now(); this.updateRemote(); } catch { const st = $("#remote .rm-status"); if (st) st.textContent = "Connexion perdue… je réessaie"; }
      await sleep(document.hidden ? 4000 : 1000);
    }
    this.remoteOn = false;
  },
  drawRemote() {
    openSheet(html`<div class="remote" id="remote">
  <div class="rm-top"><span class="g-kicker">${icon("remote", "sm")} Télécommande</span><span class="rm-status">${this.pc.name}</span><button class="icon-btn" data-act="close-sheet" aria-label="Fermer">${icon("x")}</button></div>
  <div class="rm-art"><div class="ph">${icon("music", "lg")}</div></div>
  <div class="rm-meta"><b class="rm-title">…</b><span class="rm-artist"></span></div>
  <div class="d-seek"><span class="mono rm-cur">0:00</span><input type="range" class="rm-seek" min="0" max="1000" step="1" value="0" aria-label="Position"><span class="mono rm-dur">0:00</span></div>
  <div class="d-ctrls rm-ctrls"><button class="icon-btn rm-shuffle" data-act="rm" data-cmd="shuffle" aria-label="Aléatoire">${icon("shuffle")}</button><button class="icon-btn" data-act="rm" data-cmd="prev" aria-label="Précédent">${icon("prev", "lg")}</button><button class="d-play rm-play" data-act="rm" data-cmd="toggle" aria-label="Lecture">${icon("play")}</button><button class="icon-btn" data-act="rm" data-cmd="next" aria-label="Suivant">${icon("next", "lg")}</button><button class="icon-btn rm-repeat" data-act="rm" data-cmd="repeat" aria-label="Répéter">${icon("repeat")}</button></div>
  <label class="rm-vol">${icon("vol", "sm")}<input type="range" class="rm-volume" min="0" max="100" step="1" value="80" aria-label="Volume du PC"></label>
  <div class="rm-up"></div>
</div>`);
    const seek = $("#remote .rm-seek"); seek.addEventListener("change", () => { const s = this.rs; if (s && s.d) this.cmd("seek", (seek.value / 1000) * s.d); });
    const vol = $("#remote .rm-volume"); vol.addEventListener("input", () => { vol.style.setProperty("--p", vol.value + "%"); clearTimeout(this._vt); this._vt = setTimeout(() => this.cmd("volume", vol.value / 100), 120); });
  },
  updateRemote() {
    const s = this.rs, r = $("#remote"); if (!s || !r) return;
    r.querySelector(".rm-status").textContent = this.pc.name;
    r.querySelector(".rm-title").textContent = s.title || "Rien en lecture"; r.querySelector(".rm-artist").textContent = s.title ? s.artist + (s.album ? " · " + s.album : "") : "Lance de la musique sur le PC, ou :";
    const art = r.querySelector(".rm-art"); if (art.dataset.k !== s.art) { art.dataset.k = s.art; setHTML(art, s.artData ? html`<img src="${s.artData}" alt="">` : html`<div class="ph">${icon("music", "lg")}</div>`); }
    const play = r.querySelector(".rm-play"); setHTML(play, icon(s.playing ? "pause" : "play")); play.setAttribute("aria-label", s.playing ? "Pause" : "Lecture");
    const t = s.t + (s.playing ? 0 : 0), p = s.d ? clamp(t / s.d, 0, 1) : 0, seek = r.querySelector(".rm-seek");
    if (document.activeElement !== seek) { seek.value = Math.round(p * 1000); seek.style.setProperty("--p", p * 100 + "%"); }
    r.querySelector(".rm-cur").textContent = fmtTime(t); r.querySelector(".rm-dur").textContent = fmtTime(s.d);
    const vol = r.querySelector(".rm-volume"); if (document.activeElement !== vol) { vol.value = Math.round((s.muted ? 0 : s.volume) * 100); vol.style.setProperty("--p", vol.value + "%"); }
    r.querySelector(".rm-shuffle").classList.toggle("on", !!s.shuffle); r.querySelector(".rm-repeat").classList.toggle("on", s.repeat !== "off");
    setHTML(r.querySelector(".rm-up"), s.title ? (s.up && s.up.length ? html`<small>À suivre</small>${s.up.slice(0, 3).map(([a, b]) => html`<span>${a} <em>· ${b}</em></span>`)}` : "") : html`<button class="btn sm" data-act="rm" data-cmd="mix">${icon("shuffle", "sm")} Lancer un mix au hasard</button>`);
  },
  async cmd(c, value) { try { await this.api("/cmd", { method: "POST", body: { cmd: c, value }, timeout: 3000 }); const s = await this.api("/state", { timeout: 3000 }); this.rs = s; this.updateRemote(); } catch { toast("Le PC ne répond pas."); } },
} : null;

function fmtAgo(ts) { const m = Math.round((Date.now() - ts) / 60000); return m < 1 ? "à l'instant" : m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`; }
