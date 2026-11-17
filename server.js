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
  db.prepare("INSERT INTO matches (created_at, updated_at, payload, share_id, is_live, edit_key) VALUES (?,?,?,?,1,?)").run(now, now, JSON.stringify(req.body), shareId, editKey);
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

app.get("/api/public-context", (req, res) => {
  const teamA = String(req.query.teamA || "").toLowerCase();
  const teamB = String(req.query.teamB || "").toLowerCase();
  const q = encodeURIComponent(`${req.query.teamA || ""} ${req.query.teamB || ""} basket`);
  const DB = {
    berazategui: { name: "Deportivo Berazategui (F)", form: "W W L W W", ppg: 77, papg: 62.8, note: "Grupo B · fuerte en casa" },
    obras: { name: "Obras Sanitarias (F)", form: "W W W W L", ppg: 73.6, papg: 68.7, note: "Líder/co-líder Grupo B" },
    "el talar": { name: "El Talar", form: "W L W W W", note: "Líder Grupo B" },
    ferro: { name: "Ferro Carril Oeste", form: "—", note: "Grupo B" }
  };
  function find(t) { for (const [k, v] of Object.entries(DB)) if (t.includes(k)) return v; return null; }
  res.json({
    teamA: find(teamA), teamB: find(teamB),
    links: {
      sofascore: `https://www.sofascore.com/search?q=${q}`,
      flashscore: `https://www.flashscore.com.ar/busqueda/?q=${q}`,
      google: `https://www.google.com/search?q=${q}+resultado+vivo+OR+live+score`
    },
    note: "Datos de temporada aproximados. Links directos a fuentes públicas."
  });
});

app.get("/api/live-scores", async (req, res) => {
  const teamA = String(req.query.teamA || "").trim();
  const teamB = String(req.query.teamB || "").trim();
  const date = String(req.query.date || new Date().toISOString().slice(0, 10));
  const key = process.env.API_SPORTS_KEY || process.env.APISPORTS_KEY || "";
  const results = { ok: false, source: null, matches: [], note: null };

  if (key) {
    try {
      const url = `https://v1.basketball.api-sports.io/games?date=${encodeURIComponent(date)}`;
      const r = await fetch(url, { headers: { "x-apisports-key": key } });
      const data = await r.json();
      if (data.errors && Object.keys(data.errors).length) results.apiSportsError = data.errors;
      let games = data.response || [];
      const q = (teamA + " " + teamB).toLowerCase();
      if (q.trim()) {
        const tokens = q.split(/\s+/).filter(t => t.length > 3);
        games = games.filter(g => {
          const h = (g.teams?.home?.name || "").toLowerCase();
          const a = (g.teams?.away?.name || "").toLowerCase();
          return tokens.some(t => h.includes(t) || a.includes(t));
        });
      }
      results.matches = games.slice(0, 15).map(g => ({
        id: g.id,
        home: g.teams?.home?.name,
        away: g.teams?.away?.name,
        homeScore: g.scores?.home?.total,
        awayScore: g.scores?.away?.total,
        status: g.status?.long,
        period: g.status?.short,
        clock: g.status?.timer || null,
        league: g.league?.name,
        country: g.country?.name || g.league?.country?.name,
        date: g.date,
        source: "api-sports"
      }));
      if (results.matches.length) { results.ok = true; results.source = "api-sports"; }
      results.apiSportsQuota = data.results;
    } catch (e) {
      results.apiSportsError = String(e.message || e);
    }
  }

  if (!results.ok) {
    try {
      const r = await fetch("https://sportscore.com/api/widget/matches/?sport=basketball&limit=40");
      const data = await r.json();
      let matches = data.matches || [];
      const q = (teamA + " " + teamB).toLowerCase();
      if (q.trim()) {
        const tokens = q.split(/\s+/).filter(t => t.length > 3);
        matches = matches.filter(m => {
          const h = (m.home || "").toLowerCase();
          const a = (m.away || "").toLowerCase();
          return tokens.some(t => h.includes(t) || a.includes(t));
        });
      }
      results.matches = matches.slice(0, 15).map(m => ({
        home: m.home,
        away: m.away,
        homeScore: m.home_score != null ? Number(m.home_score) : null,
        awayScore: m.away_score != null ? Number(m.away_score) : null,
        status: m.status_text || m.status,
        league: m.competition,
        date: m.time,
        source: "sportscore"
      }));
      if (results.matches.length) {
        results.ok = true;
        results.source = "sportscore";
        results.note = "Powered by SportScore (fallback gratis)";
      }
    } catch (e) {
      results.sportscoreError = String(e.message || e);
    }
  }

  if (!results.ok) {
    results.note = key
      ? "Sin partidos para esos equipos/fecha. Plan Free de API-Sports no cubre Liga Femenina AR temporada 2025/26 (solo 2022–2024)."
      : "Configurá API_SPORTS_KEY en Render. Mientras tanto se usa SportScore gratis si hay match.";
  }
  res.json(results);
});

app.get("/api/search-teams", async (req, res) => {
  const q = String(req.query.q || "").trim();
  const key = process.env.API_SPORTS_KEY || process.env.APISPORTS_KEY || "";
  if (!key || q.length < 2) {
    return res.json({ ok: false, teams: [], reason: !key ? "Sin API_SPORTS_KEY" : "q muy corto" });
  }
  try {
    const r = await fetch(`https://v1.basketball.api-sports.io/teams?search=${encodeURIComponent(q)}`, {
      headers: { "x-apisports-key": key }
    });
    const data = await r.json();
    const teams = (data.response || []).slice(0, 12).map(t => ({
      id: t.id, name: t.name, country: t.country?.name, logo: t.logo
    }));
    res.json({ ok: true, teams });
  } catch (e) {
    res.json({ ok: false, teams: [], error: String(e.message || e) });
  }
});

app.use(express.static(path.join(__dirname, "public"), {
  setHeaders(res, filePath) {
    if (filePath.endsWith(".js") || filePath.endsWith(".html"))
      res.setHeader("Cache-Control", "no-store, max-age=0");
  }
}));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, "0.0.0.0", () => console.log("Basket Live Elite on :" + PORT));
