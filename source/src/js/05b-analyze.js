/* ===================== écoute des titres : volume, énergie, tempo, brillance → humeurs ===================== */
/* Chaque titre est décodé une fois, en arrière-plan et en basse définition (11 kHz, mono).
   On en tire : le volume moyen (pour égaliser le volume), le pic, le tempo et la netteté du rythme,
   l'énergie, la brillance et les variations. Rien ne sort de l'appareil. */
const AN_VERSION = 1;
const HUMEURS = [
  { k: "calme", name: "Calme", ic: "moon", c: ["#6d7dff", "#8fd3ff"], hint: "Doux, lent, posé" },
  { k: "energique", name: "Énergique", ic: "bolt", c: ["#ff5c6c", "#ffb547"], hint: "Fort, rapide, ça pousse" },
  { k: "dansant", name: "Dansant", ic: "disc", c: ["#ff4fbf", "#8b5cff"], hint: "Un rythme net qui fait bouger" },
  { k: "lumineux", name: "Lumineux", ic: "sun", c: ["#ffd84d", "#4fe3b5"], hint: "Clair, brillant, solaire" },
  { k: "sombre", name: "Sombre", ic: "cloud", c: ["#4b3f8f", "#1f8a9a"], hint: "Grave, feutré, nocturne" },
  { k: "focus", name: "Concentration", ic: "target", c: ["#3fe0c5", "#5b8cff"], hint: "Régulier, pour bosser" },
];

const An = {
  queue: [], busy: false, done: 0, total: 0, paused: false, cache: null,
  todo() { return [...L.tracks.values()].filter((t) => !t.demo && L.files.has(t.id) && (!t.an || t.an.v !== AN_VERSION) && !(t.anFail >= 2)).map((t) => t.id); },
  start() {
    if (this.busy) return;
    this.queue = this.todo(); this.total = this.queue.length + this.countDone(); this.done = this.countDone();
    if (!this.queue.length) return;
    this.busy = true; this.loop();
  },
  countDone() { let n = 0; for (const t of L.tracks.values()) if (t.an && t.an.v === AN_VERSION) n++; return n; },
  async loop() {
    while (this.queue.length) {
      if (document.hidden || L.importing || this.paused) { await sleep(3000); continue; }
      const id = this.queue.shift(); const t = L.tracks.get(id); if (!t || !L.files.has(id)) continue;
      try {
        t.an = await this.analyze(L.files.get(id));
        delete t.anFail;
      } catch { t.anFail = (t.anFail || 0) + 1; }
      DB.put("tracks", t.id, t).catch(() => {});
      this.done = this.countDone(); this.cache = null;
      if (Player.id === id) Fx.applyTrack(id);
      if (this.done % 10 === 0 || !this.queue.length) { UI.onAnalysis && UI.onAnalysis(); if (NP && NP.ok) NP.exportSoon(); }
      await sleep(IS_MOBILE ? 600 : 150);
    }
    const more = this.todo(); this.busy = false;
    if (more.length) return this.start();
    UI.onAnalysis && UI.onAnalysis();
  },
  async analyze(f) {
    if (f.size > 120e6) throw new Error("trop gros");
    const ab = await (await asBlob(f)).arrayBuffer();
    const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ctx = new AC(1, 1, 11025);
    const buf = await new Promise((res, rej) => { const p = ctx.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); });
    const n = buf.length, ch = buf.numberOfChannels, sr = buf.sampleRate;
    const x = new Float32Array(n);
    for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) x[i] += d[i] / ch; }
    return this.features(x, sr);
  },
  features(x, sr) {
    const N = 512, H = 256, frames = Math.max(1, Math.floor((x.length - N) / H));
    const e = new Float32Array(frames); let peak = 0, zc = 0, zn = 0;
    for (let f = 0; f < frames; f++) {
      let s = 0; const o = f * H;
      for (let i = 0; i < N; i++) { const v = x[o + i]; s += v * v; }
      e[f] = s / N;
    }
    for (let i = 1; i < x.length; i += 2) { const v = Math.abs(x[i]); if (v > peak) peak = v; if ((x[i] >= 0) !== (x[i - 1] >= 0)) zc++; zn++; }
    /* volume : moyenne d'énergie des passages audibles (porte à -10 dB sous la moyenne) */
    let mean = 0; for (const v of e) mean += v; mean /= frames;
    const gate = mean * .1; let g = 0, gn = 0; for (const v of e) if (v > gate && v > 1e-7) { g += v; gn++; }
    const loud = 10 * Math.log10((gn ? g / gn : mean) + 1e-12);
    /* variations : écart type du niveau (en dB) */
    let m2 = 0, m1 = 0, k = 0; for (const v of e) if (v > gate && v > 1e-7) { const d = 10 * Math.log10(v); m1 += d; m2 += d * d; k++; }
    const dyn = k ? Math.sqrt(Math.max(0, m2 / k - (m1 / k) ** 2)) : 0;
    /* attaques : hausse du niveau d'une trame à l'autre */
    const on = new Float32Array(frames); let onSum = 0;
    for (let f = 1; f < frames; f++) { const d = Math.log10(e[f] + 1e-9) - Math.log10(e[f - 1] + 1e-9); on[f] = d > 0 ? d : 0; onSum += on[f]; }
    const onMean = onSum / frames; for (let f = 0; f < frames; f++) on[f] -= onMean;
    /* tempo : autocorrélation des attaques entre 60 et 180 BPM */
    const fps = sr / H; let best = 0, bestLag = 0, zero = 0;
    for (let f = 0; f < frames; f++) zero += on[f] * on[f];
    const lo = Math.floor(fps * 60 / 180), hi = Math.ceil(fps * 60 / 60);
    const ac = new Float32Array(hi + 2);
    for (let lag = lo; lag <= hi; lag++) { let s = 0; for (let f = lag; f < frames; f++) s += on[f] * on[f - lag]; ac[lag] = s; }
    for (let lag = lo; lag <= hi; lag++) { const bpm = 60 * fps / lag; const w = Math.exp(-((Math.log2(bpm / 115)) ** 2) / 1.2); const v = ac[lag] * w; if (v > best) { best = v; bestLag = lag; } }
    let bpm = bestLag ? 60 * fps / bestLag : 0;
    if (bestLag > lo && bestLag < hi) { const a = ac[bestLag - 1], b = ac[bestLag], c = ac[bestLag + 1], d = a - 2 * b + c; if (d) bpm = 60 * fps / (bestLag + .5 * (a - c) / d); }
    const pulse = zero > 0 ? clamp(ac[bestLag] / zero, 0, 1) : 0;
    const bright = zn ? zc / zn : 0;
    const r = (v, d = 2) => +v.toFixed(d);
    return { v: AN_VERSION, loud: r(loud, 1), peak: r(20 * Math.log10(peak + 1e-9), 1), bpm: r(bpm, 0), pulse: r(pulse, 3), bright: r(bright, 4), dyn: r(dyn, 2), onset: r(onMean * 100, 3) };
  },
  /* humeurs : chaque titre est comparé au reste de ta bibliothèque */
  moods() {
    if (this.cache) return this.cache;
    const ts = [...L.tracks.values()].filter((t) => t.an && t.an.v === AN_VERSION);
    const out = Object.fromEntries(HUMEURS.map((m) => [m.k, []]));
    if (ts.length < 3) return (this.cache = out);
    const rank = (key) => { const s = ts.map((t) => t.an[key]).sort((a, b) => a - b); return (v) => { let lo = 0, hi = s.length; while (lo < hi) { const m = (lo + hi) >> 1; if (s[m] < v) lo = m + 1; else hi = m; } return lo / Math.max(1, s.length - 1); }; };
    const rL = rank("loud"), rO = rank("onset"), rB = rank("bright"), rP = rank("pulse"), rD = rank("dyn");
    for (const t of ts) {
      const a = t.an, E = (rL(a.loud) + rO(a.onset) * 1.4) / 2.4, B = rB(a.bright), P = rP(a.pulse), D = rD(a.dyn), g = (t.genre || "").toLowerCase();
      const soft = /class|ambient|piano|chill|lo-?fi|jazz|acoust|folk|ballad|new age|soundtrack|bande/.test(g), hard = /metal|rock|punk|edm|dubstep|drum|trap|hardstyle|techno|rap/.test(g), dance = /dance|house|disco|funk|electro|pop|reggaeton|afro|club/.test(g);
      const sc = {
        calme: (1 - E) * 1.2 + (soft ? .35 : 0) - (hard ? .4 : 0) + (a.bpm < 95 ? .15 : 0),
        energique: E * 1.2 + (hard ? .35 : 0) - (soft ? .3 : 0) + (a.bpm > 125 ? .1 : 0),
        dansant: P * .8 + E * .4 + (a.bpm >= 95 && a.bpm <= 135 ? .25 : -.2) + (dance ? .35 : 0),
        lumineux: B * 1.1 + (E > .25 && E < .9 ? .2 : 0) - (D > .8 ? .1 : 0),
        sombre: (1 - B) * 1.1 + (E < .6 ? .2 : -.2),
        focus: (1 - D) * .7 + (E > .15 && E < .6 ? .45 : -.2) + (soft ? .2 : 0) - (P > .85 ? .1 : 0),
      };
      for (const m of HUMEURS) if (sc[m.k] > 1) out[m.k].push([t.id, sc[m.k]]);
    }
    for (const k in out) out[k] = out[k].sort((a, b) => b[1] - a[1]).map((x) => x[0]);
    return (this.cache = out);
  },
  moodOf(k) { return HUMEURS.find((m) => m.k === k); },
};

/* ===================== égaliseur et volume égalisé ===================== */
const EQ_FREQS = [60, 170, 600, 1500, 4000, 11000];
const EQ_PRESETS = [
  ["plat", "Plat", [0, 0, 0, 0, 0, 0]],
  ["basses", "Basses +", [6, 4, 0, 0, 0, 0]],
  ["soiree", "Soirée", [5, 3, -1, 0, 2, 4]],
  ["voix", "Voix", [-2, -1, 2, 4, 3, 0]],
  ["acoustique", "Acoustique", [2, 1, 1, 2, 2, 3]],
  ["electro", "Électro", [5, 3, 0, -1, 2, 4]],
  ["nuit", "Nuit (doux)", [2, 1, 0, -1, -3, -5]],
  ["aigus", "Aigus +", [0, 0, 0, 1, 4, 6]],
];
const Fx = {
  eq: store.get("eq", [0, 0, 0, 0, 0, 0]), eqOn: store.get("eqOn", false), preset: store.get("eqPreset", "plat"), norm: store.get("norm", true),
  /* gain d'un titre pour l'amener au même volume que les autres (cible -18 dB, sans saturer) */
  trackGain(id) {
    const a = L.tracks.get(id)?.an; if (!this.norm || !a || a.v !== AN_VERSION) return 0;
    let g = -18 - a.loud; g = Math.min(g, -a.peak - .5 + 3); return clamp(+g.toFixed(1), -12, 6);
  },
  /* l'égaliseur gonfle certaines fréquences : on baisse un peu le tout pour ne pas saturer */
  preamp() { return this.eqOn ? -Math.max(0, ...this.eq) * .6 : 0; },
  set(eq, preset) { this.eq = eq.map((v) => clamp(Math.round(v * 2) / 2, -12, 12)); if (preset) this.preset = preset; store.set("eq", this.eq); store.set("eqPreset", this.preset); this.apply(); },
  setOn(on) { this.eqOn = on; store.set("eqOn", on); this.apply(); },
  setNorm(on) { this.norm = on; store.set("norm", on); this.apply(); if (Player.id) this.applyTrack(Player.id); },
  apply() {
    Player.applyFx();
    if (NP && NP.ok) NP.call("pfx", { eq: this.eq, eqOn: this.eqOn, preamp: this.preamp(), norm: this.norm }).catch(() => {});
  },
  applyTrack(id) { Player.applyFx(id); },
  /* courbe de réponse (pour le dessin), en dB, aux fréquences demandées */
  response(freqs, sr = 48000) {
    const out = new Float32Array(freqs.length);
    if (!this.eqOn) return out;
    EQ_FREQS.forEach((f0, b) => {
      const c = biquad(b, f0, this.eq[b], sr); if (!c) return;
      freqs.forEach((f, i) => {
        const w = 2 * Math.PI * f / sr, cos1 = Math.cos(w), sin1 = Math.sin(w), cos2 = Math.cos(2 * w), sin2 = Math.sin(2 * w);
        const nr = c[0] + c[1] * cos1 + c[2] * cos2, ni = -(c[1] * sin1 + c[2] * sin2), dr = 1 + c[3] * cos1 + c[4] * cos2, di = -(c[3] * sin1 + c[4] * sin2);
        out[i] += 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di));
      });
    });
    return out;
  },
};
/* même formule que le lecteur Android (RBJ) : étagères aux bouts, cloches au milieu */
function biquad(b, f0, db, sr) {
  if (!db || f0 >= sr * .45) return null;
  const A = Math.pow(10, db / 40), w = 2 * Math.PI * f0 / sr, cs = Math.cos(w), sn = Math.sin(w);
  let b0, b1, b2, a0, a1, a2;
  if (b === 0 || b === EQ_FREQS.length - 1) {
    const S = 1, al = sn / 2 * Math.sqrt((A + 1 / A) * (1 / S - 1) + 2), sq = 2 * Math.sqrt(A) * al;
    if (b === 0) { b0 = A * ((A + 1) - (A - 1) * cs + sq); b1 = 2 * A * ((A - 1) - (A + 1) * cs); b2 = A * ((A + 1) - (A - 1) * cs - sq); a0 = (A + 1) + (A - 1) * cs + sq; a1 = -2 * ((A - 1) + (A + 1) * cs); a2 = (A + 1) + (A - 1) * cs - sq; }
    else { b0 = A * ((A + 1) + (A - 1) * cs + sq); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - sq); a0 = (A + 1) - (A - 1) * cs + sq; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - sq; }
  } else {
    const Q = 1.1, al = sn / (2 * Q);
    b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A;
  }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}
