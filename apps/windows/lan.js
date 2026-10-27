// aurore sur le Wi-Fi : le téléphone trouve le PC, s'y associe avec un code, puis
// synchronise playlists, likes et statistiques, envoie ou reçoit des titres, et sert de télécommande.
// Rien ne passe par internet : seulement le réseau de la maison.
const http = require("http");
const dgram = require("dgram");
const crypto = require("crypto");
const os = require("os");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");

const PORT = 47130, DISCO = 47131;
const AUDIO_EXT = /\.(mp3|flac|m4a|aac|ogg|oga|opus|wav)$/i;

function createLan({ getConfig, saveConfig, library, freeName, ask, notify }) {
  let server = null, udp = null, code = null, codeAt = 0;
  const cfg = () => { const c = getConfig(); c.lan ||= { id: crypto.randomBytes(8).toString("hex"), phones: [] }; return c.lan; };
  const name = () => os.hostname() || "PC";
  const ips = () => Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);

  function newCode() { code = String(crypto.randomInt(0, 1e6)).padStart(6, "0"); codeAt = Date.now(); return code; }
  function phoneFor(req) {
    const tok = String(req.headers["x-aurore-token"] || "");
    if (!tok) return null;
    return cfg().phones.find((p) => p.token.length === tok.length && crypto.timingSafeEqual(Buffer.from(p.token), Buffer.from(tok))) || null;
  }
  const send = (res, code, obj) => { const b = Buffer.from(JSON.stringify(obj)); res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Content-Length": b.length }); res.end(b); };
  const body = (req, max = 4e6) => new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on("data", (c) => { n += c.length; if (n > max) { reject(new Error("trop gros")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch (e) { reject(e); } });
    req.on("error", reject);
  });

  async function handle(req, res) {
    const u = new URL(req.url, "http://x"), p = u.pathname;
    try {
      if (p === "/hello") return send(res, 200, { app: "aurore", id: cfg().id, name: name() });
      if (p === "/pair" && req.method === "POST") {
        const b = await body(req, 4096);
        if (!code || Date.now() - codeAt > 10 * 60 * 1000 || String(b.code || "") !== code) return send(res, 403, { error: "code" });
        const phone = { id: crypto.randomBytes(6).toString("hex"), name: String(b.name || "Téléphone").slice(0, 60), token: crypto.randomBytes(24).toString("hex"), at: Date.now() };
        cfg().phones = [...cfg().phones.filter((x) => x.name !== phone.name), phone]; saveConfig();
        code = null; notify({ type: "paired", name: phone.name });
        return send(res, 200, { token: phone.token, id: cfg().id, name: name() });
      }
      const phone = phoneFor(req);
      if (!phone) return send(res, 401, { error: "token" });
      phone.seen = Date.now();
      if (p === "/state") return send(res, 200, await ask("state", {}));
      if (p === "/cmd" && req.method === "POST") return send(res, 200, await ask("cmd", await body(req, 4096)));
      if (p === "/sync" && req.method === "POST") { const r = await ask("sync", { phone: phone.id, data: await body(req, 20e6) }); phone.synced = Date.now(); saveConfig(); return send(res, 200, r); }
      if (p === "/outbox") return send(res, 200, await ask("outbox", { phone: phone.id }));
      if (p === "/done" && req.method === "POST") return send(res, 200, await ask("outbox-done", { phone: phone.id, ...(await body(req, 4096)) }));
      if (p === "/file") {
        const r = await ask("file", { id: u.searchParams.get("id") || "" });
        if (!r || !r.path) return send(res, 404, { error: "absent" });
        const st = await fsp.stat(r.path);
        res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": st.size });
        return fs.createReadStream(r.path).pipe(res);
      }
      if (p === "/upload" && req.method === "POST") {
        const fname = path.basename(String(u.searchParams.get("name") || "titre.mp3")).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 150);
        if (!AUDIO_EXT.test(fname)) return send(res, 415, { error: "format" });
        const dir = path.join(library(), "Du téléphone");
        await fsp.mkdir(dir, { recursive: true });
        const dest = await freeName(dir, fname), tmp = dest + ".part";
        const max = 800e6; let n = 0;
        await new Promise((resolve, reject) => {
          const out = fs.createWriteStream(tmp);
          req.on("data", (c) => { n += c.length; if (n > max) { req.destroy(); reject(new Error("trop gros")); } });
          req.pipe(out); out.on("finish", resolve); out.on("error", reject); req.on("error", reject);
        });
        await fsp.rename(tmp, dest);
        notify({ type: "received", name: fname, from: phone.name });
        return send(res, 200, { ok: true, name: path.basename(dest) });
      }
      return send(res, 404, { error: "inconnu" });
    } catch (e) { try { send(res, 500, { error: String((e && e.message) || e).slice(0, 120) }); } catch { /* déjà répondu */ } }
  }

  function start() {
    if (server) return true;
    server = http.createServer((req, res) => { handle(req, res); });
    server.on("error", () => { server = null; });
    server.listen(PORT, "0.0.0.0");
    udp = dgram.createSocket({ type: "udp4", reuseAddr: true });
    udp.on("message", (msg, rinfo) => {
      if (String(msg).trim() !== "AURORE?") return;
      const r = Buffer.from(JSON.stringify({ app: "aurore", id: cfg().id, name: name(), port: PORT }));
      udp.send(r, rinfo.port, rinfo.address);
    });
    udp.on("error", () => { try { udp.close(); } catch { /* déjà fermé */ } udp = null; });
    udp.bind(DISCO);
    const c = getConfig(); if (!c.lanOn) { c.lanOn = true; saveConfig(); }
    return true;
  }
  function stop() {
    try { server && server.close(); } catch { /* rien */ }
    try { udp && udp.close(); } catch { /* rien */ }
    server = null; udp = null;
    const c = getConfig(); c.lanOn = false; saveConfig();
  }
  function info() {
    const l = cfg();
    return { on: !!server, name: name(), ips: ips(), port: PORT, code: code && Date.now() - codeAt < 10 * 60 * 1000 ? code : null, phones: l.phones.map(({ token, ...p }) => p) };
  }
  function forget(id) { cfg().phones = cfg().phones.filter((p) => p.id !== id); saveConfig(); }
  if (getConfig().lanOn) start();
  return { start, stop, info, newCode: () => { start(); return newCode(); }, forget };
}

module.exports = { createLan };
