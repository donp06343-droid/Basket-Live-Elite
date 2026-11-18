/* Basket Live Elite v2.7 — motor de pronóstico profesional
   Navegador: window.BLM · Node: module.exports (tests) */
(function (root) {
  const Phi = x => {
    const t = 1 / (1 + .2316419 * Math.abs(x)), d = .3989423 * Math.exp(-x * x / 2);
    const p = d * t * (.3193815 + t * (-.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - p : p;
  };
  const PhiInv = p => {
    p = Math.min(Math.max(p, 1e-6), 1 - 1e-6);
    const q = p < .5 ? p : 1 - p, t = Math.sqrt(-2 * Math.log(q));
    const x = t - (2.515517 + .802853 * t + .010328 * t * t) / (1 + 1.432788 * t + .189269 * t * t + .001308 * t * t * t);
    return p < .5 ? -x : x;
  };
  const SG = 2.3, SGM = 1.7;
  const evOf = (p, pp, o) => p * (o - 1) - (1 - p - pp);
  const noVig = (a, b) => { const i = 1 / a, j = 1 / b; return i / (i + j); };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  function project(s) {
    const G = s.G, rem = Math.max(G - s.elapsed, 0), obs = s.pts / Math.max(s.elapsed, .5);
    const prior = s.pre ? s.pre / G : s.line ? Math.max(s.line - s.pts, 0) / Math.max(rem, .5) : obs;
    const w = s.elapsed / (s.elapsed + G * .3), rate = w * obs + (1 - w) * prior, remPts = rem * rate;
    return { G, rem, obs, prior, w, rate, proj: s.pts + remPts, sd: Math.max(Math.sqrt(SG * SG * rem + Math.pow(.05 * remPts, 2)), 1) };
  }
  function totals(m, line) {
    const int = Number.isInteger(line), a = int ? line + .5 : line, b = int ? line - .5 : line;
    const over = 1 - Phi((a - m.proj) / m.sd), under = Phi((b - m.proj) / m.sd);
    return { over, under, push: Math.max(0, 1 - over - under) };
  }
  function winA(d, pre) {
    if (d.rem <= 0) return d.diff > 0 ? 1 : d.diff < 0 ? 0 : .5;
    const sd = Math.max(SGM * Math.sqrt(d.rem), 1);
    const mu0 = pre == null ? 0 : SGM * Math.sqrt(d.G) * PhiInv(pre);
    return Phi((d.diff + d.rem / d.G * mu0) / sd);
  }
  const hist = [];
  function record(el, pts) {
    if (hist.length && el < hist[hist.length - 1].el - .5) hist.length = 0;
    if (!hist.length || el > hist[hist.length - 1].el + .05) hist.push({ el, pts });
    if (hist.length > 500) hist.shift();
    return trend();
  }
  function trend() {
    const n = hist.length; if (n < 2) return { ok: false };
    const cur = hist[n - 1]; let ref = null;
    for (let i = n - 2; i >= 0; i--) if (cur.el - hist[i].el >= 3) { ref = hist[i]; break; }
    if (!ref || cur.el < 6) return { ok: false };
    const dm = cur.el - ref.el, recent = (cur.pts - ref.pts) / dm, before = ref.pts / Math.max(ref.el, 1);
    const z = (recent - before) / (SG / Math.sqrt(dm)), chg = (recent / Math.max(before, .01) - 1) * 100;
    const alert = Math.abs(z) >= 1.5 && Math.abs(chg) >= 12, dir = z > 0 ? 'acelera' : 'frena';
    return { ok: true, recent, before, z, chg, alert, dir, key: alert ? dir + Math.floor(cur.el / 4) : null,
      msg: `el ritmo ${dir}: ${recent.toFixed(2)} pts/min en los últimos ${dm.toFixed(0)}' vs ${before.toFixed(2)} antes (${chg > 0 ? '+' : ''}${chg.toFixed(0)}%, z=${z.toFixed(1)})` };
  }
  function momentum(d, m) {
    const el = d.elapsed, rem = d.rem, diff = d.diff, G = d.G;
    const phase = el / Math.max(G, 1);
    const leadSolid = Math.abs(diff) >= 12 && phase >= 0.55;
    const leadFragile = Math.abs(diff) >= 6 && Math.abs(diff) < 12 && phase < 0.5;
    const blowout = Math.abs(diff) >= 18;
    const closeLate = Math.abs(diff) <= 5 && phase >= 0.75;
    const comebackPath = Math.abs(diff) >= 8 && phase >= 0.6 && m.rate > 3.2;
    const clockPressure = rem <= 6 ? clamp(1.2 - rem / 10, 0.4, 1.2) : 0.5;
    const fatigueRisk = m.obs >= 3.8 && phase >= 0.55 ? 0.7 : m.obs >= 3.4 && phase >= 0.7 ? 0.45 : 0.15;
    let mood = 'neutral';
    if (blowout) mood = diff > 0 ? 'dominio_A' : 'dominio_B';
    else if (closeLate) mood = 'cierre_cerrado';
    else if (leadSolid) mood = diff > 0 ? 'control_A' : 'control_B';
    else if (leadFragile) mood = 'ventaja_frágil';
    else if (comebackPath) mood = 'posible_remontada';
    const notes = [];
    if (mood === 'dominio_A' || mood === 'dominio_B') notes.push('Partido muy definido: el favorito del marcador rara vez entrega todo el edge; totales pueden seguir vivos.');
    if (mood === 'cierre_cerrado') notes.push('Cierre apretado: sube la varianza. Preferir totales o HOLD en moneyline.');
    if (mood === 'ventaja_frágil') notes.push('Ventaja aún no consolidada: un parcial de 6–8 pts cambia el relato.');
    if (mood === 'posible_remontada') notes.push('Ritmo alto + desventaja: hay camino matemático de remontada.');
    if (fatigueRisk >= 0.45) notes.push('Ritmo muy alto: en cierres suele bajar la eficiencia.');
    if (clockPressure >= 0.85) notes.push('Presión de reloj alta: cada posesión vale más.');
    return { mood, clockPressure, fatigueRisk, leadSolid, leadFragile, blowout, closeLate, notes };
  }
  function scenarios(m, pts, line) {
    return [
      { name: 'Freno (−15%)', rate: m.rate * 0.85 },
      { name: 'Base (actual)', rate: m.rate },
      { name: 'Acelera (+15%)', rate: m.rate * 1.15 }
    ].map(r => {
      const proj = pts + m.rem * r.rate;
      const sd = Math.max(Math.sqrt(SG * SG * m.rem + Math.pow(.05 * m.rem * r.rate, 2)), 1);
      let pOver = null, pUnder = null;
      if (line) { const t = totals({ proj, sd }, line); pOver = t.over; pUnder = t.under; }
      return { name: r.name, rate: r.rate, proj, sd, pOver, pUnder };
    });
  }
  function teamProfiles(d, ctx) {
    const ptsA = Number(d.ptsA) || 0, ptsB = Number(d.ptsB) || 0, el = Math.max(d.elapsed, 0.5);
    const profiles = {
      A: { live: { pts: ptsA, ppm: ptsA / el, share: ptsA / Math.max(ptsA + ptsB, 1) }, form: null, note: null },
      B: { live: { pts: ptsB, ppm: ptsB / el, share: ptsB / Math.max(ptsA + ptsB, 1) }, form: null, note: null }
    };
    if (ctx && ctx.teamA) { profiles.A.form = ctx.teamA.form || null; profiles.A.ppg = ctx.teamA.ppg; profiles.A.papg = ctx.teamA.papg; profiles.A.note = ctx.teamA.note; }
    if (ctx && ctx.teamB) { profiles.B.form = ctx.teamB.form || null; profiles.B.ppg = ctx.teamB.ppg; profiles.B.papg = ctx.teamB.papg; profiles.B.note = ctx.teamB.note; }
    const notes = [];
    if (profiles.A.ppg && el >= 8) { const expA = profiles.A.ppg * (el / 40); notes.push(`A lleva ${ptsA} pts vs ~${expA.toFixed(0)} esperados (${(ptsA - expA) >= 0 ? '+' : ''}${(ptsA - expA).toFixed(0)})`); }
    if (profiles.B.ppg && el >= 8) { const expB = profiles.B.ppg * (el / 40); notes.push(`B lleva ${ptsB} pts vs ~${expB.toFixed(0)} esperados (${(ptsB - expB) >= 0 ? '+' : ''}${(ptsB - expB).toFixed(0)})`); }
    return { profiles, notes };
  }
  function analyze(d, inp, prev) {
    inp = inp || {};
    const G = (d.periodLength || 10) * 4;
    const el = Math.max(0, Number(d.elapsed) || 0);
    const ptsA = Number(d.ptsA) || 0, ptsB = Number(d.ptsB) || 0, pts = ptsA + ptsB;
    const rem = Math.max(G - el, 0), diff = ptsA - ptsB;
    const out = { G, rem, el, pts, diff, ptsA, ptsB, cands: [], lines: [], blockers: [], report: [], action: 'HOLD', actionReason: '', riskLevel: 'medio', version: '2.7' };
    const m = out.m = project({ pts, elapsed: el, G, line: inp.line, pre: inp.pre });
    const mom = out.momentum = momentum({ elapsed: el, rem, diff, G }, m);
    const sc = out.scenarios = scenarios(m, pts, inp.line);
    const teams = out.teams = teamProfiles({ ptsA, ptsB, elapsed: el }, inp.ctx);
    out.report.push({ title: '1. Estado del partido', bullets: [
      `Marcador ${ptsA}–${ptsB} (diff ${diff > 0 ? '+' : ''}${diff}) · ${el.toFixed(1)}' jugados · restan ${rem.toFixed(1)}'`,
      `Ritmo observado ${m.obs.toFixed(2)} pts/min · proyectado ${m.rate.toFixed(2)} · peso datos reales ${(m.w * 100).toFixed(0)}%`,
      `Proyección total ${m.proj.toFixed(1)} ± ${m.sd.toFixed(1)} (68%: ${(m.proj - m.sd).toFixed(0)}–${(m.proj + m.sd).toFixed(0)})`,
      `Fase: ${el / G < 0.35 ? 'inicio' : el / G < 0.7 ? 'desarrollo' : 'cierre'} · clima: ${mom.mood}`
    ]});
    const teamBullets = [
      `A (${d.teamA || 'Local'}): ${ptsA} pts · ${teams.profiles.A.live.ppm.toFixed(2)} pts/min · ${(teams.profiles.A.live.share * 100).toFixed(0)}% del score`,
      `B (${d.teamB || 'Visitante'}): ${ptsB} pts · ${teams.profiles.B.live.ppm.toFixed(2)} pts/min · ${(teams.profiles.B.live.share * 100).toFixed(0)}% del score`
    ];
    if (teams.profiles.A.form) teamBullets.push(`Forma A: ${teams.profiles.A.form}${teams.profiles.A.ppg ? ` · PPG ${teams.profiles.A.ppg}` : ''}${teams.profiles.A.note ? ` · ${teams.profiles.A.note}` : ''}`);
    if (teams.profiles.B.form) teamBullets.push(`Forma B: ${teams.profiles.B.form}${teams.profiles.B.ppg ? ` · PPG ${teams.profiles.B.ppg}` : ''}${teams.profiles.B.note ? ` · ${teams.profiles.B.note}` : ''}`);
    teamBullets.push(...teams.notes);
    out.report.push({ title: '2. Análisis por equipo', bullets: teamBullets });
    out.report.push({ title: '3. Momentum, presión y clima del partido', bullets: [
      `Clima: ${mom.mood}`,
      `Presión de reloj: ${(mom.clockPressure * 100).toFixed(0)}% · fatiga por ritmo: ${(mom.fatigueRisk * 100).toFixed(0)}%`,
      ...mom.notes
    ]});
    out.report.push({ title: '4. Escenarios de ritmo (sin asumir cuotas)', bullets: sc.map(s => {
      let t = `${s.name}: total ~${s.proj.toFixed(0)} @ ${s.rate.toFixed(2)} pts/min`;
      if (s.pOver != null) t += ` · P(Over) ${(s.pOver * 100).toFixed(0)}% · P(Under) ${(s.pUnder * 100).toFixed(0)}%`;
      return t;
    })});
    const pWinAPure = winA({ rem, diff, G }, null);
    out.pWinA = pWinAPure; out.pWinB = 1 - pWinAPure;
    const pureBullets = [
      `P(gana A) sin mercado ≈ ${(pWinAPure * 100).toFixed(1)}% · P(gana B) ≈ ${((1 - pWinAPure) * 100).toFixed(1)}%`,
      `Proyección final A–B ≈ ${(ptsA + (rem / G) * (m.proj - pts) * (diff >= 0 ? 0.55 : 0.45)).toFixed(0)} – ${(ptsB + (rem / G) * (m.proj - pts) * (diff < 0 ? 0.55 : 0.45)).toFixed(0)}`
    ];
    if (inp.line) {
      const t = totals(m, inp.line);
      pureBullets.push(`Línea ${inp.line} (solo modelo): P(Over) ${(t.over * 100).toFixed(1)}% · P(Under) ${(t.under * 100).toFixed(1)}%`);
      out.pOverPure = t.over; out.pUnderPure = t.under;
    }
    out.report.push({ title: '5. Probabilidades del modelo (sin mezclar cuotas)', bullets: pureBullets });
    out.lines.push(`Proyección total: ${m.proj.toFixed(1)} ± ${m.sd.toFixed(1)} · ritmo real ${(m.w * 100).toFixed(0)}%`);
    out.lines.push(`Ritmo actual: ${m.obs.toFixed(2)} pts/min · restan ${rem.toFixed(1)} min`);
    out.lines.push(`P(gana A) ≈ ${(pWinAPure * 100).toFixed(0)}% · P(gana B) ≈ ${((1 - pWinAPure) * 100).toFixed(0)}%`);
    if (inp.line) {
      const t = totals(m, inp.line);
      out.lines.push(`Línea ${inp.line}: P(Over) ${(t.over * 100).toFixed(1)}% · P(Under) ${(t.under * 100).toFixed(1)}%`);
      [['Over', inp.over, t.over, inp.under], ['Under', inp.under, t.under, inp.over]].forEach(([n, o, p, oth]) => {
        if (!(o > 1.01)) return;
        const mk = oth > 1.01 ? noVig(o, oth) : .96 / o;
        let pa = .60 * p + .40 * mk;
        if (n === 'Under' && mom.fatigueRisk >= 0.45) pa = clamp(pa + 0.03, 0.01, 0.99);
        if (n === 'Over' && mom.fatigueRisk >= 0.45) pa = clamp(pa - 0.03, 0.01, 0.99);
        out.cands.push({ name: `${n} ${inp.line}`, odds: o, p: pa, pp: t.push, pm: mk, ev: evOf(pa, t.push, o), side: n });
      });
    }
    if (inp.oA > 1.01 && inp.oB > 1.01) {
      const mkA = noVig(inp.oA, inp.oB);
      let pA = .55 * pWinAPure + .45 * mkA;
      if (mom.closeLate) pA = .5 * pWinAPure + .5 * mkA;
      out.cands.push({ name: 'Gana A', odds: inp.oA, p: pA, pp: 0, pm: mkA, ev: evOf(pA, 0, inp.oA), side: 'A' });
      out.cands.push({ name: 'Gana B', odds: inp.oB, p: 1 - pA, pp: 0, pm: 1 - mkA, ev: evOf(1 - pA, 0, inp.oB), side: 'B' });
    }
    const minEl = 8, minEV = 0.05, minEdge = 0.035, minOdds = 1.25;
    if (el < minEl) out.blockers.push(`pocos minutos (<${minEl}')`);
    out.cands.forEach(c => {
      c.edge = c.p - c.pm;
      if (c.odds < minOdds) c.blocked = 'cuota corta';
      if (c.ev < minEV) c.blocked = (c.blocked ? c.blocked + ' · ' : '') + 'EV bajo';
      if (c.edge < minEdge) c.blocked = (c.blocked ? c.blocked + ' · ' : '') + 'edge bajo';
    });
    const viable = out.cands.filter(c => !c.blocked).sort((a, b) => b.ev - a.ev);
    const best = out.best = viable[0] || null;
    const kf = inp.kf != null ? inp.kf : 0.25, maxStake = inp.maxStakePct != null ? inp.maxStakePct : 0.025;
    if (best) {
      const b = best.odds - 1;
      const kelly = best.p - (1 - best.p) / b;
      out.stakePct = clamp(kelly * kf, 0, maxStake);
      out.kellyFull = kelly;
    } else out.stakePct = 0;
    if (!out.cands.length) { out.action = 'HOLD'; out.actionReason = 'sin cuotas · solo pronóstico puro'; out.riskLevel = el < 8 ? 'alto' : 'medio'; }
    else if (!best) { out.action = 'NO_ENTER'; out.actionReason = out.blockers.length ? `filtros: ${out.blockers.join(', ')}` : 'ningún mercado supera EV/edge mínimo'; out.riskLevel = 'bajo'; }
    else if (best.ev >= 0.07) { out.action = 'ENTER'; out.actionReason = `edge claro · EV ${(best.ev * 100).toFixed(1)}% · ${best.name}`; out.riskLevel = best.odds < 1.4 ? 'medio' : 'bajo'; }
    else { out.action = 'HOLD'; out.actionReason = `edge marginal · EV ${(best.ev * 100).toFixed(1)}%`; out.riskLevel = 'medio'; }
    if (prev && prev.best && prev.action === 'ENTER') {
      const edgeGone = !best || best.ev < 0.02;
      const leadAgainst = (prev.best.side === 'A' && diff < -6) || (prev.best.side === 'B' && diff > 6) ||
        (prev.best.side === 'Over' && m.proj < (inp.line || 0) - 5) || (prev.best.side === 'Under' && m.proj > (inp.line || 0) + 5);
      if (edgeGone || leadAgainst) { out.action = 'CASH_OUT'; out.actionReason = edgeGone ? 'edge desapareció · asegurar' : 'marcador en contra · cash-out'; out.riskLevel = 'alto'; }
    }
    const tr = trend();
    if (tr.ok && tr.alert) {
      out.pace = tr; out.lines.push('⚡ ' + tr.msg);
      if (tr.dir === 'acelera' && best && best.side === 'Under' && out.action === 'ENTER') { out.action = 'HOLD'; out.actionReason = 'ritmo en contra del Under'; }
      if (tr.dir === 'frena' && best && best.side === 'Over' && out.action === 'ENTER') { out.action = 'HOLD'; out.actionReason = 'ritmo en contra del Over'; }
    }
    const mktBullets = out.cands.length ? out.cands.map(c => `${c.name} @ ${c.odds.toFixed(2)} · P ${(c.p * 100).toFixed(1)}% · mkt ${(c.pm * 100).toFixed(1)}% · EV ${(c.ev * 100).toFixed(1)}%${c.blocked ? ' · BLOQUEADO' : ''}`) : ['Sin cuotas: válido el pronóstico puro (1–5).'];
    if (best) mktBullets.push(`Mejor: ${best.name} · stake máx ${(out.stakePct * 100).toFixed(2)}% bankroll`);
    out.report.push({ title: '6. Valor con cuotas (si hay)', bullets: mktBullets });
    out.report.push({ title: '7. Decisión operativa', bullets: [
      `Acción: ${out.action} · ${out.actionReason}`,
      `Riesgo: ${out.riskLevel}`,
      out.blockers.length ? `Filtros: ${out.blockers.join(' · ')}` : 'Sin filtros bloqueantes',
      el < 8 ? 'Muestra chica: priorizar HOLD.' : 'Muestra razonable.',
      'Capital: máx 2.5% bankroll / ¼ Kelly por posición.'
    ]});
    out.hasOdds = out.cands.length > 0; out.projFinal = m.proj; out.rate = m.rate;
    return out;
  }
  const api = { Phi, PhiInv, project, totals, winA, noVig, evOf, momentum, scenarios, teamProfiles, record, trend, analyze, _reset: () => { hist.length = 0; } };
  root.BLM = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
