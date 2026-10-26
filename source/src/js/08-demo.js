/* ===================== démo générée sur place (synthé maison, aucun fichier externe) ===================== */
const DEMO_SPECS = [
  { title: "Lueur", bpm: 112, dur: 32, prog: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], cols: ["#7b5cff", "#2fe0c0", "#ff6fae"], shape: 0 },
  { title: "Nuit claire", bpm: 92, dur: 32, prog: [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]], cols: ["#ff5f8f", "#ffb35c", "#7a5cff"], shape: 1 },
  { title: "Marée haute", bpm: 124, dur: 32, prog: [[52, 56, 59], [49, 52, 56], [57, 61, 64], [59, 63, 66]], cols: ["#2cc7ff", "#3fe0a5", "#b48cff"], shape: 2 },
];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

async function renderDemoTrack(spec) {
  const sr = 32000, ctx = new OfflineAudioContext(2, sr * spec.dur, sr);
  const master = ctx.createGain(); const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 3; master.connect(comp); comp.connect(ctx.destination);
  master.gain.setValueAtTime(0, 0); master.gain.linearRampToValueAtTime(.8, 1.2);
  master.gain.setValueAtTime(.8, spec.dur - 3.5); master.gain.linearRampToValueAtTime(0, spec.dur - .1);
  const delay = ctx.createDelay(1.5), fb = ctx.createGain(), dlp = ctx.createBiquadFilter(), wet = ctx.createGain();
  const beat = 60 / spec.bpm; delay.delayTime.value = beat * .75; fb.gain.value = .35; dlp.type = "lowpass"; dlp.frequency.value = 2600; wet.gain.value = .32;
  delay.connect(dlp); dlp.connect(fb); fb.connect(delay); dlp.connect(wet); wet.connect(master);
  const noise = ctx.createBuffer(1, sr, sr); { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const bars = Math.floor((spec.dur - 1) / (beat * 4));
  const env = (g, t, a, peak, d, sustain = 0) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(Math.max(.0001, sustain || .0001), t + a + d); };
  const pan = (node, v) => { const p = ctx.createStereoPanner(); p.pan.value = v; node.connect(p); return p; };
  for (let bar = 0; bar < bars; bar++) {
    const t0 = .3 + bar * beat * 4, chord = spec.prog[bar % spec.prog.length];
    // nappe
    const padF = ctx.createBiquadFilter(); padF.type = "lowpass"; padF.frequency.setValueAtTime(500, t0); padF.frequency.linearRampToValueAtTime(1500 + (bar % 4) * 250, t0 + beat * 2); padF.frequency.linearRampToValueAtTime(700, t0 + beat * 4);
    const padG = ctx.createGain(); padG.gain.setValueAtTime(0.0001, t0); padG.gain.linearRampToValueAtTime(.07, t0 + .5); padG.gain.setValueAtTime(.07, t0 + beat * 4 - .3); padG.gain.linearRampToValueAtTime(0.0001, t0 + beat * 4 + .2);
    padF.connect(padG); padG.connect(master);
    chord.forEach((n, k) => {
      for (const det of [-7, 7]) { const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = mtof(n); o.detune.value = det; pan(o, k === 0 ? -.4 : k === 2 ? .4 : 0).connect(padF); o.start(t0); o.stop(t0 + beat * 4 + .3); }
    });
    // basse
    for (let s = 0; s < 8; s++) {
      if (bar < 1 && s % 2) continue;
      const t = t0 + s * beat / 2, o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = "square"; o.frequency.value = mtof(chord[0] - 24 + (s === 7 ? 7 : 0)); f.type = "lowpass"; f.frequency.value = 380; f.Q.value = 6;
      env(g, t, .01, .22, beat * .42); o.connect(f); f.connect(g); g.connect(master); o.start(t); o.stop(t + beat / 2);
    }
    // arpège
    if (bar >= 2) for (let s = 0; s < 16; s++) {
      const t = t0 + s * beat / 4, note = chord[s % 3] + 12 + (s % 8 >= 6 ? 12 : 0);
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "triangle"; o.frequency.value = mtof(note);
      env(g, t, .005, .09, beat * .22); o.connect(g); const p = pan(g, Math.sin(s * .8) * .5); p.connect(master); p.connect(delay); o.start(t); o.stop(t + beat * .3);
    }
    // batterie
    for (let b = 0; b < 4; b++) {
      const t = t0 + b * beat;
      if (bar >= 1) {
        const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + .14);
        env(g, t, .003, .9, .36); o.connect(g); g.connect(master); o.start(t); o.stop(t + .4);
      }
      if (bar >= 4 && (b === 1 || b === 3)) {
        const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); n.buffer = noise; f.type = "bandpass"; f.frequency.value = 1900; f.Q.value = .8;
        env(g, t, .002, .38, .17); n.connect(f); f.connect(g); g.connect(master); g.connect(delay); n.start(t, Math.random() * .5, .25);
      }
      if (bar >= 2) for (const half of [0, .5]) {
        const th = t + half * beat, n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); n.buffer = noise; f.type = "highpass"; f.frequency.value = 7500;
        env(g, th, .001, half ? .12 : .07, .045); n.connect(f); pan(f, .3).connect(g); g.connect(master); n.start(th, Math.random() * .5, .08);
      }
    }
  }
  return encodeWav(await ctx.startRendering());
}
function encodeWav(buf) {
  const ch = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate, bytes = len * ch * 2;
  const ab = new ArrayBuffer(44 + bytes), v = new DataView(ab);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + bytes, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, bytes, true);
  const chans = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) { const s = clamp(chans[c][i], -1, 1); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
  return new Blob([ab], { type: "audio/wav" });
}
async function demoCover(spec) {
  const c = makeCanvas(640, 640), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 640, 640); bg.addColorStop(0, spec.cols[0]); bg.addColorStop(1, "#0b0a18"); g.fillStyle = bg; g.fillRect(0, 0, 640, 640);
  const blob = (x, y, r, col) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(0, 0, 640, 640); };
  blob(460, 180, 380, spec.cols[1] + "cc"); blob(160, 520, 340, spec.cols[2] + "aa");
  g.strokeStyle = "rgba(255,255,255,.75)"; g.lineWidth = 3;
  if (spec.shape === 0) for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(320, 360, 40 + i * 26, Math.PI, Math.PI * 2); g.globalAlpha = 1 - i * .09; g.stroke(); }
  else if (spec.shape === 1) { g.fillStyle = "rgba(255,255,255,.9)"; g.beginPath(); g.arc(400, 230, 90, 0, Math.PI * 2); g.fill(); g.fillStyle = spec.cols[0]; g.beginPath(); g.arc(440, 200, 82, 0, Math.PI * 2); g.fill(); for (let i = 0; i < 40; i++) { g.globalAlpha = Math.random(); g.fillStyle = "#fff"; g.fillRect(Math.random() * 640, Math.random() * 640, 2, 2); } }
  else for (let i = 0; i < 7; i++) { g.beginPath(); for (let x = 0; x <= 640; x += 8) { const y = 330 + i * 34 + Math.sin(x / 60 + i) * (22 - i * 2); x ? g.lineTo(x, y) : g.moveTo(x, y); } g.globalAlpha = .9 - i * .1; g.stroke(); }
  g.globalAlpha = 1;
  return canvasToBlob(c, "image/png");
}
async function loadDemo(btn) {
  if (L.importing || loadDemo.busy) return;
  if ([...L.tracks.values()].some((t) => t.demo)) { const a = [...L.albums.values()].find((x) => x.demo); if (a) return playAlbum(a.key); }
  loadDemo.busy = true;
  const lbl = btn && btn.querySelector(".lbl");
  if (btn) { btn.disabled = true; if (lbl) lbl.textContent = "Préparation…"; }
  try {
    const albumKey = "ademo", now = Date.now();
    const art = await makeArt(await demoCover(DEMO_SPECS[0]));
    if (art) L.art.set(albumKey, art);
    for (let i = 0; i < DEMO_SPECS.length; i++) {
      const s = DEMO_SPECS[i]; const blob = await renderDemoTrack(s); const id = "demo" + i;
      if (!loadDemo.busy) return;
      L.tracks.set(id, { id, path: `démo/${s.title}.wav`, size: blob.size, name: s.title + ".wav", title: s.title, artist: "Aurore", artists: ["Aurore"], albumArtist: "Aurore", album: "La démo d'Aurore", albumKey, artKey: albumKey, year: new Date().getFullYear(), genre: "Électronique", track: i + 1, disc: 1, duration: s.dur, codec: "WAV", sampleRate: 32000, addedAt: now + i, demo: true });
      L.files.set(id, blob);
      rebuildIndex();
      if (i === 0) playAlbum(albumKey);
      else if (Q.ref === "album:" + albumKey) { Q.ctx.push(id); Q.order.push(Q.ctx.length - 1); UI.onQueueChanged(); }
      UI.onLibraryChanged();
    }
  } catch (e) { console.error(e); toast("La démo n'a pas pu être générée sur ce navigateur."); }
  loadDemo.busy = false;
  if (btn && btn.isConnected) { btn.disabled = false; if (lbl) lbl.textContent = "Écouter la démo"; }
}
