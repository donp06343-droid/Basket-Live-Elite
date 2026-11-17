const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, "basket-live.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  payload TEXT NOT NULL
)`);
const columns = db.prepare("PRAGMA table_info(matches)").all().map(c => c.name);
if (!columns.includes("share_id")) db.exec("ALTER TABLE matches ADD COLUMN share_id TEXT");
if (!columns.includes("updated_at")) db.exec("ALTER TABLE matches ADD COLUMN updated_at TEXT");
if (!columns.includes("is_live")) db.exec("ALTER TABLE matches ADD COLUMN is_live INTEGER NOT NULL DEFAULT 0");
if (!columns.includes("edit_key")) db.exec("ALTER TABLE matches ADD COLUMN edit_key TEXT");
const oldRows = db.prepare("SELECT id FROM matches WHERE share_id IS NULL OR share_id = ''").all();
const migrate = db.prepare("UPDATE matches SET share_id=?, updated_at=COALESCE(updated_at,created_at) WHERE id=?");
for (const row of oldRows) migrate.run(crypto.randomBytes(9).toString("base64url"), row.id);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "2mb" }));
app.use("/api/", rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: "draft-7", legacyHeaders: false }));

function auth(req, res, next) {
  const expected = process.env.APP_TOKEN;
  if (!expected) return next();
  if (req.get("x-app-token") !== expected) return res.status(401).json({ error: "Token inválido o ausente. Revisá la pestaña Servidor." });
  next();
}
function validMatch(p) {
  return p && typeof p.teamA === "string" && typeof p.teamB === "string" &&
    p.teamA.trim().length > 0 && p.teamB.trim().length > 0 &&
    Number.isFinite(Number(p.ptsA)) && Number.isFinite(Number(p.ptsB)) &&
    Number(p.ptsA) >= 0 && Number(p.ptsB) >= 0;
}
function publicMatch(row) {
  if (!row) return null;
  return { ...JSON.parse(row.payload), shareId: row.share_id, updatedAt: row.updated_at, isLive: !!row.is_live };
}

app.get("/api/health", (_req, res) => res.json({
  status: "online",
  storage: process.env.DATA_DIR ? "persistent-disk-configured" : "local-or-ephemeral",
  liveSharing: true,
  timestamp: new Date().toISOString()
}));
app.get("/api/matches", auth, (_req, res) => {
  const rows = db.prepare("SELECT id, share_id, created_at, updated_at, is_live, payload FROM matches ORDER BY id DESC LIMIT 100").all();
  res.json(rows.map(r => ({ id: r.id, ...publicMatch(r), createdAt: r.created_at })));
});
app.post("/api/matches", auth, (req, res) => {
  const p = req.body;
  if (!validMatch(p)) return res.status(400).json({ error: "Completá los dos equipos y un marcador válido." });
  const now = new Date().toISOString();
  const shareId = crypto.randomBytes(12).toString("base64url");
  const editKey = crypto.randomBytes(24).toString("base64url");
  const info = db.prepare("INSERT INTO matches(created_at,updated_at,payload,share_id,is_live,edit_key) VALUES(?,?,?,?,1,?)")
    .run(now, now, JSON.stringify(p), shareId, editKey);
  res.status(201).json({ id: Number(info.lastInsertRowid), shareId, editKey, shareUrl: "/live/" + shareId, updatedAt: now });
});
app.get("/api/live/:shareId", (req, res) => {
  const row = db.prepare("SELECT payload,share_id,updated_at,is_live FROM matches WHERE share_id=?").get(req.params.shareId);
  if (!row) return res.status(404).json({ error: "No encontramos ese seguimiento. Pedí un enlace nuevo al organizador." });
  res.json(publicMatch(row));
});
app.put("/api/live/:shareId", auth, (req, res) => {
  const owner = db.prepare("SELECT edit_key FROM matches WHERE share_id=?").get(req.params.shareId);
  if (!owner) return res.status(404).json({ error: "No existe ese partido." });
  const supplied = req.get("x-edit-key") || "";
  if (!owner.edit_key || supplied.length !== owner.edit_key.length || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(owner.edit_key))) return res.status(403).json({ error: "Este navegador no tiene permiso para editar el seguimiento. Creá uno nuevo desde aquí." });
  const p = req.body;
  if (!validMatch(p)) return res.status(400).json({ error: "Marcador o equipos inválidos." });
  const now = new Date().toISOString();
  const result = db.prepare("UPDATE matches SET payload=?,updated_at=?,is_live=1 WHERE share_id=?")
    .run(JSON.stringify(p), now, req.params.shareId);
  if (!result.changes) return res.status(404).json({ error: "No existe ese partido. Creá uno primero." });
  res.json({ ok: true, updatedAt: now });
});
app.post("/api/live/:shareId/finish", auth, (req, res) => {
  const owner = db.prepare("SELECT edit_key FROM matches WHERE share_id=?").get(req.params.shareId);
  const supplied = req.get("x-edit-key") || "";
  if (!owner) return res.status(404).json({ error: "Partido no encontrado." });
  if (!owner.edit_key || supplied.length !== owner.edit_key.length || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(owner.edit_key))) return res.status(403).json({ error: "No tenés permiso para finalizar este seguimiento." });
  const result = db.prepare("UPDATE matches SET is_live=0,updated_at=? WHERE share_id=?")
    .run(new Date().toISOString(), req.params.shareId);
  if (!result.changes) return res.status(404).json({ error: "Partido no encontrado." });
  res.json({ ok: true });
});
app.use(express.static(path.join(__dirname, "public")));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, "0.0.0.0", () => console.log(`Basket Live Elite escuchando en ${PORT}`));
