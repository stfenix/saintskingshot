// Unit tests for the KingShot Transfer Pass Estimator engine.
// Run: node tests/transfer-estimator.test.js
// Covers the 10 acceptance criteria from the build specification.

const assert = require('assert');
const {
  TRANSFER_SAMPLES, TRANSFER_DISCLAIMER,
  parsePowerInput, computePassShortfall,
  computeTransferEstimate, computeTransferEligibility,
} = require('../transfer-engine.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n    ${e.message}`); }
}

console.log('Acceptance criteria');

// 1. Benchmark A September data → observed game result was 8, historic
//    first estimate 8–10, no claim a general-purpose model was proved.
test('AC1: Benchmark A preserved; dev-based estimate is a tight range containing 8', () => {
  const sw = TRANSFER_SAMPLES.find(s => s.id === 'benchmark-a-2026-09');
  assert.strictEqual(sw.actual_passes, 8);
  assert.deepStrictEqual(sw.estimated_passes_at_time, [8, 10]);
  assert.strictEqual(sw.transfer_score, null, 'estimated score must never be stored as an observed score');
  const est = computeTransferEstimate({
    govGear: sw.governor_gear_power, heroPower: sw.hero_power,
    petPower: sw.pet_power, masterPower: sw.master_power,
  });
  assert.strictEqual(est.tier, 'C');
  assert.ok(est.range[0] <= 8 && 8 <= est.range[1], `range ${est.range} must contain the observed 8`);
  assert.ok(['Low', 'Very low'].includes(est.confidence), 'two samples can never justify high confidence');
  assert.ok(est.best >= est.range[0] && est.best <= est.range[1], 'central guess must sit inside the range');
  // Tightness: a profile matching a confirmed benchmark must not get a sprawling range.
  assert.ok(est.range[1] - est.range[0] <= 3, `near-benchmark range ${est.range} should be tight (width ≤ 3)`);
});

// 2. Comparison example → 10 observed passes and 329,379 observed score as a distinct sample.
test('AC2: Benchmark B is a distinct observed record; its score reproduces ~10 passes', () => {
  const cmp = TRANSFER_SAMPLES.find(s => s.id === 'benchmark-b-2026-09');
  assert.strictEqual(cmp.actual_passes, 10);
  assert.strictEqual(cmp.transfer_score, 329379);
  const est = computeTransferEstimate({ transferScore: 329379, groupRating: 1 });
  assert.strictEqual(est.tier, 'B');
  assert.ok(est.range[0] <= 10 && 10 <= est.range[1], `range ${est.range} must contain the observed 10`);
});

// 3. Increasing troop power only must NOT change the pass-cost model.
test('AC3: troop power does not move the pass estimate', () => {
  const base = { govGear: 12e6, heroPower: 21e6, petPower: 6.7e6, masterPower: 5.4e6, totalPower: 95e6, troopPower: 40e6 };
  const a = computeTransferEstimate(base);
  const b = computeTransferEstimate({ ...base, troopPower: 80e6, totalPower: 135e6 });
  assert.deepStrictEqual(a.range, b.range);
  assert.strictEqual(a.confidence, b.confidence);
});

// 4. Changing target Power Cap must not change the pass estimate, but must flip eligibility.
test('AC4: power cap affects eligibility only, never the estimate', () => {
  const dev = { govGear: 12e6, heroPower: 21e6, petPower: 6.7e6, masterPower: 5.4e6 };
  const a = computeTransferEstimate({ ...dev, targetCap: 50e6 });
  const b = computeTransferEstimate({ ...dev, targetCap: 500e6 });
  assert.deepStrictEqual(a.range, b.range);
  const below = computeTransferEligibility({ totalPower: 95e6, targetCap: 100e6 }).find(r => r.id === 'cap');
  const above = computeTransferEligibility({ totalPower: 95e6, targetCap: 90e6 }).find(r => r.id === 'cap');
  assert.strictEqual(below.status, 'pass');
  assert.strictEqual(above.status, 'fail');
});

// 5. Missing group rating / development data lowers confidence, never silently filled.
test('AC5: missing inputs widen ranges and lower confidence instead of being invented', () => {
  const withRating = computeTransferEstimate({ transferScore: 329379, groupRating: 1 });
  const without = computeTransferEstimate({ transferScore: 329379 });
  assert.ok(without.range[1] - without.range[0] > withRating.range[1] - withRating.range[0],
    'missing group rating must widen the range');
  assert.ok(without.missing.length > 0, 'missing group rating must be reported');
  const partial = computeTransferEstimate({ govGear: 12e6, heroPower: 21e6 });
  assert.strictEqual(partial.confidence, 'Very low');
  assert.ok(partial.missing.some(m => m.includes('Pet Power')));
});

// 6. Output never falls outside 1–50 passes.
test('AC6: estimates clamp to the 1–50 pass bounds', () => {
  const huge = computeTransferEstimate({ transferScore: 329379 * 100 });
  assert.ok(huge.range[0] >= 1 && huge.range[1] <= 50, `got ${huge.range}`);
  const tiny = computeTransferEstimate({ transferScore: 300 });
  assert.ok(tiny.range[0] >= 1 && tiny.range[1] <= 50, `got ${tiny.range}`);
  const bigDev = computeTransferEstimate({ govGear: 12e9, heroPower: 21e9, petPower: 6.7e9, masterPower: 5.4e9 });
  assert.ok(bigDev.range[0] >= 1 && bigDev.range[1] <= 50, `got ${bigDev.range}`);
});

// 7. Pass shortage reflects both lower and upper ends of the estimate.
test('AC7: shortfall computed for both range ends', () => {
  const s = computePassShortfall({ range: [8, 10] }, 3);
  assert.deepStrictEqual(s, { lo: 5, hi: 7 });
  const covered = computePassShortfall({ range: [8, 10] }, 12);
  assert.deepStrictEqual(covered, { lo: 0, hi: 0 });
  const obs = computePassShortfall({ observed: 8 }, 3);
  assert.deepStrictEqual(obs, { lo: 5, hi: 5 });
});

// 8. All unknown eligibility conditions appear as Unknown, not Pass.
test('AC8: empty eligibility input yields all Unknown, never a free Pass', () => {
  const rows = computeTransferEligibility({});
  assert.ok(rows.length >= 9, 'all nine checklist items must be present');
  rows.forEach(r => assert.strictEqual(r.status, 'unknown', `${r.id} must be unknown, got ${r.status}`));
});

// 9. In-game entered quote is shown as observed, separate from model output.
test('AC9: an observed quote is returned as observed, not replaced by a model range', () => {
  const est = computeTransferEstimate({ observedQuote: 8, transferScore: 329379, govGear: 12e6 });
  assert.strictEqual(est.tier, 'A');
  assert.strictEqual(est.observed, 8);
  assert.strictEqual(est.confidence, 'Observed');
  assert.ok(!est.range, 'no model range may shadow an observed quote');
});

// 10. The page always clearly says this is an estimate, not an official calculation.
test('AC10: every result carries the estimate disclaimer', () => {
  for (const d of [
    {}, { observedQuote: 8 }, { transferScore: 329379 },
    { govGear: 12e6, heroPower: 21e6, petPower: 6.7e6, masterPower: 5.4e6 },
  ]) {
    const est = computeTransferEstimate(d);
    assert.strictEqual(est.disclaimer, TRANSFER_DISCLAIMER);
  }
  assert.ok(/estimate/i.test(TRANSFER_DISCLAIMER));
});

console.log('\nInput parsing');

test('parsePowerInput accepts all documented formats', () => {
  assert.strictEqual(parsePowerInput('95,600,000'), 95600000);
  assert.strictEqual(parsePowerInput('95.6m'), 95600000);
  assert.strictEqual(parsePowerInput('95,6M'), 95600000);   // locale decimal comma
  assert.strictEqual(parsePowerInput('95600000'), 95600000);
  assert.strictEqual(parsePowerInput('12.5k'), 12500);
  assert.strictEqual(parsePowerInput(''), null);
  assert.strictEqual(parsePowerInput('abc'), null);
  assert.strictEqual(parsePowerInput('-5'), null);           // no negatives
});

test('troop power above total power yields non-troop power of zero, not negative', () => {
  const est = computeTransferEstimate({ totalPower: 40e6, troopPower: 95e6 });
  assert.strictEqual(est.nonTroopPower, 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
