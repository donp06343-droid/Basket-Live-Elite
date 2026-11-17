const test = require('node:test'), assert = require('node:assert');
const B = require('../public/model.js');
test('Phi y PhiInv son consistentes', () => { assert.ok(Math.abs(B.Phi(0) - .5) < 1e-6); assert.ok(Math.abs(B.PhiInv(B.Phi(1)) - 1) < 1e-2); });
test('al inicio la proyección coincide con la línea', () => {
  const m = B.project({ pts: 0, elapsed: 0, G: 40, line: 155.5 }); assert.ok(Math.abs(m.proj - 155.5) < 1);
});
test('sin ventaja real el ganador no muestra EV positivo (cuotas con margen)', () => {
  const r = B.analyze({ ptsA: 0, ptsB: 0, elapsed: 0, periodLength: 10 }, { oA: 1.9, oB: 1.9, pA: 1.9, pB: 1.9, kf: .25 });
  r.cands.forEach(c => assert.ok(c.ev < 0)); assert.equal(r.best, null);
});
test('menos de 6 minutos bloquea la entrada', () => {
  const r = B.analyze({ ptsA: 10, ptsB: 8, elapsed: 4, periodLength: 10 }, { line: 140.5, over: 1.9, under: 1.9, kf: .25 });
  assert.ok(r.blockers.some(b => b.includes('6 min')));
});
test('detecta aceleración de ritmo', () => {
  B._reset(); let pts = 0; let t = { ok: false };
  for (let el = 1; el <= 14; el++) { pts += el <= 8 ? 3 : 7; t = B.record(el, pts); }
  assert.ok(t.ok && t.alert && t.z > 1.5);
});
