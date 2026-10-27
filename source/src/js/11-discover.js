/* ===================== découvertes (Claude, via la capacité « sample ») ===================== */
const DISC_MOODS = [
  ["proche", "Dans la même veine", "dans la même veine que mes artistes préférés"],
  ["pepites", "Pépites peu connues", "des pépites peu connues, avec peu d'écoutes sur les plateformes, mais qui restent dans mes goûts"],
  ["calme", "Plus calme", "plus calme, doux et posé que ce que j'écoute d'habitude, sans changer complètement de style"],
  ["energie", "Plus énergique", "plus énergique et dansant que d'habitude, sans changer complètement de style"],
  ["ailleurs", "D'autres pays", "des artistes d'autres pays ou qui chantent dans d'autres langues, avec le même esprit que mes goûts"],
  ["racines", "Les racines", "des artistes plus anciens (avant 2000) qui ont influencé ce que j'écoute"],
];
const Disc = {
  api: undefined, state: "idle", items: [], mood: "proche", seed: "", ctl: null, msg: "", seen: [],
  async init() {
    const kv = await DB.get("kv", "disc"); if (kv && Array.isArray(kv.items)) { this.items = kv.items; this.mood = kv.mood || "proche"; this.seed = kv.seed || ""; if (this.items.length) this.state = "done"; }
    this.seen = (await DB.get("kv", "seen")) || [];
    if (window.claude && typeof window.claude.use === "function") {
      try { this.api = await window.claude.use("sample"); } catch { this.api = null; }
    } else this.api = null;
    if (UI.view.name === "discover") UI.rerender();
  },
  seeds() {
    const top = topArtists(11).filter((x) => x.artist.name !== UNKNOWN_ARTIST).slice(0, 10).map((x) => ({ name: x.artist.name, plays: x.plays, genre: this.genreOf(x.artist) }));
    if (top.length >= 3) return { kind: "plays", list: top };
    const lib = [...L.artists.values()].filter((a) => a.name !== UNKNOWN_ARTIST && !a.tracks.every((id) => L.tracks.get(id)?.demo)).sort((a, b) => b.tracks.length - a.tracks.length).slice(0, 10)
      .map((a) => ({ name: a.name, plays: 0, tracks: a.tracks.length, genre: this.genreOf(a) }));
    return { kind: "library", list: lib };
  },
  genreOf(ar) { const g = new Map(); for (const id of ar.tracks) { const t = L.tracks.get(id); if (t?.genre) g.set(t.genre, (g.get(t.genre) || 0) + 1); } return [...g.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || ""; },
  prompt(forChat = false) {
    const s = this.seeds();
    const lines = s.list.map((a) => `- ${a.name}${a.plays ? ` (${a.plays} écoutes)` : a.tracks ? ` (${a.tracks} titres)` : ""}${a.genre ? ` — ${a.genre}` : ""}`).join("\n");
    const genres = L.genres.slice(0, 8).map((g) => g.name).join(", ");
    const known = [...new Set([...[...L.artists.values()].map((a) => a.name).filter((n) => n !== UNKNOWN_ARTIST), ...this.seen, ...L.saved.map((x) => x.artist)])].slice(0, forChat ? 60 : 300).join(", ");
    const mood = (DISC_MOODS.find((m) => m[0] === this.mood) || DISC_MOODS[0])[2];
    return `Tu es un disquaire passionné, curieux et pointu. Recommande-moi 8 artistes à découvrir.

${s.kind === "plays" ? "Ce que j'écoute le plus dans mon lecteur (nombre d'écoutes) :" : "Les artistes les plus présents dans ma bibliothèque :"}
${lines}
${genres ? `Genres de ma bibliothèque : ${genres}\n` : ""}Envie du moment : ${mood}.
${this.seed ? `Pars surtout de l'artiste « ${this.seed} » : propose des artistes proches de lui ou d'elle.\n` : ""}
N'inclus aucun de ces artistes (je les ai déjà, ou on me les a déjà proposés) : ${known || "aucun"}.

Règles :
- uniquement des artistes qui existent vraiment, avec des morceaux réels faciles à trouver sur YouTube ou Deezer ;
- mélange quelques valeurs sûres et des noms moins connus ;
- « because » : une phrase courte et concrète, en français, en me tutoyant, qui cite un de mes artistes et dit ce qui les relie (son, voix, ambiance, époque).

${forChat ? "Présente chaque artiste avec : son nom, son genre, le pays et l'époque, la phrase « pourquoi », puis deux morceaux pour commencer avec un lien de recherche YouTube pour chacun." : `Réponds avec une ligne JSON par artiste et rien d'autre (pas de tableau, pas de texte autour, pas de bloc de code) :
{"artist":"Nom","genre":"genre court","because":"Une phrase.","tracks":["Titre 1","Titre 2"],"from":"Pays, décennie"}`}`;
  },
  canRun() { return this.seeds().list.length > 0; },
  async run(fresh) {
    if (!this.api || this.state === "loading") return;
    this.ctl = new AbortController();
    const prev = this.items;
    this.items = []; this.state = "loading"; this.msg = ""; UI.rerender();
    let pending = "";
    const add = (line) => {
      line = line.trim().replace(/,$/, ""); if (!line.startsWith("{")) return;
      try { const o = JSON.parse(line); if (o && o.artist && !this.items.some((x) => norm(x.artist) === norm(o.artist))) { this.items.push(this.clean(o)); this.appendCard(this.items.length - 1); } } catch { /* ligne incomplète */ }
    };
    try {
      const { text } = await this.api(this.prompt(), {
        signal: this.ctl.signal, modelTier: "default", cache: fresh ? false : { gcTime: 600000 },
        onText: ({ delta }) => { const lines = (pending + delta).split("\n"); pending = lines.pop(); for (const l of lines) add(l); },
      });
      if (pending.trim()) add(pending);
      if (!this.items.length) { const objs = text.match(/\{[^{}]*\}/g) || []; for (const o of objs) add(o); }
      this.state = this.items.length ? "done" : "error";
      if (!this.items.length) this.msg = "Pas de suggestion exploitable cette fois. Essaie une autre envie.";
    } catch (e) {
      const code = e && e.code;
      if (code === "cancelled") { this.state = this.items.length ? "done" : (prev.length ? "done" : "idle"); if (!this.items.length) this.items = prev; }
      else if (["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"].includes(code)) { this.state = "denied"; this.items = prev; }
      else { this.state = this.items.length ? "done" : "error"; this.msg = code === "rate_limited" ? "Trop de demandes d'un coup. Réessaie dans un moment." : code === "session_expired" ? "Ta session Claude a expiré : reconnecte-toi puis réessaie." : code === "refused" ? "Claude n'a pas voulu répondre à cette demande. Essaie une autre envie." : "La connexion a coupé avant la fin. Réessaie."; if (!this.items.length && prev.length && code !== "refused") this.items = prev; }
    }
    this.ctl = null;
    this.seen = [...new Set([...this.seen, ...this.items.map((x) => x.artist)])].slice(-400);
    DB.put("kv", "seen", this.seen);
    DB.put("kv", "disc", { items: this.items, mood: this.mood, seed: this.seed });
    UI.rerender();
  },
  clean(o) {
    return { artist: String(o.artist).slice(0, 80), genre: String(o.genre || "").slice(0, 60), because: String(o.because || "").slice(0, 280), from: String(o.from || "").slice(0, 60), tracks: (Array.isArray(o.tracks) ? o.tracks : []).slice(0, 3).map((t) => String(t).slice(0, 90)) };
  },
  appendCard(i) {
    const grid = $("#disc-grid"); if (!grid) return;
    const sk = grid.querySelector(".skel"); if (sk) sk.remove();
    grid.insertAdjacentHTML("beforeend", this.card(this.items[i], i, false).s);
  },
  stop() { this.ctl?.abort(); },
  links(a, track) {
    const q = encodeURIComponent; const yt = `https://www.youtube.com/results?search_query=${q(a + (track ? " " + track : ""))}`;
    return { yt, deezer: `https://www.deezer.com/search/${q(a)}`, spotify: `https://open.spotify.com/search/${q(a)}`, bandcamp: `https://bandcamp.com/search?q=${q(a)}`, lastfm: `https://www.last.fm/music/${q(a.replace(/ /g, "+"))}` };
  },
  card(it, i, saved) {
    const hue = parseInt(hash(it.artist).slice(0, 4), 36) % 360; const k = this.links(it.artist);
    const initials = it.artist.replace(/^(the|les|le|la)\s+/i, "").split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
    const isSaved = L.saved.some((x) => norm(x.artist) === norm(it.artist));
    return html`<article class="dcard" style="--dc:hsl(${hue} 72% 68%);animation-delay:${saved ? 0 : Math.min(i, 7) * 40}ms">
<div class="dc-actions">${saved ? html`<button class="icon-btn" data-act="unsave-artist" data-i="${i}" aria-label="Retirer de ma liste">${icon("x", "sm")}</button>` : html`<button class="icon-btn${isSaved ? " on" : ""}" data-act="save-artist" data-i="${i}" aria-pressed="${String(isSaved)}" aria-label="${isSaved ? "Déjà dans ma liste" : "Garder dans ma liste À découvrir"}" title="Garder pour plus tard">${icon("bookmark", "sm")}</button><button class="icon-btn" data-act="dismiss-artist" data-i="${i}" aria-label="Pas pour moi" title="Pas pour moi">${icon("x", "sm")}</button>`}</div>
<div class="dc-top"><span class="dc-av" aria-hidden="true">${initials}</span><div style="min-width:0;padding-right:64px"><h3 class="dc-name">${it.artist}</h3><div class="dc-genre">${[it.genre, it.from].filter(Boolean).join(" · ")}</div></div></div>
${it.because ? html`<p class="dc-why">${it.because}</p>` : ""}
${it.tracks.length ? html`<div class="dc-tracks">${it.tracks.map((t) => html`<a href="${this.links(it.artist, t).yt}" target="_blank" rel="noopener noreferrer">${icon("play")}<span>${t}</span></a>`)}</div>` : ""}
<div class="dc-links"><a href="${k.yt}" target="_blank" rel="noopener noreferrer">YouTube ${icon("external", "sm")}</a><a href="${k.deezer}" target="_blank" rel="noopener noreferrer">Deezer ${icon("external", "sm")}</a><a href="${k.spotify}" target="_blank" rel="noopener noreferrer">Spotify ${icon("external", "sm")}</a><a href="${k.bandcamp}" target="_blank" rel="noopener noreferrer">Bandcamp ${icon("external", "sm")}</a></div>
</article>`;
  },
  view() {
    const s = this.seeds();
    const head = html`<div class="view-head"><div><h1 class="h-page">Découvertes</h1><div class="sub">Des artistes choisis d'après ce que tu écoutes le plus.</div></div></div>`;
    if (!s.list.length) return html`${head}<div class="empty"><div class="big-ic">${icon("sparkles", "lg")}</div><h2>Il me faut un peu de ta musique</h2><p>Les suggestions partent des artistes que tu écoutes. Ajoute ton dossier de musique, écoute quelques titres, puis reviens ici.</p><button class="btn primary" data-act="import-dir">${icon("folder", "sm")} Ouvrir mon dossier</button></div>${this.savedHTML()}`;
    const seedsHTML = html`<div class="disc-seeds">${this.seed ? html`<span class="seed">Autour de ${this.seed}</span><button class="chip" style="height:26px" data-act="disc-seed-clear">Revenir à mes favoris</button>` : s.list.slice(0, 8).map((a) => html`<span class="seed">${a.name}${a.plays ? html` <span class="mono">${a.plays}</span>` : ""}</span>`)}</div>`;
    const moods = html`<div class="chips" style="margin-top:14px" role="group" aria-label="Envie du moment">${DISC_MOODS.map(([k, l]) => html`<button class="chip" data-act="disc-mood" data-key="${k}" aria-pressed="${String(this.mood === k)}">${l}</button>`)}</div>`;
    let action;
    if (this.api === undefined) action = html`<button class="btn" disabled>Connexion à Claude…</button>`;
    else if (this.api === null || this.state === "denied") action = "";
    else if (this.state === "loading") action = html`<button class="btn" data-act="disc-stop">${icon("stop", "sm")} Arrêter</button>`;
    else action = html`<button class="btn primary" data-act="disc-run" data-fresh="${this.items.length ? 1 : 0}">${icon(this.items.length ? "refresh" : "sparkles", "sm")} ${this.items.length ? "D'autres idées" : "Trouver des artistes"}</button>`;
    const intro = html`<div class="disc-intro"><div><h2 class="h-sec">${s.kind === "plays" ? "D'après tes écoutes" : "D'après ta bibliothèque"}</h2><p>${s.kind === "plays" ? "Tes artistes les plus écoutés servent de point de départ." : "Tu n'as pas encore assez écouté : je pars des artistes les plus présents dans ta musique."} Claude propose 8 artistes avec deux morceaux pour commencer ; tu écoutes en un clic sur YouTube, Deezer, Spotify ou Bandcamp.</p>${seedsHTML}${moods}</div>${action}</div>`;
    let body = "";
    if (this.api === null || this.state === "denied") body = this.fallbackHTML(s);
    else if (this.state === "loading") body = html`<div class="thinking"><span class="eq" style="--eq:running"><i></i><i></i><i></i></span>Claude cherche des artistes pour toi… (ça peut prendre jusqu'à une minute)</div><div class="disc-grid" id="disc-grid">${this.items.map((it, i) => this.card(it, i))}${Array.from({ length: 3 }, () => html`<div class="skel"></div>`)}</div>`;
    else if (this.items.length) body = html`${this.msg ? html`<p class="note">${this.msg}</p>` : ""}<div class="disc-grid" id="disc-grid">${this.items.map((it, i) => this.card(it, i))}</div><p class="note">Suggestions générées par Claude à partir de tes écoutes : vérifie en écoutant, il peut se tromper sur un titre.</p>`;
    else if (this.msg) body = html`<p class="note">${this.msg}</p>`;
    return html`${head}${intro}${body}${this.savedHTML()}`;
  },
  fallbackHTML(s) {
    const chat = "https://claude.ai/new?q=" + encodeURIComponent(this.prompt(true));
    return html`<section class="sec"><div class="banner" style="margin-top:0">${icon("sparkles")}<p>${this.state === "denied" ? html`<b>L'accès à Claude est coupé pour cette page.</b> Tu peux le réactiver depuis le menu Autorisations de l'artifact, ou poser la question dans une conversation.` : html`<b>Demande tes découvertes à Claude.</b> Je prépare la demande avec tes artistes les plus écoutés et ton envie du moment ; elle s'ouvre dans une nouvelle conversation.`}</p><a class="btn primary sm" href="${chat}" target="_blank" rel="noopener">${icon("external", "sm")} Demander à Claude</a></div>
<p class="note">Pour creuser tout seul à partir de tes artistes :</p>
<div class="disc-grid">${s.list.slice(0, 6).map((a) => { const k = this.links(a.name); return html`<article class="dcard" style="--dc:hsl(${parseInt(hash(a.name).slice(0, 4), 36) % 360} 72% 68%)"><div class="dc-top"><div><h3 class="dc-name">${a.name}</h3><div class="dc-genre">${a.genre || "Dans ta bibliothèque"}</div></div></div><div class="dc-links"><a href="https://www.last.fm/music/${encodeURIComponent(a.name.replace(/ /g, "+"))}/+similar" target="_blank" rel="noopener noreferrer">Artistes similaires · Last.fm ${icon("external", "sm")}</a><a href="${k.yt}%20mix" target="_blank" rel="noopener noreferrer">Mix YouTube ${icon("external", "sm")}</a></div></article>`; })}</div></section>`;
  },
  savedHTML() {
    if (!L.saved.length) return "";
    return html`<section class="sec" id="saved"><div class="sec-head"><h2 class="h-sec">Ta liste À découvrir</h2><span class="sub">${plural(L.saved.length, "artiste", "artistes")}</span></div><div class="disc-grid">${L.saved.slice().reverse().map((it, j) => this.card(it, L.saved.length - 1 - j, true))}</div></section>`;
  },
};
