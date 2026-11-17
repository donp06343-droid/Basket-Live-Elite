const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

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

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "256kb" }));
app.use("/api/", rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: "draft-7", legacyHeaders: false }));

function auth(req, res, next) {
  const expected = process.env.APP_TOKEN;
  if (!expected) return next();
  if (req.get("x-app-token") !== expected) return res.status(401).json({ error: "Token inválido o ausente" });
  next();
}
app.get("/api/health", (_req, res) => res.json({
  status: "online",
  storage: process.env.DATA_DIR ? "persistent-disk-configured" : "local-or-ephemeral",
  timestamp: new Date().toISOString()
}));
app.get("/api/matches", auth, (_req, res) => {
  const rows = db.prepare("SELECT id, created_at, payload FROM matches ORDER BY id DESC LIMIT 100").all();
  res.json(rows.map(r => ({ id: r.id, ...JSON.parse(r.payload), createdAt: r.created_at })));
});
app.post("/api/matches", auth, (req, res) => {
  const p = req.body;
  if (!p || typeof p.teamA !== "string" || typeof p.teamB !== "string" ||
      !Number.isFinite(p.ptsA) || !Number.isFinite(p.ptsB) || !p.A || !p.B)
    return res.status(400).json({ error: "Datos del partido incompletos" });
  const createdAt = new Date().toISOString();
  const info = db.prepare("INSERT INTO matches(created_at,payload) VALUES(?,?)").run(createdAt, JSON.stringify(p));
  res.status(201).json({ id: Number(info.lastInsertRowid), createdAt });
});
app.use(express.static(path.join(__dirname, "public")));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, "0.0.0.0", () => console.log(`Basket Live Elite escuchando en ${PORT}`));
