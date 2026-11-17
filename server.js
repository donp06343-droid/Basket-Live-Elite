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
  return p && typeof p.teamA === "string" && typeof p.teamB === "string" && Number.isFinite(+p.ptsA) && Number.isFinite(+p.ptsB);
}
function publicMatch(row) {
  const p = JSON.parse(row.payload || "{}");
  return {
    teamA: p.teamA, teamB: p.teamB, ptsA: p.ptsA, ptsB: p.ptsB,
    period: p.period, clock: p.clock, league: p.league, periodLength: p.periodLength,
    shareId: row.share_id, isLive: !!row.is_live,
    updatedAt: row.updated_at || row.created_at, createdAt: row.created_at
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "online", storage: "local-or-ephemeral", liveSharing: true, timestamp: new Date().toISOString() });
});

app.get("/api/matches", auth, (_req, res) => {
  const rows = db.prepare("SELECT * FROM matches ORDER BY id DESC LIMIT 100").all();
  res.json(rows.map(r => ({ id: r.id, ...publicMatch(r), createdAt: r.created_at })));
});

app.post("/api/matches", auth, (req, res) => {
  if (!validMatch(req.body)) return res.status(400).json({ error: "Datos de partido inválidos" });
  const shareId = crypto.randomBytes(9).toString("base64url");
  const editKey = crypto.randomBytes(12).toString("base64url");
  const now = new Date().toISOString();
  const payload = JSON.stringify(req.body);
  db.prepare("INSERT INTO matches (created_at, updated_at, payload, share_id, is_live, edit_key) VALUES (?,?,?,?,1,?)").run(now, now, payload, shareId, editKey);
  res.json({ shareId, editKey, ...req.body, isLive: true });
});

app.get("/api/live/:shareId", (req, res) => {
  const row = db.prepare("SELECT * FROM matches WHERE share_id = ?").get(req.params.shareId);
  if (!row) return res.status(404).json({ error: "No encontrado" });
  res.json(publicMatch(row));
});

app.put("/api/live/:shareId", auth, (req, res) => {
  const row = db.prepare("SELECT * FROM matches WHERE share_id = ?").get(req.params.shareId);
  if (!row) return res.status(404).json({ error: "No encontrado" });
  if (row.edit_key && req.get("x-edit-key") !== row.edit_key) return res.status(403).json({ error: "Clave de edición inválida" });
  if (!validMatch(req.body)) return res.status(400).json({ error: "Datos inválidos" });
  const now = new Date().toISOString();
  db.prepare("UPDATE matches SET payload = ?, updated_at = ?, is_live = 1 WHERE share_id = ?").run(JSON.stringify(req.body), now, req.params.shareId);
  res.json({ ok: true, ...req.body, shareId: req.params.shareId, isLive: true, updatedAt: now });
});

app.post("/api/live/:shareId/finish", auth, (req, res) => {
  const row = db.prepare("SELECT * FROM matches WHERE share_id = ?").get(req.params.shareId);
  if (!row) return res.status(404).json({ error: "No encontrado" });
  if (row.edit_key && req.get("x-edit-key") !== row.edit_key) return res.status(403).json({ error: "Clave de edición inválida" });
  db.prepare("UPDATE matches SET is_live = 0, updated_at = ? WHERE share_id = ?").run(new Date().toISOString(), req.params.shareId);
  res.json({ ok: true, isLive: false });
});

app.use(express.static(path.join(__dirname, "public"), {
  setHeaders(res, filePath) {
    if (filePath.endsWith(".js") || filePath.endsWith(".html")) {
      res.setHeader("Cache-Control", "no-store, max-age=0");
    }
  }
}));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => console.log("Basket Live Elite on :" + PORT));
