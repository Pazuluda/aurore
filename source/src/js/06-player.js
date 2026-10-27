/* ===================== moteur audio ===================== */
const Player = {
  audio: null, ctx: null, src: null, fade: null, vol: null, analyser: null,
  mode: "element", preferBuffer: false, split: false, shadow: null,
  buf: null, bsrc: null, bStart: 0, bOffset: 0,
  url: null, id: null, playing: false, loading: false, token: 0,
  volume: store.get("volume", 0.85), muted: false,
  handlers: {},
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); },
  emit(ev, ...a) { for (const fn of this.handlers[ev] || []) try { fn(...a); } catch (e) { console.error(e); } },

  init() {
    const a = (this.audio = new Audio());
    a.preload = "auto";
    a.addEventListener("ended", () => { if (this.mode === "element") { this.playing = false; this.emit("ended"); } });
    a.addEventListener("loadedmetadata", () => this.emit("meta"));
    a.addEventListener("error", () => this.onElementError());
    a.addEventListener("pause", () => { if (this.mode === "element" && this.playing && !a.ended && !this._pausing) { this.playing = false; this.emit("state"); } });
    a.addEventListener("play", () => { if (this.mode === "element" && !this.playing) { this.playing = true; this.emit("state"); } });
    // Sur téléphone, le son ne passe pas par Web Audio : iOS coupe Web Audio écran verrouillé.
    // Une copie muette du titre alimente le visualiseur quand l'écran est allumé.
    this.split = IS_MOBILE;
    if (this.split) {
      this.shadow = new Audio(); this.shadow.preload = "auto";
      document.addEventListener("visibilitychange", () => this.syncShadow(true));
    }
    document.addEventListener("securitypolicyviolation", (e) => {
      if (/media/.test(e.effectiveDirective || e.violatedDirective || "") && String(e.blockedURI).startsWith("blob")) this.preferBuffer = true;
    });
  },
  ensureCtx() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        const ctx = (this.ctx = new AC({ latencyHint: "playback" }));
        this.fade = ctx.createGain(); this.vol = ctx.createGain(); this.analyser = ctx.createAnalyser();
        this.analyser.fftSize = 4096; this.analyser.smoothingTimeConstant = .7;
        if (this.split) {
          this.mute = ctx.createGain(); this.mute.gain.value = 0;
          this.fade.connect(this.vol); this.vol.connect(ctx.destination); this.vol.connect(this.analyser);
          this.analyser.connect(this.mute); this.mute.connect(ctx.destination);
          this.src = ctx.createMediaElementSource(this.shadow); this.src.connect(this.analyser);
        } else {
          this.fade.connect(this.vol); this.vol.connect(this.analyser); this.analyser.connect(ctx.destination);
          this.src = ctx.createMediaElementSource(this.audio); this.src.connect(this.fade);
        }
        this.applyVolume();
        Viz.attach(this.analyser, ctx.sampleRate);
      } catch (e) { console.warn("Web Audio indisponible", e); this.ctx = null; return null; }
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    return this.ctx;
  },
  applyVolume() {
    const v = this.muted ? 0 : this.volume * this.volume;
    if (this.split) { this.audio.volume = clamp(v, 0, 1); if (this.vol && this.ctx) this.vol.gain.value = v; return; }
    if (this.vol && this.ctx) this.vol.gain.setTargetAtTime(v, this.ctx.currentTime, .015);
    else if (this.audio) this.audio.volume = clamp(v, 0, 1);
  },
  setVolume(v) { this.volume = clamp(v, 0, 1); if (this.volume > 0) this.muted = false; store.set("volume", this.volume); this.applyVolume(); this.emit("volume"); },
  toggleMute() { this.muted = !this.muted; this.applyVolume(); this.emit("volume"); },

  get currentTime() {
    if (this.mode === "buffer") return this.playing && this.ctx ? this.ctx.currentTime - this.bStart : this.bOffset;
    return this.audio.currentTime || 0;
  },
  get duration() {
    if (this.mode === "buffer") return this.buf ? this.buf.duration : 0;
    const d = this.audio.duration; return isFinite(d) ? d : (L.tracks.get(this.id)?.duration || 0);
  },

  async load(id, { autoplay = true, startAt = 0 } = {}) {
    const f = L.files.get(id); if (!f) return false;
    const token = ++this.token;
    let src;
    if (f.url) src = f.url; /* fichier du téléphone : lu en continu, sans copie en mémoire */
    else {
      let blob;
      try { blob = await asBlob(f); } catch { this.emit("error", id); return false; }
      src = URL.createObjectURL(blob);
    }
    if (token !== this.token) { if (!f.url) URL.revokeObjectURL(src); return false; }
    this.stopBuffer(); this.buf = null;
    if (this.url && this.url.startsWith("blob:")) URL.revokeObjectURL(this.url);
    this.url = src;
    this.id = id; this.loading = true; this.triedBuffer = false;
    this.emit("track", id);
    if (this.preferBuffer) return this.loadBuffer(id, token, autoplay, startAt);
    this.mode = "element";
    this.audio.src = this.url;
    if (this.shadow) { this.shadow.pause(); this.shadow.src = this.url; }
    if (startAt) {
      const seekWhenReady = () => { try { this.audio.currentTime = startAt; } catch { /* rien */ } };
      if (this.audio.readyState >= 1) seekWhenReady(); else this.audio.addEventListener("loadedmetadata", seekWhenReady, { once: true });
    }
    this.loading = false;
    if (autoplay) await this.play();
    else { this.playing = false; this.emit("state"); }
    return true;
  },
  async onElementError() {
    if (this.mode !== "element" || !this.id || !this.audio.getAttribute("src")) return;
    if (this.triedBuffer) return;
    this.triedBuffer = true;
    const wasPlaying = this.playing || this.wantPlay;
    await this.loadBuffer(this.id, this.token, wasPlaying, 0);
  },
  async loadBuffer(id, token, autoplay, startAt) {
    const ctx = this.ensureCtx();
    if (!ctx) { this.emit("error", id); return false; }
    this.mode = "buffer"; this.audio.removeAttribute("src"); try { this.audio.load(); } catch { /* rien */ }
    if (this.shadow) { this.shadow.pause(); this.shadow.removeAttribute("src"); }
    this.loading = true; this.emit("state");
    try {
      const ab = await L.files.get(id).arrayBuffer();
      const buf = await ctx.decodeAudioData(ab);
      if (token !== this.token) return false;
      this.buf = buf; this.bOffset = startAt || 0; this.loading = false;
      this.emit("meta");
      if (autoplay) await this.play(); else { this.playing = false; this.emit("state"); }
      return true;
    } catch {
      if (token !== this.token) return false;
      this.loading = false; this.playing = false; this.emit("state"); this.emit("error", id);
      return false;
    }
  },
  startBuffer(offset) {
    this.stopBuffer();
    const s = this.ctx.createBufferSource();
    s.buffer = this.buf; s.connect(this.fade);
    s.onended = () => { if (this.bsrc === s && this.playing) { this.playing = false; this.bsrc = null; this.bOffset = 0; this.emit("ended"); } };
    s.start(0, clamp(offset, 0, this.buf.duration - .01));
    this.bsrc = s; this.bStart = this.ctx.currentTime - offset; this.playing = true;
  },
  stopBuffer() { if (this.bsrc) { const s = this.bsrc; this.bsrc = null; try { s.stop(); } catch { /* déjà arrêté */ } } },

  async play() {
    if (!this.id) return;
    this.wantPlay = true;
    const ctx = this.ensureCtx();
    if (this.split && this.mode === "element") {
      try { await this.audio.play(); this.playing = true; } catch { this.playing = false; }
      this.wantPlay = false; this.syncShadow(true); this.emit("state"); return;
    }
    if (ctx) { const g = this.fade.gain; g.cancelScheduledValues(ctx.currentTime); g.setValueAtTime(.0001, ctx.currentTime); g.exponentialRampToValueAtTime(1, ctx.currentTime + .18); }
    if (this.mode === "buffer") {
      if (!this.buf) return;
      if (!this.playing) this.startBuffer(this.bOffset);
      this.emit("state"); return;
    }
    try { await this.audio.play(); this.playing = true; }
    catch (e) { if (e && e.name === "NotAllowedError") { this.playing = false; } else if (e && e.name !== "AbortError") { this.playing = false; } }
    this.wantPlay = false;
    this.emit("state");
  },
  pause() {
    this.wantPlay = false;
    if (!this.playing) return;
    if (this.split && this.mode === "element") {
      this._pausing = true; this.audio.pause(); this._pausing = false; this.shadow.pause();
      this.playing = false; this.emit("state"); return;
    }
    const finish = () => {
      if (this.mode === "buffer") { this.bOffset = this.currentTime; this.stopBuffer(); }
      else { this._pausing = true; this.audio.pause(); this._pausing = false; }
    };
    if (this.ctx && this.fade) {
      const t = this.ctx.currentTime, g = this.fade.gain;
      g.cancelScheduledValues(t); g.setValueAtTime(g.value || 1, t); g.linearRampToValueAtTime(.0001, t + .12);
      const tok = this.token;
      if (this.mode === "buffer") this.bOffset = this.currentTime;
      this.playing = false; this.emit("state");
      setTimeout(() => { if (tok === this.token && !this.playing) finish(); else if (tok === this.token && this.playing && this.mode === "element") { /* relancé entre-temps */ } }, 125);
    } else { finish(); this.playing = false; this.emit("state"); }
  },
  toggle() { this.playing ? this.pause() : this.play(); },
  syncShadow(force) {
    const s = this.shadow; if (!s || this.mode !== "element" || !s.getAttribute("src")) return;
    if (!this.playing || document.hidden) { if (!s.paused) s.pause(); return; }
    if (this.ctx && this.ctx.state !== "running") this.ctx.resume().catch(() => {});
    if (force || Math.abs(s.currentTime - this.audio.currentTime) > .25) { try { s.currentTime = this.audio.currentTime; } catch { /* pas prêt */ } }
    if (s.paused) s.play().catch(() => {});
  },
  seek(t) {
    const d = this.duration; t = clamp(t, 0, d ? d - .05 : t);
    if (this.mode === "buffer") {
      if (this.playing) { this.stopBuffer(); this.startBuffer(t); } else this.bOffset = t;
    } else { try { this.audio.currentTime = t; if (this.shadow && this.shadow.getAttribute("src")) this.shadow.currentTime = t; } catch { /* pas prêt */ } }
    this.emit("seek", t);
  },
  stop() {
    this.token++; this.stopBuffer(); this.buf = null;
    this.audio.pause(); this.audio.removeAttribute("src");
    if (this.shadow) { this.shadow.pause(); this.shadow.removeAttribute("src"); }
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null; this.id = null; this.playing = false;
    this.emit("track", null); this.emit("state");
  },
};

/* ===================== file d'attente (logique Spotify) ===================== */
const Q = {
  ctx: [], label: "", ref: null, order: [], pos: -1, manual: [],
  shuffle: store.get("shuffle", false), repeat: store.get("repeat", "off"),
  current: null, fromManual: false, session: null,

  playList(ids, start = 0, label = "", ref = null) {
    ids = ids.filter((id) => L.tracks.has(id));
    if (!ids.length) return;
    this.ctx = ids.slice(); this.label = label; this.ref = ref;
    this.buildOrder(clamp(start, 0, ids.length - 1));
    this.go(this.ctx[this.order[this.pos]], { fromManual: false });
  },
  buildOrder(startIdx) {
    const idx = [...this.ctx.keys()];
    if (this.shuffle) { const rest = shuffleArr(idx.filter((i) => i !== startIdx)); this.order = startIdx >= 0 ? [startIdx, ...rest] : rest; this.pos = 0; }
    else { this.order = idx; this.pos = Math.max(0, startIdx); }
  },
  async go(id, { fromManual = false, autoplay = true, startAt = 0 } = {}) {
    if (!L.files.has(id)) {
      const anyPlayable = this.ctx.some((x) => L.files.has(x)) || this.manual.some((x) => L.files.has(x));
      if (!anyPlayable) { UI.needFiles(); return; }
      toast("Fichier introuvable, je passe au suivant.");
      this.current = id; return this.next(false);
    }
    this.flushSession();
    this.current = id; this.fromManual = fromManual;
    this.session = { id, listened: 0, counted: false, last: null };
    this.save();
    await Player.load(id, { autoplay, startAt });
  },
  next(auto = false) {
    if (auto && this.repeat === "one" && this.current) { Player.seek(0); Player.play(); if (this.session) this.session.counted = false; return; }
    if (this.manual.length) { const id = this.manual.shift(); UI.onQueueChanged(); return this.go(id, { fromManual: true }); }
    if (this.pos + 1 < this.order.length) { this.pos++; return this.go(this.ctx[this.order[this.pos]]); }
    if (this.repeat !== "off" && this.order.length) {
      if (this.shuffle) this.buildOrder(-1); this.pos = 0;
      return this.go(this.ctx[this.order[this.pos]]);
    }
    Player.pause(); Player.seek(0); UI.onQueueChanged();
  },
  prev() {
    if (Player.currentTime > 3 || this.pos <= 0) { Player.seek(0); if (!Player.playing) Player.play(); return; }
    this.pos--; this.go(this.ctx[this.order[this.pos]]);
  },
  jumpTo(orderPos) { this.pos = orderPos; this.go(this.ctx[this.order[this.pos]]); },
  playManual(i) { const id = this.manual.splice(i, 1)[0]; if (id) this.go(id, { fromManual: true }); },
  toggleShuffle() {
    this.shuffle = !this.shuffle; store.set("shuffle", this.shuffle);
    if (this.ctx.length) {
      const curIdx = this.order[this.pos];
      if (this.shuffle) this.buildOrder(curIdx ?? -1); else { this.order = [...this.ctx.keys()]; this.pos = curIdx ?? 0; }
    }
    UI.onQueueChanged(); UI.syncControls();
  },
  cycleRepeat() {
    this.repeat = this.repeat === "off" ? "all" : this.repeat === "all" ? "one" : "off"; store.set("repeat", this.repeat);
    UI.syncControls();
  },
  addNext(ids) { this.manual.unshift(...ids.filter((id) => L.tracks.has(id))); UI.onQueueChanged(); },
  addEnd(ids) { this.manual.push(...ids.filter((id) => L.tracks.has(id))); UI.onQueueChanged(); },
  upcoming(n = 40) { const out = []; for (let i = this.pos + 1; i < this.order.length && out.length < n; i++) out.push({ id: this.ctx[this.order[i]], pos: i }); return out; },

  tick() {
    Player.syncShadow(false);
    const s = this.session; if (!s || !Player.playing || Player.id !== s.id) { if (s) s.last = null; return; }
    const t = Player.currentTime;
    if (s.last != null) {
      const d = t - s.last;
      if (d > 0 && d < 2) { s.listened += d; s.pending = (s.pending || 0) + d; }
    }
    s.last = t;
    const dur = Player.duration || 1;
    if (!s.counted && s.listened >= Math.min(30, dur * .5)) { s.counted = true; if (!L.tracks.get(s.id)?.demo) countPlay(s.id); UI.onStatsChanged(); }
    if (s.pending > 10) this.flushSession();
  },
  flushSession() { const s = this.session; if (s && s.pending > .5) { if (!L.tracks.get(s.id)?.demo) addListened(s.id, s.pending); s.pending = 0; } },
  save: debounce(() => {
    store.set("q", { ctx: Q.ctx.slice(0, 3000), label: Q.label, ref: Q.ref, order: Q.order.slice(0, 3000), pos: Q.pos, manual: Q.manual.slice(0, 200), current: Q.current, t: Player.currentTime });
  }, 800),
  restore() {
    const s = store.get("q", null); if (!s || !s.current || !L.tracks.has(s.current)) return;
    this.ctx = (s.ctx || []).filter((id) => L.tracks.has(id)); this.label = s.label || ""; this.ref = s.ref || null;
    this.order = (s.order || []).filter((i) => i < this.ctx.length); if (this.order.length !== this.ctx.length) this.order = [...this.ctx.keys()];
    this.pos = clamp(s.pos || 0, 0, Math.max(0, this.order.length - 1)); this.manual = (s.manual || []).filter((id) => L.tracks.has(id));
    this.current = s.current;
    if (L.files.has(s.current)) { this.session = { id: s.current, listened: 0, counted: false, last: null }; Player.load(s.current, { autoplay: false, startAt: s.t || 0 }); }
    else UI.showIdleTrack(s.current);
  },
};
