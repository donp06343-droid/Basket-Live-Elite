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
  if (req.get("x-app-token") !== expected) return res.status(401).json({ error: "Token inválido o ausente." });
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
function slugifyTeam(name) {
  return String(name || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").replace(/-f$|-women$|-femenino$/g, "");
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "online", version: "2.8", liveSharing: true, timestamp: new Date().toISOString() });
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
  if (row.edit_key && req.get("x-edit-key") !== row.edit_key) return res.status(403).json({ error: "Clave inválida" });
  if (!validMatch(req.body)) return res.status(400).json({ error: "Datos inválidos" });
  const now = new Date().toISOString();
  db.prepare("UPDATE matches SET payload = ?, updated_at = ?, is_live = 1 WHERE share_id = ?").run(JSON.stringify(req.body), now, req.params.shareId);
  res.json({ ok: true, ...req.body, shareId: req.params.shareId, isLive: true, updatedAt: now });
});

app.post("/api/live/:shareId/finish", auth, (req, res) => {
  const row = db.prepare("SELECT * FROM matches WHERE share_id = ?").get(req.params.shareId);
  if (!row) return res.status(404).json({ error: "No encontrado" });
  if (row.edit_key && req.get("x-edit-key") !== row.edit_key) return res.status(403).json({ error: "Clave inválida" });
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
    ferro: { name: "Ferro Carril Oeste", form: "—", note: "Grupo B" },
    boca: { name: "Boca Juniors", form: "—", note: "Liga Nacional / Femenina" },
    river: { name: "River Plate", form: "—", note: "Liga Nacional / Femenina" }
  };
  function find(t) { for (const [k, v] of Object.entries(DB)) if (t.includes(k)) return v; return null; }
  res.json({
    teamA: find(teamA), teamB: find(teamB),
    links: {
      sofascore: `https://www.sofascore.com/search?q=${q}`,
      flashscore: `https://www.flashscore.com.ar/busqueda/?q=${q}`,
      google: `https://www.google.com/search?q=${q}+resultado+vivo+OR+live+score`,
      sportscore: `https://sportscore.com/search?q=${q}`
    },
    note: "Datos de temporada + links públicos."
  });
});

app.get("/api/team-form", async (req, res) => {
  const name = String(req.query.team || req.query.q || "").trim();
  if (name.length < 2) return res.json({ ok: false, error: "team requerido" });
  const slug = String(req.query.slug || slugifyTeam(name));
  const out = { ok: false, team: name, slug, form: null, recent: [], source: null };
  try {
    const r = await fetch(
      `https://sportscore.com/api/widget/team/?sport=basketball&slug=${encodeURIComponent(slug)}&limit=12`,
      { headers: { Accept: "application/json", "User-Agent": "BasketLiveElite/2.8" } }
    );
    if (r.ok) {
      const data = await r.json();
      const matches = data.matches || [];
      const finished = matches.filter(m => /finish|ft|ended/i.test(String(m.status || m.status_text || "")));
      const recent = finished.slice(0, 8).map(m => {
        const isHome = (m.home || "").toLowerCase().includes(name.toLowerCase().split(/\s+/)[0]) ||
          (m.home || "").toLowerCase().includes(slug.split("-")[0]);
        const hs = m.home_score != null ? Number(m.home_score) : null;
        const as = m.away_score != null ? Number(m.away_score) : null;
        let result = "?";
        if (hs != null && as != null) {
          if (isHome) result = hs > as ? "W" : hs < as ? "L" : "D";
          else result = as > hs ? "W" : as < hs ? "L" : "D";
        }
        return { home: m.home, away: m.away, homeScore: hs, awayScore: as, result, status: m.status_text || m.status, competition: m.competition };
      });
      const formLetters = recent.map(x => x.result).filter(x => x === "W" || x === "L" || x === "D");
      out.ok = true;
      out.source = "sportscore";
      out.teamMeta = data.team || null;
      out.recent = recent;
      out.form = formLetters.length ? formLetters.join(" ") : null;
      out.wins = formLetters.filter(x => x === "W").length;
      out.losses = formLetters.filter(x => x === "L").length;
      out.attribution = "Powered by SportScore";
    }
  } catch (e) { out.error = String(e.message || e); }
  if (!out.ok && !out.error) out.error = "No se encontró forma (probá nombre en inglés / slug).";
  res.json(out);
});

app.get("/api/live-scores", async (req, res) => {
  const teamA = String(req.query.teamA || "").trim();
  const teamB = String(req.query.teamB || "").trim();
  const date = String(req.query.date || new Date().toISOString().slice(0, 10));
  const key = process.env.API_SPORTS_KEY || process.env.APISPORTS_KEY || "";
  const results = { ok: false, source: null, matches: [], note: null };
  if (key) {
    try {
      const r = await fetch(`https://v1.basketball.api-sports.io/games?date=${encodeURIComponent(date)}`, { headers: { "x-apisports-key": key } });
      const data = await r.json();
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
        id: g.id, home: g.teams?.home?.name, away: g.teams?.away?.name,
        homeScore: g.scores?.home?.total, awayScore: g.scores?.away?.total,
        status: g.status?.long, period: g.status?.short, clock: g.status?.timer || null,
        league: g.league?.name, date: g.date, source: "api-sports"
      }));
      if (results.matches.length) { results.ok = true; results.source = "api-sports"; }
    } catch (e) { results.apiSportsError = String(e.message || e); }
  }
  if (!results.ok) {
    try {
      const r = await fetch("https://sportscore.com/api/widget/matches/?sport=basketball&limit=40", { headers: { Accept: "application/json", "User-Agent": "BasketLiveElite/2.8" } });
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
        home: m.home, away: m.away,
        homeScore: m.home_score != null ? Number(m.home_score) : null,
        awayScore: m.away_score != null ? Number(m.away_score) : null,
        status: m.status_text || m.status, league: m.competition, date: m.time, source: "sportscore"
      }));
      if (results.matches.length) { results.ok = true; results.source = "sportscore"; results.note = "Powered by SportScore"; }
    } catch (e) { results.sportscoreError = String(e.message || e); }
  }
  if (!results.ok) results.note = "Sin partidos para esos equipos/fecha en fuentes gratis.";
  res.json(results);
});

app.get("/api/search-teams", async (req, res) => {
  const q = String(req.query.q || "").trim();
  const key = process.env.API_SPORTS_KEY || process.env.APISPORTS_KEY || "";
  if (!key || q.length < 2) return res.json({ ok: false, teams: [], reason: !key ? "Sin API_SPORTS_KEY" : "q corto" });
  try {
    const r = await fetch(`https://v1.basketball.api-sports.io/teams?search=${encodeURIComponent(q)}`, { headers: { "x-apisports-key": key } });
    const data = await r.json();
    res.json({ ok: true, teams: (data.response || []).slice(0, 12).map(t => ({ id: t.id, name: t.name, country: t.country?.name, logo: t.logo })) });
  } catch (e) { res.json({ ok: false, teams: [], error: String(e.message || e) }); }
});

app.post("/api/assistant", (req, res) => {
  const b = req.body || {};
  const ptsA = Number(b.ptsA) || 0, ptsB = Number(b.ptsB) || 0;
  const elapsed = Number(b.elapsed) || 0, line = Number(b.line) || 0;
  const action = String(b.action || "HOLD"), proj = Number(b.proj) || 0;
  const tips = [];
  if (elapsed < 8) tips.push("Pocos minutos: el modelo es más confiable después de ~8–10 min. Preferí HOLD.");
  if (line > 0 && proj > 0) {
    const gap = Math.abs(proj - line);
    if (gap < 2) tips.push(`Proyección muy cerca de la línea (${proj.toFixed(1)} vs ${line}): edge bajo.`);
    if (gap >= 6) tips.push(`Brecha grande proyección–línea (~${gap.toFixed(1)} pts): hay señal; confirmá ritmo.`);
  }
  if (action === "CASH_OUT") tips.push("Cash-out: el edge se deterioró. Asegurar reduce regalar ganancia.");
  if (action === "NO_ENTER") tips.push("NO ENTRAR es válido. Preservar bankroll > forzar apuesta.");
  if (action === "ENTER") tips.push("Entrada solo con EV≥5%, edge≥3.5pp, cuota≥1.25 y máx ¼ Kelly / 2.5% bankroll.");
  if (Math.abs(ptsA - ptsB) >= 15 && elapsed >= 25) tips.push("Marcador muy definido: revisá si la línea de total sigue con valor.");
  if (!tips.length) tips.push("Seguí actualizando marcador. El modelo se afina con más minutos.");
  res.json({ ok: true, tips, disclaimer: "" });
});

app.use(express.static(path.join(__dirname, "public"), {
  setHeaders(res, filePath) {
    if (filePath.endsWith(".js") || filePath.endsWith(".html"))
      res.setHeader("Cache-Control", "no-store, max-age=0");
  }
}));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, "0.0.0.0", () => console.log("Basket Live Elite v2.8 on :" + PORT));
