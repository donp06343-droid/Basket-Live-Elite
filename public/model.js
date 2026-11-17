/* Modelo probabilístico de Basket Live Elite (sin dependencias). Navegador: window.BLM · Node: module.exports */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BLM = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function invNorm(p) {
    // Aproximación de la inversa de la CDF normal estándar (Acklam)
    if (p <= 0 || p >= 1) return p <= 0 ? -Infinity : Infinity;
    const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577459334453e2, -3.066479806614716e1, 2.506628277459239];
    const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
    const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
    const plow = 0.02425, phigh = 1 - plow;
    let q, r;
    if (p < plow) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    }
    if (p > phigh) {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    }
    q = p - 0.5; r = q * q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5]) * q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  }
  function normCdf(z) {
    // Aproximación de la CDF normal estándar
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp(-z * z / 2);
    let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return z > 0 ? 1 - p : p;
  }

  /** Proyección del total con mezcla bayesiana (ritmo real vs línea de mercado). */
  function projectTotal(ptsA, ptsB, minutesPlayed, periodMinutes, totalPeriods, marketTotal, marketMargin) {
    const totalPts = (Number(ptsA) || 0) + (Number(ptsB) || 0);
    const mp = Math.max(0, Number(minutesPlayed) || 0);
    const per = Math.max(1, Number(periodMinutes) || 12);
    const periods = Math.max(1, Number(totalPeriods) || 4);
    const gameMinutes = per * periods;
    const remaining = Math.max(0, gameMinutes - mp);
    const pace = mp > 0.5 ? totalPts / mp : null;
    const market = Number(marketTotal);
    const hasMarket = Number.isFinite(market) && market > 0;

    let projected;
    if (pace != null && hasMarket) {
      // Peso del ritmo real crece con minutos jugados (bayesiano simple)
      const w = clamp(mp / (gameMinutes * 0.55), 0.15, 0.92);
      const fromPace = pace * gameMinutes;
      projected = w * fromPace + (1 - w) * market;
    } else if (pace != null) {
      projected = pace * gameMinutes;
    } else if (hasMarket) {
      projected = market;
    } else {
      projected = totalPts + (remaining > 0 ? (totalPts / Math.max(mp, 1)) * remaining : 0);
    }
    return {
      projected: Math.round(projected * 10) / 10,
      pace: pace != null ? Math.round(pace * 100) / 100 : null,
      remainingMinutes: Math.round(remaining * 10) / 10,
      weightReal: pace != null && hasMarket ? clamp(mp / (gameMinutes * 0.55), 0.15, 0.92) : null
    };
  }

  /** P(Over) / P(Under) asumiendo normal alrededor de la proyección. */
  function overUnderProbs(projected, marketLine, sigmaFactor) {
    const line = Number(marketLine);
    if (!Number.isFinite(line) || !Number.isFinite(projected)) return null;
    const sigma = Math.max(8, (Number(sigmaFactor) || 1) * Math.sqrt(Math.max(projected, 1) * 0.35));
    const z = (line - projected) / sigma;
    const pUnder = normCdf(z);
    const pPush = 0; // simplificado: no modelamos push explícito aquí
    const pOver = 1 - pUnder - pPush;
    return {
      pOver: clamp(pOver, 0.02, 0.98),
      pUnder: clamp(pUnder, 0.02, 0.98),
      sigma: Math.round(sigma * 10) / 10
    };
  }

  /** Probabilidad de que gane el equipo A (heurística por marcador + tiempo + fuerza previa). */
  function winProbA(ptsA, ptsB, minutesPlayed, periodMinutes, totalPeriods, preStrengthA) {
    const a = Number(ptsA) || 0;
    const b = Number(ptsB) || 0;
    const mp = Math.max(0, Number(minutesPlayed) || 0);
    const per = Math.max(1, Number(periodMinutes) || 12);
    const periods = Math.max(1, Number(totalPeriods) || 4);
    const gameMinutes = per * periods;
    const remaining = Math.max(0.1, gameMinutes - mp);
    const lead = a - b;
    const pre = clamp(Number(preStrengthA) || 0.5, 0.2, 0.8);

    // Modelo simple: ventaja actual + fuerza previa + ruido residual
    const leadEffect = lead / Math.sqrt(remaining + 2);
    const progress = mp / gameMinutes;
    const raw = 0.5 + 0.28 * Math.tanh(leadEffect * 0.55) + 0.22 * (pre - 0.5) * (1 - progress * 0.7);
    return clamp(raw, 0.05, 0.95);
  }

  /** EV y Kelly fraccionado con mezcla modelo/mercado y filtros de calidad. */
  function kellyAndEV(modelProb, marketOdds, bankroll, fraction, minEV, minEdge, minMinutes, minutesPlayed) {
    const pModel = clamp(Number(modelProb) || 0, 0.01, 0.99);
    const odds = Number(marketOdds);
    if (!Number.isFinite(odds) || odds <= 1.01) return null;
    const mp = Number(minutesPlayed) || 0;
    if (mp < (Number(minMinutes) || 6)) return { skip: true, reason: "minutos insuficientes" };

    // Quitar margen aproximado de la casa (asume overround ~4–6 %)
    const implied = 1 / odds;
    const fairImplied = implied * 0.97; // ajuste simple
    const pMkt = clamp(fairImplied, 0.05, 0.95);
    const p = 0.65 * pModel + 0.35 * pMkt;

    const edge = p - implied;
    const ev = p * (odds - 1) - (1 - p);
    if (ev < (Number(minEV) || 0.04) || edge < (Number(minEdge) || 0.03)) {
      return { skip: true, reason: "EV o edge bajo", ev, edge, p, pModel, pMkt };
    }

    const b = odds - 1;
    const q = 1 - p;
    const kellyFull = (b * p - q) / b;
    const frac = clamp(Number(fraction) || 0.25, 0.05, 1);
    let stakePct = Math.max(0, kellyFull * frac);
    stakePct = Math.min(stakePct, 0.04); // tope 4 % bankroll
    const br = Math.max(0, Number(bankroll) || 0);
    const stake = Math.round(br * stakePct * 100) / 100;

    return {
      skip: false,
      p, pModel, pMkt,
      edge: Math.round(edge * 1000) / 1000,
      ev: Math.round(ev * 1000) / 1000,
      kellyFull: Math.round(kellyFull * 1000) / 1000,
      stakePct: Math.round(stakePct * 10000) / 10000,
      stake
    };
  }

  /** Detecta cambios de ritmo (últimos N minutos vs anterior). */
  function paceShift(recentPtsPerMin, previousPtsPerMin, thresholdZ) {
    const r = Number(recentPtsPerMin);
    const p = Number(previousPtsPerMin);
    if (!Number.isFinite(r) || !Number.isFinite(p) || p <= 0) return null;
    const z = (r - p) / Math.max(0.4, Math.sqrt(p) * 0.6);
    const th = Number(thresholdZ) || 1.6;
    if (Math.abs(z) < th) return null;
    return { z: Math.round(z * 100) / 100, direction: z > 0 ? "up" : "down", recent: r, previous: p };
  }

  return {
    projectTotal,
    overUnderProbs,
    winProbA,
    kellyAndEV,
    paceShift,
    normCdf,
    clamp
  };
});
