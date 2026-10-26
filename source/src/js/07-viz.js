/* ===================== visualiseurs ===================== */
const Viz = {
  analyser: null, sr: 48000, freq: null, wave: null,
  N: 96, bands: new Float32Array(96), peaks: new Float32Array(96), hold: new Uint8Array(96), pvel: new Float32Array(96),
  bass: 0, bassAvg: 0, beat: 0, level: 0, sinceBeat: 0,
  targets: new Set(), running: false, mode: store.get("vizMode", "halo"), calm: false,
  col: { c1: [160, 140, 255], c2: [63, 224, 197], c3: [255, 122, 182] }, tcol: null,
  cover: null, coverAngle: 0, coverSpin: true, particles: [],
  idleShape: Array.from({ length: 96 }, (_, i) => { const x = i / 95; return clamp(.55 * Math.exp(-((x - .12) ** 2) / .02) + .38 * Math.exp(-((x - .42) ** 2) / .03) + .22 * Math.exp(-((x - .72) ** 2) / .02) + .06, 0, 1); }),

  attach(analyser, sr) {
    this.analyser = analyser; this.sr = sr;
    this.freq = new Uint8Array(analyser.frequencyBinCount); this.wave = new Uint8Array(analyser.fftSize);
  },
  add(canvas, kind) {
    const t = { canvas, kind, g: canvas.getContext("2d"), w: 0, h: 0, dpr: 1, idleDrawn: false };
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, kind === "imm" ? 1.5 : 2);
      t.w = Math.max(1, Math.round(r.width)); t.h = Math.max(1, Math.round(r.height)); t.dpr = dpr;
      canvas.width = Math.round(t.w * dpr); canvas.height = Math.round(t.h * dpr);
      t.g.setTransform(dpr, 0, 0, dpr, 0, 0); t.idleDrawn = false;
      if (!this.running) this.drawTarget(t, true);
    };
    t.ro = new ResizeObserver(resize); t.ro.observe(canvas);
    this.targets.add(t);
    resize();
    return t;
  },
  remove(canvas) { for (const t of this.targets) if (t.canvas === canvas) { t.ro.disconnect(); this.targets.delete(t); } },
  prune() { for (const t of this.targets) if (!t.canvas.isConnected) { t.ro.disconnect(); this.targets.delete(t); } },

  parseColor(str) {
    const c = (this._pc ||= document.createElement("canvas").getContext("2d"));
    c.fillStyle = "#000"; c.fillStyle = str; const v = c.fillStyle;
    if (v.startsWith("#")) return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)];
    const m = v.match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number) : [160, 140, 255];
  },
  setPalette(p) {
    p = p || DEFAULT_PAL;
    this.tcol = { c1: this.parseColor(p.c1), c2: this.parseColor(p.c2), c3: this.parseColor(p.c3) };
    this.kick();
  },
  setCover(url) {
    if (!url) { this.cover = null; this.kick(); return; }
    const img = new Image(); img.onload = () => { this.cover = img; this.kick(); }; img.src = url;
  },
  rgba(c, a) { return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; },
  mix(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; },

  kick() { if (!this.running) { this.running = true; requestAnimationFrame((ts) => this.frame(ts)); } },
  compute() {
    const playing = Player.playing && this.analyser;
    const N = this.N;
    if (playing) {
      this.analyser.getByteFrequencyData(this.freq);
      this.analyser.getByteTimeDomainData(this.wave);
      const binHz = this.sr / this.analyser.fftSize;
      for (let i = 0; i < N; i++) {
        const f0 = 32 * Math.pow(16000 / 32, i / N), f1 = 32 * Math.pow(16000 / 32, (i + 1) / N);
        const b0 = Math.floor(f0 / binHz), b1 = Math.max(b0 + 1, Math.ceil(f1 / binHz));
        let m = 0; for (let b = b0; b < b1 && b < this.freq.length; b++) if (this.freq[b] > m) m = this.freq[b];
        let v = (m / 255) * (.86 + .3 * (i / N));
        v = Math.pow(clamp((v - .18) / .78, 0, 1), 1.25);
        const cur = this.bands[i];
        this.bands[i] = v > cur ? lerp(cur, v, .65) : lerp(cur, v, .2);
      }
      let sum = 0; for (let k = 0; k < this.wave.length; k += 4) { const d = (this.wave[k] - 128) / 128; sum += d * d; }
      this.level = lerp(this.level, Math.sqrt(sum / (this.wave.length / 4)) * 2.2, .3);
    } else {
      for (let i = 0; i < N; i++) this.bands[i] *= .86;
      this.level *= .88;
    }
    for (let i = 0; i < N; i++) {
      if (this.bands[i] >= this.peaks[i]) { this.peaks[i] = this.bands[i]; this.hold[i] = 16; this.pvel[i] = 0; }
      else if (this.hold[i] > 0) this.hold[i]--;
      else { this.pvel[i] += .0016; this.peaks[i] = Math.max(0, this.peaks[i] - this.pvel[i]); }
    }
    let bass = 0; for (let i = 0; i < 9; i++) bass += this.bands[i]; bass /= 9;
    this.bass = bass; this.bassAvg = lerp(this.bassAvg, bass, .05); this.sinceBeat++;
    if (playing && bass > this.bassAvg * 1.22 + .05 && this.sinceBeat > 10) { this.beat = 1; this.sinceBeat = 0; }
    this.beat *= .9;
    if (this.tcol) { let done = true; for (const k of ["c1", "c2", "c3"]) { this.col[k] = this.mix(this.col[k], this.tcol[k], .06); if (Math.abs(this.col[k][0] - this.tcol[k][0]) + Math.abs(this.col[k][1] - this.tcol[k][1]) + Math.abs(this.col[k][2] - this.tcol[k][2]) > 2) done = false; } if (done) { this.col = this.tcol; this.tcol = null; } }
    let alive = playing || !!this.tcol || this.beat > .01;
    if (!alive) for (let i = 0; i < N; i++) if (this.bands[i] > .002 || this.peaks[i] > .002) { alive = true; break; }
    return alive;
  },
  frame() {
    const alive = this.compute();
    const pulse = this.calm ? 0 : clamp(this.bass * .6 + this.beat * .5, 0, 1.2);
    const ap = document.getElementById("aurora-pulse"); if (ap) ap.style.setProperty("--pulse", pulse.toFixed(3));
    const mk = document.getElementById("brand-mark");
    if (mk) { const s = mk.children; for (let i = 0; i < s.length; i++) s[i].style.height = Math.round(30 + 70 * (Player.playing ? this.bands[6 + i * 14] : (.2 + i * .12))) + "%"; }
    if (this.coverSpin && Player.playing && !this.calm) this.coverAngle += .0025;
    for (const t of this.targets) this.drawTarget(t, false);
    if (alive) requestAnimationFrame(() => this.frame());
    else { this.running = false; for (const t of this.targets) this.drawTarget(t, true); }
  },
  visible(t) { return t.canvas.isConnected && t.canvas.offsetParent !== null && t.w > 2; },
  drawTarget(t, idle) {
    if (!this.visible(t)) return;
    const g = t.g, w = t.w, h = t.h;
    const useIdle = idle && !Player.playing && t.kind === "hero";
    if (t.kind === "lcd") this.drawLcd(g, w, h);
    else if (t.kind === "panel") this.drawPanel(g, w, h);
    else if (t.kind === "hero") this.drawHero(g, w, h, useIdle || (!Player.playing && this.bands[10] < .01));
    else if (t.kind === "imm") { if (this.mode === "halo") this.drawHalo(g, w, h); else if (this.mode === "onde") this.drawWave(g, w, h); else this.drawSpectre(g, w, h); }
  },
  sample(arr, x) { const i = clamp(x, 0, 1) * (arr.length - 1); const a = Math.floor(i), b = Math.min(arr.length - 1, a + 1); return lerp(arr[a], arr[b], i - a); },
  vgrad(g, h) {
    const gr = g.createLinearGradient(0, h, 0, 0);
    gr.addColorStop(0, this.rgba(this.col.c2, 1)); gr.addColorStop(.6, this.rgba(this.col.c1, 1)); gr.addColorStop(1, this.rgba(this.col.c3, 1));
    return gr;
  },

  /* LCD façon Audacious/Winamp : barres segmentées + crêtes */
  drawLcd(g, w, h) {
    g.clearRect(0, 0, w, h);
    const n = 16, gap = 1.5, bw = (w - gap * (n - 1)) / n, seg = 2, sg = 1;
    g.fillStyle = this.vgrad(g, h);
    for (let i = 0; i < n; i++) {
      const v = this.sample(this.bands, (i + .5) / n * .82), x = i * (bw + gap);
      const segs = Math.floor((v * h) / (seg + sg));
      for (let s = 0; s < segs; s++) g.fillRect(x, h - (s + 1) * (seg + sg) + sg, bw, seg);
      const p = this.sample(this.peaks, (i + .5) / n * .82);
      if (p > .02) { g.save(); g.fillStyle = "rgba(255,255,255,.85)"; g.fillRect(x, h - p * h - 1, bw, 1.5); g.restore(); }
    }
    if (!Player.playing && this.bands[4] < .01) { g.fillStyle = this.rgba(this.col.c1, .35); for (let i = 0; i < n; i++) g.fillRect(i * (bw + gap), h - 2, bw, 2); }
  },
  /* panneau « En cours » : barres arrondies + reflet */
  drawPanel(g, w, h) {
    g.clearRect(0, 0, w, h);
    const n = 40, gap = 3, bw = (w - gap * (n - 1)) / n, base = h * .78;
    g.fillStyle = this.vgrad(g, base);
    for (let i = 0; i < n; i++) {
      const v = Math.max(.015, this.sample(this.bands, (i + .5) / n * .9)), x = i * (bw + gap), bh = v * base;
      g.beginPath(); g.roundRect ? g.roundRect(x, base - bh, bw, bh, [bw / 2, bw / 2, 1, 1]) : g.rect(x, base - bh, bw, bh); g.fill();
    }
    g.globalAlpha = .18;
    for (let i = 0; i < n; i++) { const v = this.sample(this.bands, (i + .5) / n * .9), x = i * (bw + gap); g.fillRect(x, base + 2, bw, v * (h - base) * .9); }
    g.globalAlpha = 1; g.fillStyle = "rgba(255,255,255,.9)";
    for (let i = 0; i < n; i++) { const p = this.sample(this.peaks, (i + .5) / n * .9); if (p > .03) g.fillRect(i * (bw + gap), base - p * base - 3, bw, 2); }
  },
  drawHero(g, w, h, idle) {
    g.clearRect(0, 0, w, h);
    const n = 56, gap = 4, bw = (w - gap * (n - 1)) / n;
    const grd = this.vgrad(g, h); g.fillStyle = grd;
    for (let i = 0; i < n; i++) {
      const x = i * (bw + gap);
      const v = idle ? this.sample(this.idleShape, i / (n - 1)) : Math.max(.02, this.sample(this.bands, (i + .5) / n * .9));
      const bh = v * h * .92;
      g.globalAlpha = .35 + .65 * (i / n);
      g.beginPath(); g.roundRect ? g.roundRect(x, h - bh, bw, bh, bw / 2) : g.rect(x, h - bh, bw, bh); g.fill();
    }
    g.globalAlpha = 1;
  },
  /* immersif : halo circulaire autour de la pochette */
  drawHalo(g, w, h) {
    g.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h * .42, R = Math.min(w * .21, h * .18) * (this.calm ? 1 : 1 + this.beat * .045);
    const glow = g.createRadialGradient(cx, cy, R * .6, cx, cy, R * 3.4);
    glow.addColorStop(0, this.rgba(this.col.c1, .22 + this.level * .25)); glow.addColorStop(1, this.rgba(this.col.c1, 0));
    g.fillStyle = glow; g.fillRect(0, 0, w, h);
    if (!this.calm) {
      if (Player.playing && this.particles.length < 160) {
        const spawn = 1 + Math.round(this.level * 4 + this.beat * 10);
        for (let k = 0; k < spawn; k++) this.particles.push({ a: Math.random() * Math.PI * 2, r: R * (1.15 + Math.random() * .3), v: .4 + Math.random() * 1.2, life: 1, s: .8 + Math.random() * 2, c: Math.random() < .5 ? "c2" : "c3" });
      }
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.r += p.v * (1 + this.level * 3 + this.beat * 4); p.life -= .008 + p.v * .003;
        if (p.life <= 0 || p.r > Math.max(w, h)) { this.particles.splice(i, 1); continue; }
        g.fillStyle = this.rgba(this.col[p.c], p.life * .7);
        g.beginPath(); g.arc(cx + Math.cos(p.a) * p.r, cy + Math.sin(p.a) * p.r, p.s, 0, Math.PI * 2); g.fill();
      }
    }
    const n = 132, half = n / 2, lw = Math.max(2, (Math.PI * 2 * R) / n * .5);
    g.lineCap = "round"; g.lineWidth = lw;
    for (let i = 0; i < n; i++) {
      const j = i < half ? i : n - 1 - i, x = j / half;
      const v = this.sample(this.bands, x * .85);
      const len = R * .05 + v * R * .78;
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      const c = this.mix(this.col.c1, this.col.c2, x);
      g.strokeStyle = this.rgba(c, .55 + v * .45);
      const r0 = R + 10;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len)); g.stroke();
    }
    g.strokeStyle = this.rgba(this.col.c3, .35 + this.beat * .4); g.lineWidth = 1.5;
    g.beginPath(); g.arc(cx, cy, R + 4, 0, Math.PI * 2); g.stroke();
    g.save(); g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
    if (this.cover) {
      g.translate(cx, cy); g.rotate(this.coverAngle);
      g.drawImage(this.cover, -R, -R, R * 2, R * 2);
      g.rotate(-this.coverAngle); g.translate(-cx, -cy);
      const sh = g.createRadialGradient(cx, cy, R * .1, cx, cy, R); sh.addColorStop(0, "rgba(0,0,0,0)"); sh.addColorStop(1, "rgba(0,0,0,.25)"); g.fillStyle = sh; g.fillRect(cx - R, cy - R, R * 2, R * 2);
    } else {
      const bg = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R); bg.addColorStop(0, this.rgba(this.col.c1, 1)); bg.addColorStop(1, this.rgba(this.col.c2, 1));
      g.fillStyle = bg; g.fillRect(cx - R, cy - R, R * 2, R * 2);
    }
    g.restore();
    g.fillStyle = "rgba(7,7,13,.9)"; g.beginPath(); g.arc(cx, cy, Math.max(4, R * .07), 0, Math.PI * 2); g.fill();
  },
  drawSpectre(g, w, h) {
    g.clearRect(0, 0, w, h);
    const n = Math.max(32, Math.min(84, Math.floor(w / 18))), gap = Math.max(3, w * .004), totalW = w * .88, bw = (totalW - gap * (n - 1)) / n;
    const x0 = (w - totalW) / 2, base = h * .66, maxH = h * .48;
    g.fillStyle = this.vgrad(g, base);
    const grd = g.createLinearGradient(0, base - maxH, 0, base); grd.addColorStop(0, this.rgba(this.col.c3, 1)); grd.addColorStop(.45, this.rgba(this.col.c1, 1)); grd.addColorStop(1, this.rgba(this.col.c2, 1));
    g.fillStyle = grd;
    for (let i = 0; i < n; i++) {
      const v = Math.max(.01, this.sample(this.bands, (i + .5) / n * .92)), x = x0 + i * (bw + gap), bh = v * maxH;
      g.beginPath(); g.roundRect ? g.roundRect(x, base - bh, bw, bh, [Math.min(6, bw / 2), Math.min(6, bw / 2), 1, 1]) : g.rect(x, base - bh, bw, bh); g.fill();
    }
    g.globalAlpha = .16;
    for (let i = 0; i < n; i++) { const v = this.sample(this.bands, (i + .5) / n * .92); g.fillRect(x0 + i * (bw + gap), base + 4, bw, v * maxH * .35); }
    g.globalAlpha = 1; g.fillStyle = "rgba(255,255,255,.92)";
    for (let i = 0; i < n; i++) { const p = this.sample(this.peaks, (i + .5) / n * .92); if (p > .02) g.fillRect(x0 + i * (bw + gap), base - p * maxH - 6, bw, 3); }
  },
  drawWave(g, w, h) {
    g.globalCompositeOperation = "destination-out"; g.fillStyle = "rgba(0,0,0,.26)"; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = "source-over";
    if (!this.wave) return;
    const cy = h * .45, amp = h * .26 * (1 + this.beat * .35);
    const pass = (off, col, lw, alpha, scale) => {
      g.beginPath(); const step = Math.max(1, Math.floor(this.wave.length / Math.min(1024, w)));
      for (let i = 0, k = 0; i < this.wave.length; i += step, k++) {
        const x = (i / (this.wave.length - 1)) * w; const v = (this.wave[(i + off) % this.wave.length] - 128) / 128;
        const y = cy + v * amp * scale; k === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.strokeStyle = this.rgba(col, alpha); g.lineWidth = lw; g.stroke();
    };
    if (!Player.playing) this.wave.fill(128);
    g.lineJoin = "round";
    pass(0, this.col.c1, 7, .18, 1); pass(0, this.col.c1, 2.5, .95, 1);
    pass(96, this.col.c2, 1.5, .6, -.7); pass(240, this.col.c3, 1.2, .45, .45);
  },
};
