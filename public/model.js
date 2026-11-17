/* Modelo probabilístico de Basket Live Elite (sin dependencias). Navegador: window.BLM · Node: require() para tests. */
(function (root) {
  const Phi = x => { const t = 1 / (1 + .2316419 * Math.abs(x)), d = .3989423 * Math.exp(-x * x / 2);
    const p = d * t * (.3193815 + t * (-.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - p : p; };
  const PhiInv = p => { p = Math.min(Math.max(p, 1e-6), 1 - 1e-6); const q = p < .5 ? p : 1 - p, t = Math.sqrt(-2 * Math.log(q));
    const x = t - (2.515517 + .802853 * t + .010328 * t * t) / (1 + 1.432788 * t + .189269 * t * t + .001308 * t * t * t); return p < .5 ? -x : x; };
  const SG = 2.3, SGM = 1.7; // desviación por raíz de minuto (total y margen)
  const evOf = (p, pp, o) => p * (o - 1) - (1 - p - pp);
  const noVig = (a, b) => { const i = 1 / a, j = 1 / b; return i / (i + j); };

  // Proyección del total: mezcla bayesiana entre ritmo observado y prior (línea pre-partido o línea en vivo)
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
  // Prob. de que gane A: marcador actual + margen esperado restante según la fuerza PRE-partido (pre = prob. sin margen)
  function winA(d, pre) {
    if (d.rem <= 0) return d.diff > 0 ? 1 : d.diff < 0 ? 0 : .5;
    const sd = Math.max(SGM * Math.sqrt(d.rem), 1), mu0 = pre == null ? 0 : SGM * Math.sqrt(d.G) * PhiInv(pre);
    return Phi((d.diff + d.rem / d.G * mu0) / sd);
  }

  // Cambios de ritmo: puntos/min de los últimos >=3' vs. el ritmo anterior (z-score con desviación por raíz de minuto)
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
    return { ok: true, recent, before, z, chg, alert, key: alert ? dir + Math.floor(cur.el / 4) : null,
      msg: `el ritmo ${dir}: ${recent.toFixed(2)} pts/min en los últimos ${dm.toFixed(0)}' vs ${before.toFixed(2)} antes (${chg > 0 ? '+' : ''}${chg.toFixed(0)}%, z=${z.toFixed(1)})` };
  }

  // Análisis completo. d: {ptsA, ptsB, elapsed, periodLength} · inp: {line, pre, over, under, oA, oB, pA, pB, kf}
  function analyze(d, inp) {
    const G = (d.periodLength || 10) * 4, el = d.elapsed, pts = d.ptsA + d.ptsB, rem = Math.max(G - el, 0), diff = d.ptsA - d.ptsB;
    const out = { G, rem, cands: [], lines: [], blockers: [] };
    const m = out.m = project({ pts, elapsed: el, G, line: inp.line, pre: inp.pre });
    out.lines.push(`Proyección total: ${m.proj.toFixed(1)} ± ${m.sd.toFixed(1)} (rango 68%: ${(m.proj - m.sd).toFixed(0)}–${(m.proj + m.sd).toFixed(0)}) · peso del ritmo real ${(m.w * 100).toFixed(0)}%`);
    if (inp.line) {
      const t = totals(m, inp.line);
      out.lines.push(`Línea ${inp.line}: P(Over) ${(t.over * 100).toFixed(1)}% · P(Under) ${(t.under * 100).toFixed(1)}%${t.push > .005 ? ` · push ${(t.push * 100).toFixed(1)}%` : ''}`);
      [['Over', inp.over, t.over, inp.under], ['Under', inp.under, t.under, inp.over]].forEach(([n, o, p, oth]) => {
        if (!(o > 1.01)) return;
        const mk = oth > 1.01 ? noVig(o, oth) : .96 / o, pa = .65 * p + .35 * mk; // 35% de confianza en el mercado
        out.cands.push({ name: `${n} ${inp.line}`, odds: o, p: pa, pp: t.push, pm: mk, ev: evOf(pa, t.push, o) });
      });
    }
    if (inp.oA > 1.01 && inp.oB > 1.01) {
      const mk = noVig(inp.oA, inp.oB), pre = inp.pA > 1.01 && inp.pB > 1.01 ? noVig(inp.pA, inp.pB) : null;
      out.lines.push(`Ganador: mercado sin margen A ${(mk * 100).toFixed(1)}% · B ${((1 - mk) * 100).toFixed(1)}%`);
      if (pre == null) out.lines.push('Sin cuotas PRE-partido no se evalúa valor en ganador (evita ventajas falsas).');
      else {
        const p = winA({ diff, rem, G }, pre);
        out.lines.push(`Modelo (marcador + fuerza previa): A ${(p * 100).toFixed(1)}% · B ${((1 - p) * 100).toFixed(1)}%`);
        [['A', inp.oA, p, mk], ['B', inp.oB, 1 - p, 1 - mk]].forEach(([n, o, pm0, mm]) => {
          const pa = .65 * pm0 + .35 * mm; out.cands.push({ name: `Gana ${n}`, odds: o, p: pa, pp: 0, pm: mm, ev: evOf(pa, 0, o) });
        });
      }
    }
    out.cands.sort((a, b) => b.ev - a.ev);
    const b = out.cands[0];
    if (el < 6) out.blockers.push('menos de 6 min jugados: el ritmo aún es ruido');
    if (rem < 1) out.blockers.push('queda menos de 1 minuto');
    if (b && b.ev < .04) out.blockers.push(`EV ${(b.ev * 100).toFixed(1)}% < 4% mínimo`);
    if (b && b.p - b.pm < .03) out.blockers.push('ventaja menor a 3 pp sobre el mercado');
    out.hasOdds = out.cands.length > 0;
    out.best = b && !out.blockers.length ? b : null;
    if (out.best) out.stakePct = Math.min(.04, Math.max(0, b.ev / (b.odds - 1) * (inp.kf || .25)));
    return out;
  }
  const api = { Phi, PhiInv, project, totals, winA, noVig, evOf, record, trend, analyze, _reset: () => { hist.length = 0; } };
  root.BLM = api; if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
