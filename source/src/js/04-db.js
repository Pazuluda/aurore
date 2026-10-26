/* ===================== IndexedDB (bibliothèque, pochettes, fichiers, stats) ===================== */
const DB = {
  db: null,
  async open() {
    if (this.db) return this.db;
    try {
      this.db = await new Promise((res, rej) => {
        const r = indexedDB.open("aurore", 1);
        r.onupgradeneeded = () => { for (const n of ["tracks", "art", "files", "kv"]) if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n); };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
        r.onblocked = () => rej(new Error("blocked"));
      });
    } catch { this.db = null; }
    return this.db;
  },
  req(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  async get(store, key) {
    if (!this.db) return undefined;
    try { return await this.req(this.db.transaction(store).objectStore(store).get(key)); } catch { return undefined; }
  },
  async put(store, key, val) {
    if (!this.db) return false;
    try {
      const tx = this.db.transaction(store, "readwrite"); tx.objectStore(store).put(val, key);
      await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
      return true;
    } catch (e) { if (e && e.name === "QuotaExceededError") throw e; return false; }
  },
  async putMany(store, entries) {
    if (!this.db || !entries.length) return;
    try {
      const tx = this.db.transaction(store, "readwrite"); const os = tx.objectStore(store);
      for (const [k, v] of entries) os.put(v, k);
      await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
    } catch { /* ignore */ }
  },
  async del(store, key) {
    if (!this.db) return;
    try { const tx = this.db.transaction(store, "readwrite"); tx.objectStore(store).delete(key); await new Promise((r) => (tx.oncomplete = r)); } catch { /* ignore */ }
  },
  async all(store) {
    if (!this.db) return [];
    try {
      const os = this.db.transaction(store).objectStore(store);
      const [keys, vals] = await Promise.all([this.req(os.getAllKeys()), this.req(os.getAll())]);
      return keys.map((k, i) => [k, vals[i]]);
    } catch { return []; }
  },
  async keys(store) {
    if (!this.db) return [];
    try { return await this.req(this.db.transaction(store).objectStore(store).getAllKeys()); } catch { return []; }
  },
  async clear(store) {
    if (!this.db) return;
    try { const tx = this.db.transaction(store, "readwrite"); tx.objectStore(store).clear(); await new Promise((r) => (tx.oncomplete = r)); } catch { /* ignore */ }
  },
};
