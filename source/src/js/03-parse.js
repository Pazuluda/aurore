/* ===================== lecture des tags (ID3, FLAC, Ogg, MP4, WAV) ===================== */
const AUDIO_EXT = new Set(["mp3", "flac", "m4a", "m4b", "mp4", "aac", "ogg", "oga", "opus", "wav", "wave", "webm", "weba", "aif", "aiff"]);
const IMG_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
const extOf = (name) => { const m = /\.([a-z0-9]+)$/i.exec(name || ""); return m ? m[1].toLowerCase() : ""; };

const ID3_GENRES = ["Blues", "Classic Rock", "Country", "Dance", "Disco", "Funk", "Grunge", "Hip-Hop", "Jazz", "Metal", "New Age", "Oldies", "Other", "Pop", "R&B", "Rap", "Reggae", "Rock", "Techno", "Industrial", "Alternative", "Ska", "Death Metal", "Pranks", "Soundtrack", "Euro-Techno", "Ambient", "Trip-Hop", "Vocal", "Jazz+Funk", "Fusion", "Trance", "Classical", "Instrumental", "Acid", "House", "Game", "Sound Clip", "Gospel", "Noise", "Alternative Rock", "Bass", "Soul", "Punk", "Space", "Meditative", "Instrumental Pop", "Instrumental Rock", "Ethnic", "Gothic", "Darkwave", "Techno-Industrial", "Electronic", "Pop-Folk", "Eurodance", "Dream", "Southern Rock", "Comedy", "Cult", "Gangsta", "Top 40", "Christian Rap", "Pop/Funk", "Jungle", "Native American", "Cabaret", "New Wave", "Psychedelic", "Rave", "Showtunes", "Trailer", "Lo-Fi", "Tribal", "Acid Punk", "Acid Jazz", "Polka", "Retro", "Musical", "Rock & Roll", "Hard Rock", "Folk", "Folk-Rock", "National Folk", "Swing", "Fast Fusion", "Bebop", "Latin", "Revival", "Celtic", "Bluegrass", "Avantgarde", "Gothic Rock", "Progressive Rock", "Psychedelic Rock", "Symphonic Rock", "Slow Rock", "Big Band", "Chorus", "Easy Listening", "Acoustic", "Humour", "Speech", "Chanson", "Opera", "Chamber Music", "Sonata", "Symphony", "Booty Bass", "Primus", "Porn Groove", "Satire", "Slow Jam", "Club", "Tango", "Samba", "Folklore", "Ballad", "Power Ballad", "Rhythmic Soul", "Freestyle", "Duet", "Punk Rock", "Drum Solo", "A Cappella", "Euro-House", "Dance Hall", "Goa", "Drum & Bass", "Club-House", "Hardcore", "Terror", "Indie", "BritPop", "Afro-Punk", "Polsk Punk", "Beat", "Christian Gangsta Rap", "Heavy Metal", "Black Metal", "Crossover", "Contemporary Christian", "Christian Rock", "Merengue", "Salsa", "Thrash Metal", "Anime", "J-Pop", "Synthpop"];

const decoders = {};
function decodeWith(label, u8) {
  try { return (decoders[label] ||= new TextDecoder(label)).decode(u8); } catch { return ""; }
}
const latin1 = (u8, o, n) => { let s = ""; for (let i = o; i < o + n && i < u8.length; i++) s += String.fromCharCode(u8[i]); return s; };
const u32 = (b, o) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
const u32le = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + ((b[o + 3] << 24) >>> 0);
const u16le = (b, o) => b[o] | (b[o + 1] << 8);
async function readBytes(file, start, len) {
  const end = Math.min(file.size, start + len);
  if (start >= end) return new Uint8Array(0);
  return new Uint8Array(await file.slice(start, end).arrayBuffer());
}

/* ---- ID3v2 ---- */
const syncsafe = (b, o) => ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);
function unsync(u8) {
  const out = new Uint8Array(u8.length); let j = 0;
  for (let i = 0; i < u8.length; i++) { out[j++] = u8[i]; if (u8[i] === 0xff && u8[i + 1] === 0x00) i++; }
  return out.subarray(0, j);
}
function id3Text(u8, enc) {
  if (!u8.length) return "";
  let s;
  if (enc === 0) s = decodeWith("windows-1252", u8);
  else if (enc === 1) {
    if (u8[0] === 0xfe && u8[1] === 0xff) s = decodeWith("utf-16be", u8.subarray(2));
    else if (u8[0] === 0xff && u8[1] === 0xfe) s = decodeWith("utf-16le", u8.subarray(2));
    else s = decodeWith("utf-16le", u8);
  } else if (enc === 2) s = decodeWith("utf-16be", u8);
  else s = decodeWith("utf-8", u8);
  return s.replace(/﻿/g, "");
}
function id3TermEnd(u8, i, enc) {
  if (enc === 1 || enc === 2) {
    for (; i + 1 < u8.length; i += 2) if (u8[i] === 0 && u8[i + 1] === 0) return i + 2;
    return u8.length;
  }
  for (; i < u8.length; i++) if (u8[i] === 0) return i + 1;
  return u8.length;
}
const ID3_MAP = { TIT2: "title", TT2: "title", TPE1: "artist", TP1: "artist", TPE2: "albumArtist", TP2: "albumArtist", TALB: "album", TAL: "album", TRCK: "track", TRK: "track", TPOS: "disc", TPA: "disc", TYER: "year", TYE: "year", TDRC: "year", TDOR: "origYear", TORY: "origYear", TCON: "genre", TCO: "genre", TLEN: "tlen" };
function genreName(s) {
  s = String(s || "").trim();
  if (/^\d+$/.test(s)) return ID3_GENRES[+s] || "";
  s = s.replace(/^\((\d+)\)(.*)$/, (m, n, rest) => rest.trim() || ID3_GENRES[+n] || "");
  if (s === "(RX)") return "Remix";
  if (s === "(CR)") return "Cover";
  return s;
}
function parseID3v2(u8) {
  const ver = u8[3], flags = u8[5];
  const size = syncsafe(u8, 6);
  let body = u8.subarray(10, 10 + size);
  if (ver < 4 && (flags & 0x80)) body = unsync(body);
  let pos = 0;
  if (flags & 0x40) pos = ver === 3 ? 4 + u32(body, 0) : ver === 4 ? syncsafe(body, 0) : 0;
  const out = {}; const pics = [];
  while (pos < body.length) {
    let id, fsize, fflags = 0, hdr;
    if (ver === 2) {
      if (pos + 6 > body.length) break;
      id = latin1(body, pos, 3); fsize = (body[pos + 3] << 16) | (body[pos + 4] << 8) | body[pos + 5]; hdr = 6;
    } else {
      if (pos + 10 > body.length) break;
      id = latin1(body, pos, 4);
      fsize = ver === 4 ? syncsafe(body, pos + 4) : u32(body, pos + 4);
      if (ver === 4 && fsize > 127 && pos + 10 + fsize > body.length && pos + 10 + u32(body, pos + 4) <= body.length) fsize = u32(body, pos + 4);
      fflags = (body[pos + 8] << 8) | body[pos + 9]; hdr = 10;
    }
    if (!/^[A-Z0-9]{3,4}$/.test(id) || fsize <= 0) break;
    let data = body.subarray(pos + hdr, pos + hdr + fsize);
    pos += hdr + fsize;
    if (ver === 4) {
      if (fflags & 0x000c) continue;
      if (fflags & 0x0001) data = data.subarray(4);
      if (fflags & 0x0002) data = unsync(data);
    } else if (ver === 3 && (fflags & 0x00c0)) continue;
    const key = ID3_MAP[id];
    if (key && data.length > 1) {
      const vals = id3Text(data.subarray(1), data[0]).split("\0").map((s) => s.trim()).filter(Boolean);
      if (!vals.length || out[key]) continue;
      out[key] = key === "genre" ? vals.map(genreName).filter(Boolean).join(", ") : vals.join(key === "artist" ? "; " : " ");
    } else if (id === "APIC" && data.length > 4) {
      const enc = data[0]; let i = 1;
      const mEnd = data.indexOf(0, i); if (mEnd < 0) continue;
      let mime = latin1(data, i, mEnd - i).toLowerCase(); i = mEnd + 1;
      const type = data[i++];
      i = id3TermEnd(data, i, enc);
      if (!mime.includes("/")) mime = mime.includes("png") ? "image/png" : "image/jpeg";
      pics.push({ type, mime, data: data.subarray(i) });
    } else if (id === "PIC" && data.length > 6) {
      const enc = data[0]; const fmt = latin1(data, 1, 3).toUpperCase(); const type = data[4];
      const i = id3TermEnd(data, 5, enc);
      pics.push({ type, mime: fmt === "PNG" ? "image/png" : "image/jpeg", data: data.subarray(i) });
    }
  }
  if (pics.length) out.picture = pics.find((p) => p.type === 3) || pics[0];
  return out;
}
function parseID3v1(b) {
  if (b.length < 128 || latin1(b, 0, 3) !== "TAG") return {};
  const s = (o, n) => decodeWith("windows-1252", b.subarray(o, o + n)).replace(/\0.*$/s, "").trim();
  const out = { title: s(3, 30), artist: s(33, 30), album: s(63, 30), year: s(93, 4) };
  if (b[125] === 0 && b[126]) out.track = String(b[126]);
  if (b[127] < ID3_GENRES.length) out.genre = ID3_GENRES[b[127]];
  return out;
}

/* ---- MPEG audio frames (durée) ---- */
const MP3_BR = {
  "1-1": [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  "1-2": [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  "1-3": [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  "2-1": [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  "2-2": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const MP3_SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
function mp3Header(b, i) {
  if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) return null;
  const ver = (b[i + 1] >> 3) & 3, layerBits = (b[i + 1] >> 1) & 3;
  if (ver === 1 || layerBits === 0) return null;
  const layer = 4 - layerBits;
  const brIdx = b[i + 2] >> 4, srIdx = (b[i + 2] >> 2) & 3, pad = (b[i + 2] >> 1) & 1;
  if (brIdx === 0 || brIdx === 15 || srIdx === 3) return null;
  const v1 = ver === 3;
  const table = MP3_BR[v1 ? `1-${layer}` : layer === 1 ? "2-1" : "2-2"];
  const br = table[brIdx], sr = MP3_SR[ver][srIdx];
  const mono = (b[i + 3] >> 6) === 3;
  let frameLen, spf;
  if (layer === 1) { frameLen = Math.floor((12 * br * 1000) / sr + pad) * 4; spf = 384; }
  else { spf = layer === 3 && !v1 ? 576 : 1152; frameLen = Math.floor(((spf / 8) * br * 1000) / sr) + pad; }
  const side = layer !== 3 ? 0 : v1 ? (mono ? 17 : 32) : (mono ? 9 : 17);
  return { br, sr, frameLen, spf, side };
}
async function mp3Info(file, start) {
  const b = await readBytes(file, start, 131072);
  for (let i = 0; i + 4 < b.length; i++) {
    if (b[i] !== 0xff) continue;
    const h = mp3Header(b, i); if (!h || h.frameLen < 24) continue;
    const n = i + h.frameLen;
    if (n + 2 < b.length && !mp3Header(b, n)) continue;
    const xo = i + 4 + h.side, tag = latin1(b, xo, 4);
    if ((tag === "Xing" || tag === "Info") && (u32(b, xo + 4) & 1)) {
      const frames = u32(b, xo + 8);
      if (frames) return { duration: (frames * h.spf) / h.sr, sampleRate: h.sr, bitrate: h.br };
    }
    if (latin1(b, i + 36, 4) === "VBRI") {
      const frames = u32(b, i + 36 + 14);
      if (frames) return { duration: (frames * h.spf) / h.sr, sampleRate: h.sr, bitrate: h.br };
    }
    let tail = 0;
    if (file.size > 128) { const t = await readBytes(file, file.size - 128, 3); if (latin1(t, 0, 3) === "TAG") tail = 128; }
    return { duration: ((file.size - start - i - tail) * 8) / (h.br * 1000), sampleRate: h.sr, bitrate: h.br };
  }
  return {};
}

/* ---- Vorbis comments / FLAC ---- */
function parseVorbisComment(u8, o) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const tags = {};
  try {
    const vlen = dv.getUint32(o, true); o += 4 + vlen;
    const n = dv.getUint32(o, true); o += 4;
    for (let k = 0; k < n && o + 4 <= u8.length; k++) {
      const l = dv.getUint32(o, true); o += 4;
      const s = decodeWith("utf-8", u8.subarray(o, o + l)); o += l;
      const eq = s.indexOf("=");
      if (eq > 0) (tags[s.slice(0, eq).toUpperCase()] ||= []).push(s.slice(eq + 1));
    }
  } catch { /* commentaire tronqué */ }
  return tags;
}
function parseFlacPicture(u8) {
  try {
    let o = 0;
    const type = u32(u8, o); o += 4;
    const ml = u32(u8, o); o += 4;
    const mime = latin1(u8, o, ml); o += ml;
    const dl = u32(u8, o); o += 4 + dl + 16;
    const len = u32(u8, o); o += 4;
    return { type, mime: mime || "image/jpeg", data: u8.subarray(o, o + len) };
  } catch { return null; }
}
function b64ToBytes(s) {
  try { const bin = atob(s.replace(/\s+/g, "")); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; } catch { return null; }
}
function fromVorbis(tags) {
  const g = (...keys) => { for (const k of keys) if (tags[k] && tags[k][0]) return tags[k]; return null; };
  const one = (...k) => { const v = g(...k); return v ? v[0].trim() : ""; };
  const out = {
    title: one("TITLE"), artist: (g("ARTIST") || []).map((s) => s.trim()).filter(Boolean).join("; "),
    albumArtist: one("ALBUMARTIST", "ALBUM ARTIST", "ALBUM_ARTIST"), album: one("ALBUM"),
    year: one("DATE", "YEAR", "ORIGINALDATE"), genre: (g("GENRE") || []).join(", "),
    track: one("TRACKNUMBER", "TRACK"), disc: one("DISCNUMBER", "DISC"),
  };
  const tt = one("TRACKTOTAL", "TOTALTRACKS");
  if (tt && out.track && !out.track.includes("/")) out.track += "/" + tt;
  const pics = [];
  for (const b64 of tags.METADATA_BLOCK_PICTURE || []) { const u8 = b64ToBytes(b64); const p = u8 && parseFlacPicture(u8); if (p) pics.push(p); }
  if (!pics.length && tags.COVERART) { const u8 = b64ToBytes(tags.COVERART[0]); if (u8) pics.push({ type: 3, mime: (tags.COVERARTMIME || ["image/jpeg"])[0], data: u8 }); }
  if (pics.length) out.picture = pics.find((p) => p.type === 3) || pics[0];
  return out;
}
async function parseFlac(file, off) {
  let pos = off + 4, last = false, guard = 0;
  const out = {}; const pics = [];
  while (!last && guard++ < 128 && pos + 4 <= file.size) {
    const hb = await readBytes(file, pos, 4);
    last = !!(hb[0] & 0x80);
    const type = hb[0] & 0x7f, len = (hb[1] << 16) | (hb[2] << 8) | hb[3];
    if (type === 0 && len >= 18) {
      const d = await readBytes(file, pos + 4, 18);
      const sr = (d[10] << 12) | (d[11] << 4) | (d[12] >> 4);
      const total = (d[13] & 0x0f) * 4294967296 + u32(d, 14);
      if (sr) { out.sampleRate = sr; if (total) out.duration = total / sr; }
    } else if (type === 4) {
      Object.assign(out, fromVorbis(parseVorbisComment(await readBytes(file, pos + 4, Math.min(len, 8e6)), 0)));
    } else if (type === 6 && !pics.length && len < 24e6) {
      const p = parseFlacPicture(await readBytes(file, pos + 4, len)); if (p) pics.push(p);
    } else if (type === 127) break;
    pos += 4 + len;
  }
  if (!out.picture && pics.length) out.picture = pics[0];
  return out;
}

/* ---- Ogg (Vorbis / Opus) ---- */
function oggPackets(buf, want) {
  const packets = []; let cur = []; let pos = 0, serial = null;
  while (pos + 27 <= buf.length && packets.length < want) {
    if (latin1(buf, pos, 4) !== "OggS") break;
    const ser = u32le(buf, pos + 14), nseg = buf[pos + 26];
    let d = pos + 27 + nseg, total = 0;
    for (let k = 0; k < nseg; k++) total += buf[pos + 27 + k];
    const end = d + total;
    if (serial === null) serial = ser;
    if (ser === serial) {
      for (let k = 0; k < nseg; k++) {
        const l = buf[pos + 27 + k];
        if (d + l > buf.length) return { packets, incomplete: true };
        cur.push(buf.subarray(d, d + l)); d += l;
        if (l < 255) {
          const len = cur.reduce((a, c) => a + c.length, 0); const p = new Uint8Array(len); let o = 0;
          for (const c of cur) { p.set(c, o); o += c.length; }
          packets.push(p); cur = [];
          if (packets.length >= want) break;
        }
      }
    }
    pos = end;
  }
  return { packets, incomplete: packets.length < want };
}
async function parseOgg(file) {
  let size = Math.min(file.size, 1 << 20);
  let res = oggPackets(await readBytes(file, 0, size), 2);
  if (res.incomplete && size < file.size) { size = Math.min(file.size, 24 << 20); res = oggPackets(await readBytes(file, 0, size), 2); }
  const [id, com] = res.packets;
  const out = {}; let rate = 0, preskip = 0;
  if (id && latin1(id, 1, 6) === "vorbis") { rate = u32le(id, 12); if (com) Object.assign(out, fromVorbis(parseVorbisComment(com, 7))); out.codec = "Vorbis"; }
  else if (id && latin1(id, 0, 8) === "OpusHead") { rate = 48000; preskip = u16le(id, 10); if (com) Object.assign(out, fromVorbis(parseVorbisComment(com, 8))); out.codec = "Opus"; }
  if (rate) {
    out.sampleRate = id && latin1(id, 0, 8) === "OpusHead" ? u32le(id, 12) || 48000 : rate;
    const tailLen = Math.min(file.size, 65536 * 2);
    const t = await readBytes(file, file.size - tailLen, tailLen);
    for (let i = t.length - 27; i >= 0; i--) {
      if (t[i] === 0x4f && t[i + 1] === 0x67 && t[i + 2] === 0x67 && t[i + 3] === 0x53) {
        const lo = u32le(t, i + 6), hi = u32le(t, i + 10);
        if (hi === 0xffffffff) continue;
        const g = hi * 4294967296 + lo;
        if (g > 0) { out.duration = (g - preskip) / rate; break; }
      }
    }
  }
  return out;
}

/* ---- MP4 / M4A ---- */
function* atoms(u8, start, end) {
  let p = start;
  while (p + 8 <= end) {
    let size = u32(u8, p); const type = latin1(u8, p + 4, 4); let hdr = 8;
    if (size === 1) { size = u32(u8, p + 8) * 4294967296 + u32(u8, p + 12); hdr = 16; } else if (size === 0) size = end - p;
    if (size < hdr || p + size > end) return;
    yield { type, start: p + hdr, end: p + size };
    p += size;
  }
}
const childAtom = (u8, parent, type) => { for (const a of atoms(u8, parent.start, parent.end)) if (a.type === type) return a; return null; };
async function parseMp4(file) {
  let pos = 0, moov = null, guard = 0;
  while (pos + 8 <= file.size && guard++ < 64) {
    const h = await readBytes(file, pos, 16);
    let size = u32(h, 0); const type = latin1(h, 4, 4); let hdr = 8;
    if (size === 1) { size = u32(h, 8) * 4294967296 + u32(h, 12); hdr = 16; } else if (size === 0) size = file.size - pos;
    if (size < 8) break;
    if (type === "moov") { if (size < 80e6) moov = await readBytes(file, pos + hdr, size - hdr); break; }
    pos += size;
  }
  if (!moov) return {};
  const root = { start: 0, end: moov.length };
  const out = {};
  const mvhd = childAtom(moov, root, "mvhd");
  if (mvhd) {
    const v = moov[mvhd.start];
    const ts = v === 1 ? u32(moov, mvhd.start + 20) : u32(moov, mvhd.start + 12);
    const dur = v === 1 ? u32(moov, mvhd.start + 24) * 4294967296 + u32(moov, mvhd.start + 28) : u32(moov, mvhd.start + 16);
    if (ts) out.duration = dur / ts;
  }
  for (const trak of atoms(moov, 0, moov.length)) {
    if (trak.type !== "trak") continue;
    const stsd = ["mdia", "minf", "stbl", "stsd"].reduce((a, t) => a && childAtom(moov, a, t), trak);
    if (stsd) { const entry = latin1(moov, stsd.start + 12, 4); if (entry && /^[a-zA-Z0-9.]{4}$/.test(entry)) { out.codec = { mp4a: "AAC", alac: "ALAC", fLaC: "FLAC", Opus: "Opus", "ac-3": "AC-3" }[entry] || entry; break; } }
  }
  const udta = childAtom(moov, root, "udta");
  const meta = udta && childAtom(moov, udta, "meta");
  if (meta) {
    const metaBox = latin1(moov, meta.start + 4, 4) === "hdlr" ? meta : { start: meta.start + 4, end: meta.end };
    const ilst = childAtom(moov, metaBox, "ilst");
    if (ilst) {
      const MAP = { "©nam": "title", "©ART": "artist", aART: "albumArtist", "©alb": "album", "©day": "year", "©gen": "genre" };
      for (const item of atoms(moov, ilst.start, ilst.end)) {
        const data = childAtom(moov, item, "data"); if (!data) continue;
        const dtype = u32(moov, data.start) & 0xffffff;
        const val = moov.subarray(data.start + 8, data.end);
        if (MAP[item.type]) out[MAP[item.type]] ||= decodeWith("utf-8", val).trim();
        else if (item.type === "trkn" && val.length >= 6) { const n = (val[2] << 8) | val[3], t = (val[4] << 8) | val[5]; if (n) out.track = t ? `${n}/${t}` : String(n); }
        else if (item.type === "disk" && val.length >= 4) { const n = (val[2] << 8) | val[3]; if (n) out.disc = String(n); }
        else if (item.type === "gnre" && val.length >= 2 && !out.genre) out.genre = ID3_GENRES[((val[0] << 8) | val[1]) - 1] || "";
        else if (item.type === "covr" && !out.picture && val.length > 32) out.picture = { type: 3, mime: dtype === 14 ? "image/png" : "image/jpeg", data: val };
      }
    }
  }
  return out;
}

/* ---- WAV ---- */
async function parseWav(file) {
  const out = {}; let pos = 12, guard = 0, byteRate = 0;
  while (pos + 8 <= file.size && guard++ < 64) {
    const h = await readBytes(file, pos, 8);
    const id = latin1(h, 0, 4), sz = u32le(h, 4), d = pos + 8;
    if (id === "fmt ") { const f = await readBytes(file, d, 16); out.sampleRate = u32le(f, 4); byteRate = u32le(f, 8); }
    else if (id === "data") { if (byteRate) out.duration = Math.min(sz, file.size - d) / byteRate; }
    else if (id === "LIST" && sz < 1e6) {
      const l = await readBytes(file, d, sz);
      if (latin1(l, 0, 4) === "INFO") {
        const M = { INAM: "title", IART: "artist", IPRD: "album", ICRD: "year", IGNR: "genre", ITRK: "track", IPRT: "track" };
        let p = 4;
        while (p + 8 <= l.length) { const k = latin1(l, p, 4), s = u32le(l, p + 4); const v = decodeWith("utf-8", l.subarray(p + 8, p + 8 + s)).replace(/\0+$/, "").trim(); if (M[k] && v) out[M[k]] ||= v; p += 8 + s + (s & 1); }
      }
    } else if ((id === "id3 " || id === "ID3 ") && sz < 30e6) {
      const t = await readBytes(file, d, sz);
      if (latin1(t, 0, 3) === "ID3") Object.assign(out, parseID3v2(t));
    }
    pos = d + sz + (sz & 1);
  }
  return out;
}

/* ---- point d'entrée ---- */
async function parseAudioFile(file) {
  const head = await readBytes(file, 0, 16);
  let out = {};
  let start = 0;
  if (latin1(head, 0, 3) === "ID3") {
    const size = syncsafe(head, 6) + 10 + (head[5] & 0x10 ? 10 : 0);
    out = parseID3v2(await readBytes(file, 0, Math.min(size, 40e6)));
    start = size;
    const after = await readBytes(file, start, 4);
    if (latin1(after, 0, 4) === "fLaC") return Object.assign(await parseFlac(file, start), stripEmpty(out), { codec: "FLAC" });
  }
  const magic = latin1(head, 0, 4);
  if (start === 0 && magic === "fLaC") return Object.assign(await parseFlac(file, 0), { codec: "FLAC" });
  if (magic === "OggS") return parseOgg(file);
  if (latin1(head, 4, 4) === "ftyp") return Object.assign({ codec: "AAC" }, await parseMp4(file));
  if (magic === "RIFF" && latin1(head, 8, 4) === "WAVE") return Object.assign(await parseWav(file), { codec: "WAV" });
  const ext = extOf(file.name);
  if (start > 0 || ext === "mp3" || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)) {
    const info = await mp3Info(file, start);
    if (!out.title && file.size > 128) Object.assign(out, stripEmpty(parseID3v1(await readBytes(file, file.size - 128, 128))), stripEmpty(out));
    return Object.assign(out, info, { codec: ext === "aac" ? "AAC" : "MP3" });
  }
  return out;
}
function stripEmpty(o) { const r = {}; for (const k in o) if (o[k] !== "" && o[k] != null) r[k] = o[k]; return r; }

/* ---- déduire depuis le chemin quand les tags manquent ---- */
const DISC_DIR = /^(cd|dis[ck]|disque)\s*[-_ ]?\s*(\d{1,2})$/i;
const GENERIC_DIR = /^(divers|misc|miscellaneous|various|unsorted|autres?|others?|singles?|titres|tracks|songs|chansons|mp3s?|flac|music|musique|ma musique|my music|downloads?|t[ée]l[ée]chargements?|new folder|nouveau dossier|audio|sons?|playlist|import[ée]?s?)$/i;
function inferFromPath(path) {
  const parts = path.split("/").filter(Boolean);
  const file = parts.pop() || "";
  let base = file.replace(/\.[^.]+$/, "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
  const out = {};
  let m = /^(\d{1,2})[-.](\d{1,3})\s*[-.)]?\s+(.+)$/.exec(base);
  if (m) { out.disc = m[1]; out.track = m[2]; base = m[3]; }
  else if ((m = /^(\d{1,3})\s*(?:[-.)]\s*|\s+)(.+)$/.exec(base)) && !/^\d{4}$/.test(m[1])) { out.track = String(+m[1]); base = m[2]; }
  const segs = base.split(/\s+[-–—]\s+/);
  if (segs.length >= 2) {
    const last = segs[segs.length - 1];
    if (segs.length >= 3 && /^\d{1,3}$/.test(segs[segs.length - 2])) { out.track ||= segs[segs.length - 2]; out.artist = segs[0]; out.title = last; }
    else { out.artist = segs[0]; out.title = segs.slice(1).join(" - "); }
  } else out.title = base;
  let dirs = parts.length === 1 ? parts.slice() : parts.slice(1);
  if (dirs.length && DISC_DIR.test(dirs[dirs.length - 1])) { out.disc ||= DISC_DIR.exec(dirs[dirs.length - 1])[2]; dirs = dirs.slice(0, -1); }
  if (dirs.length && GENERIC_DIR.test(dirs[dirs.length - 1].trim())) dirs = [];
  if (dirs.length) {
    let album = dirs[dirs.length - 1];
    const y = /[([]\s*((?:19|20)\d{2})\s*[)\]]/.exec(album);
    if (y) { out.year = y[1]; album = album.replace(y[0], "").trim(); }
    const am = /^(.+?)\s+[-–—]\s+(.+)$/.exec(album);
    if (am) { out.artist ||= am[1].trim(); album = am[2].trim(); }
    out.album = album.replace(/^((?:19|20)\d{2})\s*[-–—]\s*/, (s, yy) => { out.year ||= yy; return ""; });
    if (dirs.length >= 2) out.dirArtist = dirs[dirs.length - 2];
  }
  return out;
}
function cleanNum(v) { const n = parseInt(String(v || "").split("/")[0], 10); return isFinite(n) && n > 0 ? n : 0; }
function cleanYear(v) { const m = /(\d{4})/.exec(String(v || "")); return m ? +m[1] : 0; }
function splitArtists(s) {
  return String(s || "").split(/\s*(?:;|\s\/\s|\sfeat\.?\s|\sft\.?\s|\sfeaturing\s|\(feat\.?\s)\s*/i)
    .map((x) => x.replace(/\)$/, "").trim()).filter(Boolean);
}
