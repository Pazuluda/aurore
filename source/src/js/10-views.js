/* ===================== vues ===================== */
function missingBanner() {
  if (!L.tracks.size || L.importing) return "";
  const miss = missingCount(); if (!miss) return "";
  if (NATIVE_WIN) return html`<div class="banner">${icon("folder")}<p><b>${miss} ${miss > 1 ? "titres ne sont plus dans tes dossiers" : "titre n'est plus dans tes dossiers"}.</b> Ils ont peut-être été déplacés ou supprimés.</p><button class="btn sm" data-act="reopen">${icon("refresh", "sm")} Relire mes dossiers</button><button class="btn sm ghost" data-act="drop-missing">Les retirer de la bibliothèque</button></div>`;
  const all = miss === L.tracks.size;
  const where = L.rootName ? ` « ${L.rootName} »` : "";
  return html`<div class="banner">${icon("folder")}<p>${all
    ? html`<b>Ta bibliothèque est prête.</b> Pour écouter, rouvre ton dossier${where} : rien n'est réanalysé, ça prend une seconde.`
    : html`<b>${miss} ${miss > 1 ? "titres attendent leur fichier" : "titre attend son fichier"}.</b> Rouvre ton dossier${where} pour les retrouver.`}</p>
<button class="btn primary sm" data-act="reopen">${icon("folder", "sm")} Rouvrir le dossier</button>${L.memorize ? "" : html`<button class="btn sm ghost" data-act="settings">Ne plus avoir à le faire</button>`}</div>`;
}
function emptyLib(what) {
  return html`<div class="empty"><div class="big-ic">${icon("folder", "lg")}</div><h2>Pas encore de ${what}</h2><p>${AndroidMusic ? "aurore cherche la musique de ton téléphone : tout se range ici automatiquement." : IS_MOBILE ? "Ajoute ta musique depuis ton téléphone : tout se range ici automatiquement." : "Choisis le dossier où se trouve ta musique : tout se range ici automatiquement."}</p><div class="hero-actions" style="justify-content:center">${AndroidMusic ? html`<button class="btn primary" data-act="media-find">${icon("search", "sm")} Trouver ma musique</button>` : html`<button class="btn primary" data-act="import-dir">${icon(IS_MOBILE ? "plus" : "folder", "sm")} ${IS_MOBILE ? "Ajouter ma musique" : "Choisir mon dossier"}</button>`}<button class="btn ghost" data-act="demo">${icon("play", "sm")} <span class="lbl">Écouter la démo</span></button></div></div>`;
}
function notFound() { return html`<div class="empty"><h2>Introuvable</h2><p>Cet élément n'est plus dans ta bibliothèque.</p><button class="btn" data-act="back">Retour</button></div>`; }
function installCard() {
  if (!Install.visible) return "";
  const label = IS_MOBILE ? "Installe aurore sur ton téléphone" : "Installe aurore sur ton PC";
  const sub = IS_MOBILE ? "Une icône sur l'écran d'accueil, plein écran, et la musique continue écran verrouillé." : "Sa propre fenêtre, une icône dans la barre des tâches, et ton dossier de musique retrouvé tout seul.";
  const btn = Install.evt || Install.iosHint ? html`<button class="btn primary sm" data-act="install">${icon("save", "sm")} Installer</button>` : html`<a class="btn primary sm" href="${APP_URL}" target="_blank" rel="noopener">${icon("external", "sm")} Ouvrir la version à installer</a>`;
  return html`<div class="banner install">${icon("save")}<p><b>${label}</b><br>${sub}</p>${btn}</div>`;
}
function heroHTML() {
  UI.mount(() => { const c = $("#hero-viz"); if (c) Viz.add(c, "hero"); });
  return html`<section class="hero">
<canvas class="hero-canvas" id="hero-viz" aria-hidden="true"></canvas>
<h1>Ta musique, rangée et vivante.</h1>
${AndroidMusic ? html`<p>${AndroidMusic.perm === "denied" ? "aurore n'a pas encore accès à ta musique. Autorise-la et elle trouvera toute seule tous les MP3, WAV, FLAC… de ton téléphone, rangés par artistes et albums." : "aurore trouve toute seule la musique de ton téléphone (MP3, WAV, FLAC, M4A…), la range par artistes et albums avec les pochettes, et fait danser l'écran au rythme de ce que tu écoutes."}</p>
<div class="hero-actions"><button class="btn primary" data-act="media-find">${icon("search", "sm")} Trouver ma musique</button><button class="btn" data-act="import-files">${icon("files", "sm")} Choisir des fichiers</button>` : IS_MOBILE ? html`<p>Choisis tes fichiers de musique : aurore lit les tags et les pochettes, range tout par artistes et albums, garde tout dans l'app et fait danser l'écran au rythme de ce que tu écoutes. Rien n'est envoyé sur internet.</p>
<div class="hero-actions"><button class="btn primary" data-act="import-dir">${icon("plus", "sm")} Ajouter ma musique</button>` : html`<p>${NATIVE_WIN ? `Ton dossier de musique est prêt : ${libraryLabel()}. Mets-y ta musique, ou glisse-la ici : elle apparaît toute seule, rangée par artistes et albums, avec les pochettes. Si ta musique est déjà rangée ailleurs, aurore peut aussi suivre ce dossier.` : "Ouvre le dossier où dort ta musique : aurore lit les tags et les pochettes, range tout par artistes et albums, et fait danser l'écran au rythme de ce que tu écoutes. Tes fichiers ne quittent jamais ton ordinateur."}</p>
${NATIVE_WIN ? html`<div class="hero-actions"><button class="btn primary" data-act="open-library">${icon("folder", "sm")} Ouvrir mon dossier aurore</button><button class="btn" data-act="import-files">${icon("plus", "sm")} Ajouter des titres</button><button class="btn" data-act="pick-folder">${icon("files", "sm")} Suivre un dossier existant</button>` : html`<div class="hero-actions"><button class="btn primary" data-act="import-dir">${icon("folder", "sm")} Ouvrir mon dossier de musique</button><button class="btn" data-act="import-files">${icon("files", "sm")} Choisir des fichiers</button>`}`}<button class="btn ghost" data-act="demo">${icon("play", "sm")} <span class="lbl">Écouter la démo</span></button></div>
<div class="dropzone"${raw(CAP ? " hidden" : "")}>${icon("save")}<div><b>Ou glisse ton dossier n'importe où dans la fenêtre.</b><br>MP3, FLAC, M4A, OGG, Opus, WAV · sous-dossiers compris</div></div>
</section>
<div class="steps">
<div class="step"><b>Rangé tout seul</b><span>Artistes, albums, disques et pochettes lus dans tes fichiers, ou devinés depuis les noms de dossiers.</span></div>
<div class="step"><b>Animé par le son</b><span>Spectre façon Audacious, halo autour de la pochette, couleurs tirées de l'album en cours.</span></div>
<div class="step"><b>Des découvertes</b><span>D'après ce que tu écoutes le plus, Claude te propose des artistes à essayer, avec des liens pour écouter.</span></div>
</div>`;
}
function shelf(title, items, more) {
  if (!items.length) return "";
  return html`<section class="sec"><div class="sec-head"><h2 class="h-sec">${title}</h2>${more ? html`<button class="link" data-act="nav" data-view="${more[0]}">${more[1]}</button>` : ""}</div><div class="shelf">${items}</div></section>`;
}
function playlistCard(p) {
  const pids = p.smart ? Smart.eval(p.smart, p.id) : p.ids;
  const arts = [...new Set(pids.map((id) => L.tracks.get(id)?.artKey).filter((k) => k && artSmall(k)))].slice(0, 4);
  const inner = p.artKey && artBig(p.artKey) ? html`<img src="${artBig(p.artKey)}" alt="">` : arts.length >= 4 ? html`<div class="mosaic">${arts.map((k) => html`<img src="${artSmall(k)}" alt="">`)}</div>` : arts.length ? html`<img src="${artBig(arts[0])}" alt="">` : html`<div class="ph">${icon("music")}</div>`;
  return html`<div class="card" data-act="open-list" data-id="${p.id}" role="button" tabindex="0" aria-label="${p.name}"><div class="cover" style="--cc:${placeholderColor(p.name)}">${inner}<button class="card-play" data-act="play-ctx" data-ctx="list:${p.id}" aria-label="Lire ${p.name}">${icon("play")}</button></div><div class="card-title">${p.name}</div><div class="card-sub">${p.smart ? "Intelligente · " : ""}${plural(pids.length, "titre", "titres")}</div></div>`;
}

/* ---- contextes de lecture ---- */
function sortedTrackIds(s) {
  const base = L.sorted.tracks.slice();
  if (!s || s.key === "default") return base;
  const T = (id) => L.tracks.get(id); const d = s.dir;
  const f = {
    title: (a, b) => cmp(T(a).title, T(b).title),
    album: (a, b) => cmp(T(a).album || "￿", T(b).album || "￿") || (T(a).disc - T(b).disc) || (T(a).track - T(b).track),
    plays: (a, b) => playsOf(a) - playsOf(b),
    duration: (a, b) => (T(a).duration || 0) - (T(b).duration || 0),
    added: (a, b) => (T(a).addedAt || 0) - (T(b).addedAt || 0),
  }[s.key];
  return f ? base.sort((a, b) => f(a, b) * d) : base;
}
function artistTrackIds(key) {
  const ar = L.artists.get(key); if (!ar) return [];
  const T = (id) => L.tracks.get(id);
  return ar.tracks.slice().sort((a, b) => playsOf(b) - playsOf(a) || (T(b).year || 0) - (T(a).year || 0) || cmp(T(a).album, T(b).album) || (T(a).disc - T(b).disc) || (T(a).track - T(b).track));
}
function moodCard(m, n) {
  return html`<button class="mood" data-act="open-list" data-id="mood:${m.k}" style="--m1:${m.c[0]};--m2:${m.c[1]}" aria-label="${m.name}, ${plural(n, "titre", "titres")}"><span class="mood-ic">${icon(m.ic)}</span><b>${m.name}</b><small>${n ? plural(n, "titre", "titres") : m.hint}</small><span class="mini-play" data-act="play-ctx" data-ctx="list:mood:${m.k}" aria-hidden="true">${icon("play")}</span></button>`;
}
function moodsHTML(compact) {
  const mo = An.moods(), any = HUMEURS.some((m) => mo[m.k].length);
  const left = An.total - An.done;
  const prog = left > 0 ? html`<p class="mood-prog"><span class="pulse-dot"></span>J'écoute ta musique pour la ranger par humeur : ${An.done} / ${An.total}</p>` : "";
  if (!any && !left) return "";
  return html`<section class="sec"><div class="sec-head"><h2 class="h-sec">Selon ton humeur</h2></div>${prog}${any ? html`<div class="moods${compact ? " compact" : ""}">${HUMEURS.map((m) => moodCard(m, mo[m.k].length))}</div>` : ""}</section>`;
}
function listSpec(id) {
  const hasT = (x) => L.tracks.has(x);
  if (id.startsWith("mood:")) { const m = An.moodOf(id.slice(5)); if (!m) return null; return { name: m.name, kind: "Humeur", ids: (An.moods()[m.k] || []).filter(hasT), auto: true, ic: m.ic, mood: m, empty: An.total > An.done ? `aurore écoute encore ta musique (${An.done} / ${An.total}) : reviens dans un moment.` : "Aucun titre ne correspond vraiment à cette humeur pour l'instant." }; }
  if (id === "liked") return { name: "Titres likés", kind: "Playlist", ids: [...L.likes].reverse().filter(hasT), auto: true, ic: "heart", empty: "Touche le cœur à côté d'un titre pour le retrouver ici." };
  if (id === "top") return { name: "Les plus écoutés", kind: "Playlist auto", ids: topTracks(50), auto: true, ic: "bars", empty: "Écoute un peu de musique : tes 50 titres préférés apparaîtront ici, classés par nombre d'écoutes." };
  if (id === "never") return { name: "Jamais écoutés", kind: "Playlist auto", ids: L.sorted.tracks.filter((x) => !playsOf(x)).sort((a, b) => (L.tracks.get(b).addedAt || 0) - (L.tracks.get(a).addedAt || 0)), auto: true, ic: "sparkles", empty: "Tu as tout écouté. Respect." };
  if (id === "recent") { const seen = new Set(), ids = []; for (let i = L.history.length - 1; i >= 0 && ids.length < 50; i--) { const x = L.history[i][0]; if (!seen.has(x) && hasT(x)) { seen.add(x); ids.push(x); } } return { name: "Écoutés récemment", kind: "Playlist auto", ids, auto: true, ic: "clock", empty: "Rien pour l'instant." }; }
  const p = L.playlists.find((x) => x.id === id);
  if (p && p.smart) return { name: p.name, kind: "Playlist intelligente", ids: Smart.eval(p.smart, p.id), p, smart: true, empty: "Aucun titre ne respecte ces règles pour l'instant : modifie-les avec le bouton ⋯." };
  if (p) return { name: p.name, kind: "Playlist", ids: p.ids.filter(hasT), p, empty: "Ajoute des titres avec le bouton ⋯ à côté de n'importe quel titre, puis « Ajouter à une playlist »." };
  return null;
}
function ctxResolve(ref) {
  const [type, ...rest] = ref.split(":"); const key = rest.join(":");
  if (type === "tracks") return { ids: sortedTrackIds(UI.trackSort), label: "Tous les titres" };
  if (type === "album") { const a = L.albums.get(key); return a ? { ids: a.tracks, label: a.title } : null; }
  if (type === "artist") { const a = L.artists.get(key); return a ? { ids: artistTrackIds(key), label: a.name } : null; }
  if (type === "list") { const s = listSpec(key); return s ? { ids: s.ids, label: s.name } : null; }
  if (type === "mix") return { ids: shuffleArr(L.sorted.tracks.filter((x) => L.files.has(x))).slice(0, 100), label: "Mix au hasard" };
  return null;
}
function playCtx(ref, { shuffle = false, start = 0 } = {}) {
  if (Q.ref === ref && Q.current && !shuffle && start === 0) { Player.toggle(); return; }
  const c = ctxResolve(ref); if (!c || !c.ids.length) return toast("Rien à lire ici pour l'instant.");
  if (shuffle && !Q.shuffle) Q.toggleShuffle();
  Q.playList(c.ids, shuffle ? Math.floor(Math.random() * c.ids.length) : start, c.label, ref);
}
const playAlbum = (key) => playCtx("album:" + key);

/* ---- les vues ---- */
const VIEWS = {
  home() {
    if (!L.tracks.size) return heroHTML();
    const h = new Date().getHours();
    const greet = h < 5 ? "Bonne nuit" : h < 12 ? "Bonjour" : h < 18 ? "Bon après-midi" : "Bonsoir";
    let dur = 0; for (const t of L.tracks.values()) dur += t.duration || 0;
    const anyPlays = Object.values(L.stats).some((s) => s.p > 0);
    const tiles = [];
    if (L.likes.size) tiles.push({ act: "open-list", id: "liked", ctx: "list:liked", name: "Titres likés", ic: "heart", tc: "var(--c3)" });
    if (anyPlays) tiles.push({ act: "open-list", id: "top", ctx: "list:top", name: "Les plus écoutés", ic: "bars", tc: "var(--c1)" });
    tiles.push({ act: "play-ctx", ctx: "mix", name: "Mix au hasard", ic: "shuffle", tc: "var(--c2)" });
    if (anyPlays && L.sorted.tracks.some((x) => !playsOf(x))) tiles.push({ act: "open-list", id: "never", ctx: "list:never", name: "Jamais écoutés", ic: "sparkles", tc: "var(--c3)" });
    const albKeys = [...new Set([...recentAlbums(8), ...[...L.albums.values()].sort((a, b) => b.addedAt - a.addedAt).map((a) => a.key)])];
    for (const k of albKeys) { if (tiles.length >= 6) break; const a = L.albums.get(k); tiles.push({ act: "open-album", key: k, ctx: "album:" + k, name: a.title, art: a.artKey, tc: palOf(a.artKey)?.c1 || placeholderColor(a.title) }); }
    const nT = tiles.length >= 6 ? 6 : tiles.length >= 4 ? 4 : tiles.length >= 2 ? 2 : tiles.length;
    const recents = recentAlbums(12);
    const tops = topArtists(10);
    const artistKeys = tops.length >= 3 ? tops.map((x) => x.artist.key) : [...L.artists.values()].sort((a, b) => b.tracks.length - a.tracks.length).slice(0, 10).map((a) => a.key);
    const added = [...L.albums.values()].sort((a, b) => b.addedAt - a.addedAt).slice(0, 12).map((a) => a.key);
    return html`${installCard()}<div class="view-head"><div><h1 class="h-page">${greet}</h1><div class="sub">${plural(L.tracks.size, "titre", "titres")} · ${plural(L.albums.size, "album", "albums")} · ${plural(L.artists.size, "artiste", "artistes")} · ${fmtLong(dur)} de musique</div></div></div>
<div class="tiles n${nT}">${tiles.slice(0, nT).map((t) => html`<button class="tile" style="--tc:${t.tc}" data-act="${t.act}" ${raw(t.id ? `data-id="${esc(t.id)}"` : "")} ${raw(t.key ? `data-key="${esc(t.key)}"` : "")} ${raw(t.act === "play-ctx" ? `data-ctx="${esc(t.ctx)}"` : "")}><span class="tile-art">${t.art && artSmall(t.art) ? html`<img src="${artSmall(t.art)}" alt="">` : icon(t.ic || "disc")}</span><span class="tile-name">${t.name}</span><span class="mini-play" data-act="play-ctx" data-ctx="${t.ctx}" aria-hidden="true">${icon("play")}</span></button>`)}</div>
${shelf("Écouté récemment", recents.map(albumCard))}
${Recap.available() ? html`<section class="sec"><button class="recap-banner" data-act="recap-open"><span class="rb-ic">${icon("sparkles")}</span><span><b>Ton récap de ${MONTHS[new Date().getMonth()]}</b><small>Tes artistes, tes titres, ton humeur et tes heures d'écoute, en mode story.</small></span>${icon("right", "sm")}</button></section>` : ""}
${moodsHTML()}
${shelf("Tes playlists", L.playlists.map(playlistCard))}
${shelf(tops.length >= 3 ? "Tes artistes du moment" : "Tes artistes", artistKeys.map(artistCard), ["artists", "Tout afficher"])}
${shelf("Ajoutés récemment", added.map(albumCard), ["albums", "Tout afficher"])}
${statsHTML()}
<section class="sec"><div class="disc-intro"><div><h2 class="h-sec">Envie de nouveautés ?</h2><p>aurore regarde ce que tu écoutes le plus et demande à Claude des artistes qui devraient te plaire, avec de quoi les écouter tout de suite.</p></div><button class="btn primary" data-act="nav" data-view="discover">${icon("sparkles", "sm")} Voir mes découvertes</button></div></section>`;
  },

  tracks() {
    if (!L.tracks.size) return emptyLib("titres");
    const ids = sortedTrackIds(UI.trackSort);
    let dur = 0; for (const id of ids) dur += L.tracks.get(id).duration || 0;
    return html`<div class="view-head"><div><h1 class="h-page">Titres</h1><div class="sub">${plural(ids.length, "titre", "titres")} · ${fmtLong(dur)}</div></div>
<div class="actions" style="padding:0"><button class="play-big" data-act="play-ctx" data-ctx="tracks" data-play-ctx="tracks" aria-label="Tout lire">${icon(Player.playing && Q.ref === "tracks" ? "pause" : "play")}</button><button class="icon-btn" data-act="shuffle-ctx" data-ctx="tracks" aria-label="Tout lire en aléatoire" title="Aléatoire">${icon("shuffle")}</button><button class="icon-btn" data-act="ctx-menu" data-ctx="tracks" aria-label="Plus d'options">${icon("more")}</button>${UI.trackSort.key !== "default" ? html`<button class="btn sm ghost" data-act="sort" data-key="default">Ordre par artiste</button>` : ""}</div></div>
${trackList(ids, { sort: UI.trackSort, label: "Tous les titres", ref: "tracks" })}`;
  },

  albums() {
    if (!L.albums.size) return L.tracks.size ? html`<div class="empty"><h2>Pas d'album repéré</h2><p>Tes titres n'ont pas de nom d'album dans leurs tags ni de dossiers par album. Ils sont tous dans « Titres ».</p></div>` : emptyLib("albums");
    const sorts = [["artist", "Artiste"], ["title", "Titre"], ["recent", "Ajout récent"], ["year", "Année"], ["plays", "Les plus écoutés"]];
    let list = [...L.albums.values()];
    if (UI.albumGenre) list = list.filter((a) => a.genre && a.genre.toLowerCase().includes(UI.albumGenre.toLowerCase()));
    const s = UI.albumSort;
    list.sort(s === "title" ? (a, b) => cmp(sortKey(a.title), sortKey(b.title)) : s === "recent" ? (a, b) => b.addedAt - a.addedAt : s === "year" ? (a, b) => (b.year || 0) - (a.year || 0) || cmp(a.title, b.title) : s === "plays" ? (a, b) => b.plays - a.plays || cmp(a.title, b.title) : (a, b) => cmp(sortKey(a.artist), sortKey(b.artist)) || (a.year - b.year) || cmp(a.title, b.title));
    const genres = L.genres.slice(0, 10);
    return html`<div class="view-head"><div><h1 class="h-page">Albums</h1><div class="sub">${plural(list.length, "album", "albums")}${UI.albumGenre ? " · " + UI.albumGenre : ""}</div></div></div>
<div class="chips" style="margin-top:18px" role="group" aria-label="Trier par">${sorts.map(([k, l]) => html`<button class="chip" data-act="album-sort" data-key="${k}" aria-pressed="${String(s === k)}">${l}</button>`)}</div>
${genres.length > 1 ? html`<div class="chips" style="margin-top:10px" role="group" aria-label="Filtrer par genre"><button class="chip" data-act="album-genre" data-key="" aria-pressed="${String(!UI.albumGenre)}">Tous les genres</button>${genres.map((g) => html`<button class="chip" data-act="album-genre" data-key="${g.name}" aria-pressed="${String(UI.albumGenre === g.name)}">${g.name}</button>`)}</div>` : ""}
<div class="grid" style="margin-top:24px">${list.map((a) => albumCard(a.key))}</div>`;
  },

  artists() {
    if (!L.artists.size) return emptyLib("artistes");
    const s = UI.artistSort;
    const list = [...L.artists.values()].sort(s === "plays" ? (a, b) => b.plays - a.plays || cmp(a.name, b.name) : s === "tracks" ? (a, b) => b.tracks.length - a.tracks.length : (a, b) => cmp(artistSortKey(a.name), artistSortKey(b.name)));
    return html`<div class="view-head"><div><h1 class="h-page">Artistes</h1><div class="sub">${plural(list.length, "artiste", "artistes")}</div></div></div>
<div class="chips" style="margin-top:18px" role="group" aria-label="Trier par">${[["az", "A → Z"], ["plays", "Les plus écoutés"], ["tracks", "Le plus de titres"]].map(([k, l]) => html`<button class="chip" data-act="artist-sort" data-key="${k}" aria-pressed="${String(s === k)}">${l}</button>`)}</div>
<div class="grid" style="margin-top:24px">${list.map((a) => artistCard(a.key))}</div>`;
  },

  album(key) {
    const a = L.albums.get(key); if (!a) return notFound();
    const p = palOf(a.artKey); const ref = "album:" + key;
    const allLiked = a.tracks.every((id) => L.likes.has(id));
    const others = a.artist !== "Artistes variés" ? [...(L.artists.get(norm(a.artist))?.albums || [])].filter((k) => k !== key) : [];
    return html`<header class="dhead" style="--hc:${p ? p.c1 : placeholderColor(a.title)}">${coverHTML(a.artKey, a.title)}</div>
<div class="dhead-meta"><span class="eyebrow">${a.kind}</span><h1 class="dhead-title${a.title.length > 22 ? " long" : ""}">${a.title}</h1>
<div class="dhead-line">${a.artist !== "Artistes variés" ? html`<button data-act="open-artist" data-key="${norm(a.artist)}"><b>${a.artist}</b></button>` : html`<b>Artistes variés</b>`}${a.year ? html`<span class="dot">${a.year}</span>` : ""}<span class="dot">${plural(a.tracks.length, "titre", "titres")}, ${fmtLong(a.duration)}</span>${a.genre ? html`<span class="dot">${a.genre}</span>` : ""}</div></div></header>
<div class="actions"><button class="play-big" data-act="play-ctx" data-ctx="${ref}" data-play-ctx="${ref}" aria-label="Lire l'album">${icon(Player.playing && Q.ref === ref ? "pause" : "play")}</button>
<button class="icon-btn" data-act="shuffle-ctx" data-ctx="${ref}" aria-label="Lire en aléatoire" title="Aléatoire">${icon("shuffle")}</button>
<button class="icon-btn heart${allLiked ? " on" : ""}" data-act="like-many" data-ctx="${ref}" aria-pressed="${String(allLiked)}" aria-label="${allLiked ? "Retirer l'album des titres likés" : "Liker tout l'album"}">${icon("heart")}</button>
<button class="icon-btn" data-act="ctx-menu" data-ctx="${ref}" aria-label="Plus d'options">${icon("more")}</button></div>
${trackList(a.tracks, { album: false, cover: false, numbering: "track", discs: a.discs > 1, label: a.title, ref })}
${others.length ? shelf(`Plus de ${a.artist}`, others.map(albumCard)) : ""}`;
  },

  artist(key) {
    const ar = L.artists.get(key); if (!ar) return notFound();
    const ref = "artist:" + key; const p = palOf(ar.artKey);
    const ids = artistTrackIds(key);
    const plays = ids.reduce((s, id) => s + playsOf(id), 0);
    const own = [...ar.albums].map((k) => L.albums.get(k)).filter((a) => a && norm(a.artist) === key).sort((a, b) => (b.year || 0) - (a.year || 0));
    const feat = [...ar.albums].map((k) => L.albums.get(k)).filter((a) => a && norm(a.artist) !== key);
    const showAll = UI.artistAll === key;
    return html`<header class="dhead artist" style="--hc:${p ? p.c1 : placeholderColor(ar.name)}">${coverHTML(ar.artKey, ar.name, "artist")}</div>
<div class="dhead-meta"><span class="eyebrow">Artiste</span><h1 class="dhead-title${ar.name.length > 20 ? " long" : ""}">${ar.name}</h1>
<div class="dhead-line"><span>${plural(ids.length, "titre", "titres")}</span>${own.length ? html`<span class="dot">${plural(own.length, "album", "albums")}</span>` : ""}${plays ? html`<span class="dot">écouté ${plural(plays, "fois", "fois")}</span>` : ""}</div></div></header>
<div class="actions"><button class="play-big" data-act="play-ctx" data-ctx="${ref}" data-play-ctx="${ref}" aria-label="Lire ${ar.name}">${icon(Player.playing && Q.ref === ref ? "pause" : "play")}</button>
<button class="icon-btn" data-act="shuffle-ctx" data-ctx="${ref}" aria-label="Lire en aléatoire" title="Aléatoire">${icon("shuffle")}</button>
<button class="btn" data-act="discover-from" data-key="${ar.name}">${icon("sparkles", "sm")} Artistes proches</button><button class="icon-btn" data-act="ctx-menu" data-ctx="${ref}" aria-label="Plus d'options">${icon("more")}</button></div>
<section class="sec" style="margin-top:12px"><div class="sec-head"><h2 class="h-sec">${plays ? "Populaires chez toi" : "Titres"}</h2>${ids.length > 6 ? html`<button class="link" data-act="artist-all" data-key="${key}">${showAll ? "Afficher moins" : `Afficher les ${ids.length}`}</button>` : ""}</div>
${trackList(showAll ? ids : ids.slice(0, 6), { label: ar.name, ref })}</section>
${own.length ? html`<section class="sec"><div class="sec-head"><h2 class="h-sec">Discographie</h2></div><div class="grid">${own.map((a) => albumCard(a.key))}</div></section>` : ""}
${feat.length ? shelf("Apparaît sur", feat.map((a) => albumCard(a.key))) : ""}`;
  },

  list(id) {
    const s = listSpec(id); if (!s) return notFound();
    const ref = "list:" + id;
    let dur = 0; for (const x of s.ids) dur += L.tracks.get(x).duration || 0;
    const arts = [...new Set(s.ids.map((x) => L.tracks.get(x).artKey).filter((k) => k && artSmall(k)))].slice(0, 4);
    const cover = s.auto ? html`<div class="cover" style="--cc:transparent;background:linear-gradient(135deg,${s.mood ? s.mood.c[0] : "var(--c1)"},${s.mood ? s.mood.c[1] : "var(--c3)"})"><div class="ph" style="background:none;color:var(--on-c1)">${icon(s.ic)}</div></div>`
      : s.p && s.p.artKey && artBig(s.p.artKey) ? html`<button class="cover cover-edit" data-act="pl-photo" data-id="${id}" aria-label="Changer la photo de la playlist"><img src="${artBig(s.p.artKey)}" alt=""></button>`
      : html`<${raw(s.p ? `button class="cover cover-edit" data-act="pl-photo" data-id="${esc(id)}" aria-label="Choisir une photo pour la playlist"` : 'div class="cover"')} style="--cc:${placeholderColor(s.name)}">${arts.length >= 4 ? html`<div class="mosaic">${arts.map((k) => html`<img src="${artSmall(k)}" alt="">`)}</div>` : arts.length ? html`<img src="${artBig(arts[0])}" alt="">` : html`<div class="ph">${icon("music")}</div>`}</${raw(s.p ? "button" : "div")}>`;
    const editing = UI.editing === id;
    return html`<header class="dhead" style="--hc:${s.auto ? "var(--c1)" : placeholderColor(s.name)}">${cover}
<div class="dhead-meta"><span class="eyebrow">${s.kind}</span>${editing ? html`<h1 class="dhead-title long"><input class="title-input" id="pl-title" value="${s.name}" aria-label="Nom de la playlist" maxlength="80"></h1>` : html`<h1 class="dhead-title${s.name.length > 20 ? " long" : ""}">${s.p ? html`<button data-act="rename-list" data-id="${id}" title="Renommer" style="font:inherit;letter-spacing:inherit;text-align:left">${s.name}</button>` : s.name}</h1>`}
<div class="dhead-line"><span>${plural(s.ids.length, "titre", "titres")}</span>${dur ? html`<span class="dot">${fmtLong(dur)}</span>` : ""}</div></div></header>
<div class="actions"><button class="play-big" data-act="play-ctx" data-ctx="${ref}" data-play-ctx="${ref}" aria-label="Lire" ${raw(s.ids.length ? "" : "disabled")}>${icon(Player.playing && Q.ref === ref ? "pause" : "play")}</button>
<button class="icon-btn" data-act="shuffle-ctx" data-ctx="${ref}" aria-label="Lire en aléatoire" title="Aléatoire">${icon("shuffle")}</button>
${s.p ? html`<button class="icon-btn" data-act="list-menu" data-id="${id}" aria-label="Options de la playlist">${icon("more")}</button>` : s.ids.length ? html`<button class="icon-btn" data-act="ctx-menu" data-ctx="${ref}" aria-label="Plus d'options">${icon("more")}</button>` : ""}
${UI.confirmDelete === id ? html`<span class="confirm">Supprimer « ${s.name} » ?<button class="btn sm danger" data-act="delete-list" data-id="${id}">Supprimer</button><button class="btn sm ghost" data-act="cancel-delete">Annuler</button></span>` : ""}</div>
${s.ids.length ? trackList(s.ids, { label: s.name, ref, playlist: s.p && !s.smart ? id : null }) : html`<div class="empty" style="padding-top:30px"><p>${s.empty}</p><button class="btn" data-act="nav" data-view="tracks">Parcourir mes titres</button></div>`}`;
  },

  search(q) {
    const nq = norm(q); if (!nq) return VIEWS.home();
    const words = nq.split(" ");
    const hit = (s) => { const n = norm(s); return words.every((w) => n.includes(w)); };
    const scoreT = (t) => { const tn = norm(t.title); let s = 0; if (tn === nq) s += 6; else if (tn.startsWith(nq)) s += 4; else if (tn.includes(nq)) s += 3; if (norm(t.artist).includes(nq)) s += 2; if (norm(t.album).includes(nq)) s += 1; if (!s && hit(t.title + " " + t.artist + " " + t.album)) s = .5; return s; };
    const tracks = []; for (const t of L.tracks.values()) { const s = scoreT(t); if (s) tracks.push([t.id, s + Math.min(1, playsOf(t.id) / 20)]); }
    tracks.sort((a, b) => b[1] - a[1]);
    const ids = tracks.slice(0, 50).map((x) => x[0]);
    const artists = [...L.artists.values()].filter((a) => hit(a.name)).sort((a, b) => (norm(b.name).startsWith(nq) - norm(a.name).startsWith(nq)) || b.plays - a.plays).slice(0, 12);
    const albums = [...L.albums.values()].filter((a) => hit(a.title + " " + a.artist)).sort((a, b) => (norm(b.title).startsWith(nq) - norm(a.title).startsWith(nq)) || b.plays - a.plays).slice(0, 12);
    if (!ids.length && !artists.length && !albums.length && !HUMEURS.some((m) => words.some((w) => w.length > 2 && norm(m.name).startsWith(w))) && !/humeur|ambiance|mood/.test(nq)) return html`<div class="empty"><div class="big-ic">${icon("search", "lg")}</div><h2>Aucun résultat pour « ${q} »</h2><p>Vérifie l'orthographe, ou essaie un bout du titre, de l'artiste ou de l'album.</p><button class="btn" data-act="nav" data-view="discover">${icon("sparkles", "sm")} Chercher de nouveaux artistes</button></div>`;
    const moodHits = HUMEURS.filter((m) => words.some((w) => w.length > 2 && (norm(m.name).startsWith(w) || norm(m.hint).includes(w))) || (nq.length > 2 && /humeur|ambiance|mood/.test(nq)));
    return html`<div class="view-head"><div><h1 class="h-page">Résultats</h1><div class="sub">pour « ${q} »</div></div></div>
${moodHits.length ? html`<section class="sec"><div class="sec-head"><h2 class="h-sec">Humeurs</h2></div><div class="moods">${moodHits.map((m) => moodCard(m, An.moods()[m.k].length))}</div></section>` : ""}
${artists.length ? shelf("Artistes", artists.map((a) => artistCard(a.key))) : ""}
${ids.length ? html`<section class="sec"><div class="sec-head"><h2 class="h-sec">Titres</h2></div>${trackList(ids.slice(0, 20), { label: `Recherche « ${q} »`, ref: "search:" + q })}</section>` : ""}
${albums.length ? shelf("Albums", albums.map((a) => albumCard(a.key))) : ""}`;
  },

  discover() { return Disc.view(); },
};

function statsHTML() {
  const days = []; const now = new Date();
  for (let i = 6; i >= 0; i--) { const d = new Date(now); d.setDate(now.getDate() - i); days.push({ d, s: L.days[dayKey(d)] || 0 }); }
  const week = days.reduce((s, x) => s + x.s, 0);
  const totalPlays = Object.values(L.stats).reduce((s, x) => s + (x.p || 0), 0);
  if (!week && !totalPlays) return "";
  const max = Math.max(...days.map((x) => x.s), 1);
  const top = topArtists(1)[0]; const tt = topTracks(1)[0]; const tTrack = tt && L.tracks.get(tt);
  const D = ["D", "L", "M", "M", "J", "V", "S"];
  return html`<section class="sec"><div class="sec-head"><h2 class="h-sec">Ton écoute</h2></div><div class="stats">
<div class="stat"><small>Ces 7 derniers jours</small><div class="v">${fmtLong(week)}</div><div class="week" role="img" aria-label="Minutes écoutées par jour sur 7 jours">${days.map((x) => html`<div title="${x.d.toLocaleDateString("fr-FR", { weekday: "long" })} : ${fmtLong(x.s)}"><i class="${x.s ? "" : "zero"}" style="height:${Math.max(4, (x.s / max) * 100)}%"></i><span>${D[x.d.getDay()]}</span></div>`)}</div></div>
<div class="stat"><small>Artiste n°1</small><div class="v">${top ? top.artist.name : "–"}</div><div class="s">${top ? plural(top.plays, "écoute", "écoutes") : "Pas encore assez d'écoutes"}</div></div>
<div class="stat"><small>Titre n°1</small><div class="v">${tTrack ? tTrack.title : "–"}</div><div class="s">${tTrack ? `${tTrack.artist} · ${plural(playsOf(tt), "écoute", "écoutes")}` : ""}</div></div>
<div class="stat"><small>Écoutes au total</small><div class="v mono">${totalPlays.toLocaleString("fr-FR")}</div><div class="s">un titre compte après 30 s</div></div>
</div></section>`;
}
