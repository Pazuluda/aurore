/* ===================== guide illustré : aurore dans Android Auto ===================== */
/* Android Auto n'affiche que les apps du Play Store, sauf si on autorise les « sources inconnues »
   dans son mode développeur. Le guide montre chaque écran, avec l'endroit où toucher. */
const AUTO_STEPS = [
  {
    title: "Ouvre les réglages d'Android Auto",
    text: "Android Auto n'affiche que les apps du Play Store. aurore s'installe sans le Store : il faut l'autoriser une fois, ça prend une minute.",
    how: "Touche « Ouvrir Android Auto » ci-dessous, puis « Paramètres supplémentaires dans l'application ».",
    open: true,
    art: () => phone(html`${bar("Infos sur l'appli")}
      <div class="g-apphead"><span class="g-appic">${icon("car")}</span><b>Android Auto</b><small>Installée</small></div>
      <div class="g-btns"><span>Ouvrir</span><span>Forcer l'arrêt</span></div>
      ${rowg("Notifications")}${rowg("Autorisations")}
      ${rowg("Paramètres supplémentaires dans l'application", "hit")}`),
  },
  {
    title: "Touche 10 fois « Version »",
    text: "Tout en bas des réglages d'Android Auto, touche la ligne « Version » une dizaine de fois de suite.",
    how: "Le téléphone compte les touches, comme pour un code secret.",
    art: () => phone(html`${bar("Android Auto", true)}
      ${rowg("Démarrer Android Auto automatiquement")}${rowg("Écran")}${rowg("Messages")}${rowg("Notifications")}
      <div class="g-sec">À propos</div>
      ${rowg("Version", "hit tap10", "13.4.6")}`, html`<span class="g-count" aria-hidden="true">×10</span>`),
  },
  {
    title: "Accepte le mode développeur",
    text: "Une fenêtre te demande d'autoriser les paramètres de développement.",
    how: "Touche « OK ». Rien ne change dans ta voiture pour l'instant.",
    art: () => phone(html`${bar("Android Auto", true)}
      ${rowg("Démarrer Android Auto automatiquement")}${rowg("Écran")}${rowg("Messages")}${rowg("Version", "", "13.4.6")}
      <div class="g-dim"></div>
      <div class="g-dialog"><b>Autoriser les paramètres de développement ?</b><p>Ces paramètres sont destinés aux développeurs.</p><div><span>Annuler</span><span class="hit">OK</span></div></div>`),
  },
  {
    title: "Ouvre les paramètres pour développeurs",
    text: "Toujours dans les réglages d'Android Auto, touche les trois points en haut à droite.",
    how: "Choisis « Paramètres pour les développeurs ».",
    art: () => phone(html`${bar("Android Auto", true, true)}
      ${rowg("Démarrer Android Auto automatiquement")}${rowg("Écran")}${rowg("Messages")}${rowg("Notifications")}
      <div class="g-menu"><span class="hit">Paramètres pour les développeurs</span><span>Quitter le mode développeur</span><span>Aide et commentaires</span></div>`),
  },
  {
    title: "Coche « Sources inconnues »",
    text: "Fais défiler la liste jusqu'à « Sources inconnues » et coche la case.",
    how: "C'est ce réglage qui laisse aurore apparaître dans la voiture.",
    art: () => phone(html`${bar("Paramètres pour les développeurs", true)}
      ${rowg("Mode d'application")}${rowg("Résolution vidéo")}${rowg("Enregistrer le journal du véhicule")}
      <div class="g-row hit g-check"><span>Sources inconnues<small>Autoriser les applis hors Play Store</small></span><i class="g-box">${icon("check", "sm")}</i></div>
      ${rowg("Afficher les cadres de débogage")}`),
  },
  {
    title: "Branche ton téléphone",
    text: "Connecte ton téléphone à la voiture : aurore apparaît avec les autres apps. Tes playlists, albums et artistes sont là, et tu peux dire « Joue … sur aurore ».",
    how: "Tu ne la vois pas ? Dans les réglages d'Android Auto, ouvre « Écran » puis « Personnaliser le lanceur » et coche aurore. Débranche et rebranche le téléphone.",
    art: () => html`<div class="g-car" aria-hidden="true">
      <div class="g-car-side">${icon("home", "sm")}${icon("car", "sm")}${icon("music", "sm")}</div>
      <div class="g-car-grid">${["Maps", "Téléphone", "Messages", "aurore", "Agenda", "Météo"].map((n) => html`<span class="${n === "aurore" ? "hit g-me" : ""}"><i>${n === "aurore" ? raw(brandMark()) : ""}</i>${n}</span>`)}</div>
    </div>`,
  },
];
function brandMark() { return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="11" width="3" height="9" rx="1.5" fill="#a08cff"/><rect x="8.2" y="6" width="3" height="14" rx="1.5" fill="#7fb0f0"/><rect x="13.4" y="9" width="3" height="11" rx="1.5" fill="#5fd0d8"/><rect x="18.6" y="4" width="3" height="16" rx="1.5" fill="#3fe0c5"/></svg>'; }
const bar = (t, back, dots) => html`<div class="g-bar">${back ? icon("back", "sm") : ""}<b>${t}</b>${dots ? html`<span class="hit g-dots">⋮</span>` : html`<span class="g-dots">⋮</span>`}</div>`;
const rowg = (t, cls = "", val = "") => html`<div class="g-row ${cls}"><span>${t}</span>${val ? html`<small>${val}</small>` : ""}</div>`;
const phone = (inner, extra = "") => html`<div class="g-phone" aria-hidden="true"><div class="g-screen">${inner}</div></div>${extra}`;

const Guide = {
  i: 0,
  open(start = 0) { this.i = start; this.render(); $("#guide").hidden = false; requestAnimationFrame(() => $("#guide").classList.add("open")); UI.histPush("guide"); this.bind(); },
  close(fromPop) { const g = $("#guide"); if (!g || g.hidden) return; if (!fromPop) UI.histPop(); g.classList.remove("open"); setTimeout(() => { g.hidden = true; g.innerHTML = ""; }, 260); store.set("autoGuideSeen", true); },
  go(d) { const n = clamp(this.i + d, 0, AUTO_STEPS.length - 1); if (n === this.i) return; this.dir = d; this.i = n; this.render(); },
  render() {
    const s = AUTO_STEPS[this.i], n = AUTO_STEPS.length, last = this.i === n - 1;
    setHTML($("#guide"), html`<div class="g-card" role="dialog" aria-modal="true" aria-labelledby="g-title">
  <div class="g-top"><span class="g-kicker">${icon("car", "sm")} Android Auto</span><span class="g-step" aria-live="polite">Étape ${this.i + 1} sur ${n}</span><button class="icon-btn" data-act="guide-close" aria-label="Fermer le guide">${icon("x")}</button></div>
  <div class="g-progress" aria-hidden="true">${AUTO_STEPS.map((_, k) => html`<i class="${k < this.i ? "done" : k === this.i ? "on" : ""}"></i>`)}</div>
  <div class="g-stage ${this.dir < 0 ? "from-left" : "from-right"}" data-step="${this.i}">${s.art()}</div>
  <div class="g-text"><h2 id="g-title">${s.title}</h2><p>${s.text}</p><p class="g-how">${icon("info", "sm")}<span>${s.how}</span></p></div>
  ${s.open ? html`<button class="btn primary g-open" data-act="guide-open-auto">${icon("external", "sm")} Ouvrir Android Auto</button>` : ""}
  <div class="g-nav"><button class="btn ghost" data-act="guide-prev" ${raw(this.i ? "" : "disabled")}>${icon("back", "sm")} Précédent</button>${last ? html`<button class="btn primary" data-act="guide-close">C'est fait</button>` : html`<button class="btn primary" data-act="guide-next">Suivant ${icon("right", "sm")}</button>`}</div>
  <p class="g-note">Les noms peuvent changer un peu selon ton téléphone (Samsung, Pixel, Xiaomi…).</p>
</div>`);
    this.dir = 0;
  },
  bind() {
    if (this.bound) return; this.bound = true;
    const g = $("#guide"); let s = null;
    g.addEventListener("pointerdown", (e) => { if (e.target.closest("button")) return; s = { x: e.clientX, y: e.clientY }; });
    g.addEventListener("pointerup", (e) => { if (!s) return; const dx = e.clientX - s.x, dy = e.clientY - s.y; s = null; if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) this.go(dx < 0 ? 1 : -1); });
    g.addEventListener("click", (e) => { if (e.target === g) this.close(); });
    document.addEventListener("keydown", (e) => { if (g.hidden) return; if (e.key === "ArrowRight") this.go(1); else if (e.key === "ArrowLeft") this.go(-1); });
  },
  async openAuto() {
    if (!AndroidMusic) return toast("Ouvre ce guide depuis l'app aurore sur ton téléphone.");
    try {
      const r = await AndroidMusic.call("openAuto");
      if (!r.installed) toast("Android Auto n'est pas installé sur ce téléphone. Installe-le depuis le Play Store, puis reviens ici.", { ms: 8000 });
      else if (r.opened !== "details") toast("Ouvre les Paramètres du téléphone, puis Applications et Android Auto.", { ms: 8000 });
    } catch { toast("Mets aurore à jour pour ouvrir Android Auto d'ici. Sinon : Paramètres du téléphone, puis Applications et Android Auto.", { ms: 8000 }); }
  },
};
