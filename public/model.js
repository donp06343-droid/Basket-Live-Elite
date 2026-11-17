/* Modelo probabilístico Basket Live Elite v2.2 — conservador, cash-out y ritmo.
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

  function project(s) {
    const G = s.G, rem = Math.max(G - s.elapsed, 0), obs = s.pts / Math.max(s.elapsed, .5);
    const prior = s.pre ? s.pre / G : s.line ? Math.max(s.line - s.pts, 0) / Math.max(rem, .5) : obs;
    const w = s.elapsed / (s.elapsed + G * .3), rate = w * obs + (1 - w) * prior, remPts = rem * rate;
    return {
      G, rem, obs, prior, w, rate,
      proj: s.pts + remPts,
      sd: Math.max(Math.sqrt(SG * SG * rem + Math.pow(.05 * remPts, 2)), 1)
    };
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
    return {
      ok: true, recent, before, z, chg, alert,
      key: alert ? dir + Math.floor(cur.el / 4) : null,
      msg: `el ritmo ${dir}: ${recent.toFixed(2)} pts/min en los últimos ${dm.toFixed(0)}' vs ${before.toFixed(2)} antes (${chg > 0 ? '+' : ''}${chg.toFixed(0)}%, z=${z.toFixed(1)})`
    };
  }

  function analyze(d, inp, prev) {
    inp = inp || {};
    const G = (d.periodLength || 10) * 4;
    const el = Math.max(0, Number(d.elapsed) || 0);
    const pts = (Number(d.ptsA) || 0) + (Number(d.ptsB) || 0);
    const rem = Math.max(G - el, 0);
    const diff = (Number(d.ptsA) || 0) - (Number(d.ptsB) || 0);
    const out = {
      G, rem, el, pts, diff,
      cands: [], lines: [], blockers: [],
      action: 'HOLD',
      actionReason: '',
      riskLevel: 'medio'
    };

    const m = out.m = project({ pts, elapsed: el, G, line: inp.line, pre: inp.pre });
    out.lines.push(
      `Proyección total: ${m.proj.toFixed(1)} ± ${m.sd.toFixed(1)} ` +
      `(68%: ${(m.proj - m.sd).toFixed(0)}–${(m.proj + m.sd).toFixed(0)}) · ` +
      `ritmo real ${(m.w * 100).toFixed(0)}%`
    );
    out.lines.push(`Ritmo actual: ${(pts / Math.max(el, 0.5)).toFixed(2)} pts/min · restan ${rem.toFixed(1)} min`);

    if (inp.line) {
      const t = totals(m, inp.line);
      out.lines.push(
        `Línea ${inp.line}: P(Over) ${(t.over * 100).toFixed(1)}% · P(Under) ${(t.under * 100).toFixed(1)}%` +
        (t.push > .005 ? ` · push ${(t.push * 100).toFixed(1)}%` : '')
      );
      [['Over', inp.over, t.over, inp.under], ['Under', inp.under, t.under, inp.over]].forEach(([n, o, p, oth]) => {
        if (!(o > 1.01)) return;
        const mk = oth > 1.01 ? noVig(o, oth) : .96 / o;
        const pa = .62 * p + .38 * mk;
        out.cands.push({ name: `${n} ${inp.line}`, odds: o, p: pa, pp: t.push, pm: mk, ev: evOf(pa, t.push, o), side: n });
      });
    }

    if (inp.oA > 1.01 && inp.oB > 1.01) {
      const mk = noVig(inp.oA, inp.oB);
      const pre = inp.pA > 1.01 && inp.pB > 1.01 ? noVig(inp.pA, inp.pB) : null;
      out.lines.push(`Ganador (mkt sin margen): A ${(mk * 100).toFixed(1)}% · B ${((1 - mk) * 100).toFixed(1)}%`);
      if (pre == null) {
        out.lines.push('Sin cuotas PRE no se evalúa valor en ganador (evita edges inventados).');
      } else {
        const p = winA({ diff, rem, G }, pre);
        out.lines.push(`Modelo (marcador + PRE): A ${(p * 100).toFixed(1)}% · B ${((1 - p) * 100).toFixed(1)}%`);
        [['A', inp.oA, p, mk], ['B', inp.oB, 1 - p, 1 - mk]].forEach(([n, o, pm0, mm]) => {
          const pa = .62 * pm0 + .38 * mm;
          out.cands.push({ name: `Gana ${n}`, odds: o, p: pa, pp: 0, pm: mm, ev: evOf(pa, 0, o), side: n });
        });
      }
    }

    out.cands.sort((a, b) => b.ev - a.ev);
    const best = out.cands[0] || null;
    out.best = null;

    if (el < 8) out.blockers.push('menos de 8 min jugados: ritmo todavía ruidoso');
    if (rem < 2) out.blockers.push('quedan menos de 2 minutos');
    if (best && best.ev < .05) out.blockers.push(`EV ${(best.ev * 100).toFixed(1)}% < 5% mínimo (conservador)`);
    if (best && best.p - best.pm < .035) out.blockers.push('ventaja < 3.5 pp sobre el mercado');
    if (best && best.odds < 1.25) out.blockers.push('cuota muy baja (<1.25): poco valor / mucho riesgo de margen');

    const absLead = Math.abs(diff);
    if (rem < 6 && absLead >= 12) out.riskLevel = 'alto';
    else if (rem < 10 && absLead >= 8) out.riskLevel = 'medio-alto';
    else if (el < 10) out.riskLevel = 'alto';
    else out.riskLevel = 'medio';

    if (out.blockers.length || !best) {
      out.action = 'NO_ENTER';
      out.actionReason = out.blockers.length ? out.blockers[0] : 'sin candidato con edge suficiente';
    } else {
      out.best = best;
      const maxPct = Math.min(0.025, Number(inp.maxStakePct) || 0.025);
      const kf = Math.min(0.25, Number(inp.kf) || 0.25);
      out.stakePct = Math.min(maxPct, Math.max(0, best.ev / (best.odds - 1) * kf));
      out.action = best.ev >= 0.07 ? 'ENTER' : 'HOLD';
      out.actionReason = best.ev >= 0.07
        ? `edge claro · EV ${(best.ev * 100).toFixed(1)}%`
        : `edge marginal · mejor esperar o reducir stake`;
    }

    if (prev && prev.best && prev.action === 'ENTER') {
      const stillBest = best && best.name === prev.best.name;
      const edgeGone = !best || best.ev < 0.02;
      const leadAgainst =
        (prev.best.side === 'A' && diff < -6) ||
        (prev.best.side === 'B' && diff > 6) ||
        (prev.best.side === 'Over' && m.proj < (inp.line || 0) - 5) ||
        (prev.best.side === 'Under' && m.proj > (inp.line || 0) + 5);

      if (edgeGone || leadAgainst) {
        out.action = 'CASH_OUT';
        out.actionReason = edgeGone
          ? 'el edge desapareció · conviene asegurar / salir'
          : 'el marcador se dio vuelta en contra · revisar cash-out';
        out.riskLevel = 'alto';
      } else if (stillBest && rem < 5 && best.ev < prev.best.ev - 0.03) {
        out.action = 'CASH_OUT';
        out.actionReason = 'queda poco tiempo y el valor bajó · proteger ganancias';
      }
    }

    const tr = trend();
    if (tr.ok && tr.alert) {
      out.pace = tr;
      out.lines.push('⚡ ' + tr.msg);
      if (tr.dir === 'acelera' && best && best.side === 'Under') {
        out.blockers.push('ritmo acelerando en contra del Under');
        if (out.action === 'ENTER') {
          out.action = 'HOLD';
          out.actionReason = 'ritmo en contra · no forzar entrada';
        }
      }
      if (tr.dir === 'frena' && best && best.side === 'Over') {
        out.blockers.push('ritmo frenando en contra del Over');
        if (out.action === 'ENTER') {
          out.action = 'HOLD';
          out.actionReason = 'ritmo en contra · no forzar entrada';
        }
      }
    }

    out.hasOdds = out.cands.length > 0;
    return out;
  }

  const api = {
    Phi, PhiInv, project, totals, winA, noVig, evOf,
    record, trend, analyze,
    _reset: () => { hist.length = 0; }
  };
  root.BLM = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
