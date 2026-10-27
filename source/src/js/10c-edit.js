/* ===================== modifier les infos d'un titre ou d'un album ===================== */
/* Les changements sont gardés dans aurore (tes fichiers ne sont pas modifiés) et survivent
   aux nouvelles recherches de musique. */
const Edit = {
  kind: null, id: null, pic: null, picUrl: "", dropPic: false,
  load(K) { L.edits = K.edits || {}; },
  save() { DB.put("kv", "edits", L.edits); },
  /* appliqué à un titre tout juste importé */
  applyTo(t) {
    const e = L.edits && L.edits[t.id]; if (!e) return;
    for (const k of ["title", "artist", "album", "year", "genre", "artKey"]) if (e[k] != null) t[k] = e[k];
    if (e.artist != null) t.artists = splitArtists(t.artist).length ? splitArtists(t.artist) : [t.artist];
    if (e.album != null) t.albumKey = e.albumKey != null ? e.albumKey : t.albumKey;
  },
  openTrack(id) { const t = L.tracks.get(id); if (!t) return; this.kind = "track"; this.id = id; this.reset(); this.render(t.title, t.artist, t.album, t.year, t.genre, t.artKey); },
  openAlbum(key) { const a = L.albums.get(key); if (!a) return; this.kind = "album"; this.id = key; this.reset(); this.render(a.title, a.artist === "Artistes variés" ? "" : a.artist, null, a.year, a.genre || "", a.artKey); },
  reset() { if (this.picUrl) URL.revokeObjectURL(this.picUrl); this.pic = null; this.picUrl = ""; this.dropPic = false; },
  render(title, artist, album, year, genre, artKey) {
    const isAlbum = this.kind === "album", cover = this.picUrl || (!this.dropPic && artKey ? artBig(artKey) : "");
    openSheet(html`<div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><h2>${isAlbum ? "Modifier l'album" : "Modifier le titre"}</h2><button class="icon-btn" data-act="close-sheet" aria-label="Fermer">${icon("x")}</button></div>
<form class="edit" id="edit-form" autocomplete="off">
  <div class="edit-cover">
    <div class="edit-pic" style="--cc:${placeholderColor(title || "?")}">${cover ? html`<img src="${cover}" alt="Pochette">` : html`<div class="ph">${icon(isAlbum ? "disc" : "music", "lg")}</div>`}</div>
    <div class="edit-pic-btns"><label class="btn sm">${icon("image", "sm")} Choisir une image<input type="file" accept="image/*" id="edit-file" hidden></label>${cover ? html`<button type="button" class="btn sm ghost" data-act="edit-nopic">Retirer</button>` : ""}<small>${isAlbum ? "Pour tous les titres de l'album." : "JPEG, PNG ou WebP."}</small></div>
  </div>
  <label class="field"><span>${isAlbum ? "Nom de l'album" : "Titre"}</span><input name="title" value="${title || ""}" required maxlength="200"></label>
  <label class="field"><span>Artiste</span><input name="artist" value="${artist || ""}" maxlength="200" placeholder="${isAlbum ? "Artistes variés" : "Artiste inconnu"}"></label>
  ${isAlbum ? "" : html`<label class="field"><span>Album</span><input name="album" value="${album || ""}" maxlength="200" placeholder="Aucun (single)"></label>`}
  <div class="field-row"><label class="field"><span>Année</span><input name="year" value="${year || ""}" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" placeholder="2024"></label><label class="field"><span>Genre</span><input name="genre" value="${genre || ""}" maxlength="60" placeholder="Pop, jazz…"></label></div>
  <p class="edit-note">${icon("info", "sm")}<span>Gardé dans aurore : tes fichiers ne sont pas modifiés.</span></p>
  <div class="edit-actions">${this.kind === "track" && L.edits[this.id] ? html`<button type="button" class="btn ghost" data-act="edit-undo">Revenir aux infos du fichier</button>` : html`<span></span>`}<button type="submit" class="btn primary">Enregistrer</button></div>
</form>`);
    const f = $("#edit-form");
    f.addEventListener("submit", (e) => { e.preventDefault(); this.commit(new FormData(f)); });
    $("#edit-file").addEventListener("change", (e) => { const file = e.target.files && e.target.files[0]; if (!file) return; this.reset(); this.pic = file; this.picUrl = URL.createObjectURL(file); const d = new FormData(f); this.render(d.get("title"), d.get("artist"), d.get("album"), d.get("year"), d.get("genre"), artKey); });
    if (!isTouch()) f.querySelector("input[name='title']").focus();
  },
  async commit(d) {
    const val = (k) => (d.get(k) == null ? null : String(d.get(k)).trim());
    const title = val("title"), artist = val("artist"), album = val("album"), year = cleanYear(val("year")), genre = val("genre");
    if (!title) return toast("Le titre ne peut pas être vide.");
    const ids = this.kind === "album" ? (L.albums.get(this.id)?.tracks || []) : [this.id];
    let artKey = null;
    if (this.pic) {
      const art = await makeArt(this.pic).catch(() => null);
      if (!art) return toast("Cette image n'a pas pu être lue. Essaie un JPEG ou un PNG.");
      artKey = "e" + hash(this.kind + this.id + Date.now());
      L.art.set(artKey, art); DB.put("art", artKey, { big: art.big, small: art.small, colors: art.colors });
      if (NP && NP.ok) NP.art.delete(artKey);
    } else if (this.dropPic) artKey = "";
    for (const id of ids) {
      const t = L.tracks.get(id); if (!t) continue;
      const e = (L.edits[id] ||= {});
      if (this.kind === "album") { e.album = t.album = title; e.albumKey = t.albumKey; }
      else {
        t.title = e.title = title;
        if (album !== t.album) { t.album = e.album = album; let dir = dirOf(t.path); const last = dir.split("/").pop(); if (DISC_DIR.test(last)) dir = dirOf(dir); t.albumKey = e.albumKey = album ? "a" + hash(norm(album) + "|" + dir) : ""; }
      }
      if (artist || this.kind === "track") { t.artist = e.artist = artist || UNKNOWN_ARTIST; t.artists = splitArtists(t.artist).length ? splitArtists(t.artist) : [t.artist]; }
      if (this.kind === "album" && artist) t.albumArtist = artist;
      t.year = e.year = year; t.genre = e.genre = genre;
      if (artKey !== null) t.artKey = e.artKey = artKey;
      DB.put("tracks", t.id, t);
    }
    this.save(); this.reset(); closeSheet();
    rebuildIndex(); An.cache = null;
    if (ids.includes(Q.current)) UI.setTrackInfo(Q.current);
    UI.onLibraryChanged();
    if (this.kind === "album" && !L.albums.has(this.id)) UI.go("albums", null, { push: false });
    if (NP && NP.ok) { NP.exportSoon(); if (Player.mode === "native") NP.refreshSoon(); }
    toast(this.kind === "album" ? "Album mis à jour." : "Titre mis à jour.");
  },
  undo() {
    const id = this.id; delete L.edits[id]; this.save(); closeSheet();
    toast("Les infos du fichier reviendront à la prochaine recherche de musique.", { ms: 6000 });
    const t = L.tracks.get(id); if (!t) return;
    L.tracks.delete(id); DB.del("tracks", id); rebuildIndex(); UI.onLibraryChanged();
    const f = L.files.get(id); if (f) importEntries([{ file: f, path: t.path }], { quiet: true });
  },
};
