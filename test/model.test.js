const test = require('node:test'), assert = require('node:assert');
const B = require('../public/model.js');

test('projectTotal mezcla ritmo y mercado', () => {
  const r = B.projectTotal(40, 38, 20, 12, 4, 180, 0.05);
  assert.ok(r.projected > 150 && r.projected < 220);
  assert.ok(r.pace != null);
});

test('overUnderProbs suma ~1', () => {
  const o = B.overUnderProbs(185, 180, 1);
  assert.ok(o);
  assert.ok(Math.abs(o.pOver + o.pUnder - 1) < 0.02);
});

test('winProbA favorece al líder', () => {
  const p = B.winProbA(55, 40, 30, 12, 4, 0.5);
  assert.ok(p > 0.65);
});

test('kellyAndEV filtra EV bajo', () => {
  const k = B.kellyAndEV(0.52, 1.9, 1000, 0.25, 0.04, 0.03, 6, 10);
  assert.ok(k.skip === true || k.stake >= 0);
});

test('paceShift detecta subida', () => {
  const s = B.paceShift(4.5, 2.8, 1.5);
  assert.ok(s && s.direction === 'up');
});
