// ============================================================
// KingShot Kingdom Transfer Pass Estimator — calculation engine
// Community estimator, NOT an official KingShot calculator.
// The game's formula is not publicly disclosed; the in-game
// Transfer screen is authoritative. Estimates here come from a
// small set of recorded real observations (see TRANSFER_SAMPLES).
// Pure functions only — no DOM access — so they can be unit-tested.
// ============================================================

const TRANSFER_MODEL_VERSION = '1.2 (last reviewed 2026-11-04)';
const TRANSFER_DISCLAIMER = 'Estimated only — confirm the number in the KingShot Transfer screen.';
// Ceiling-only safety pad on development-based (Tier C) estimates: a Nov 2026
// field test needed exactly the ceiling of the symmetric range, so the top of
// the range gets one extra pass for budgeting while the floor stays tight.
const TRANSFER_CEILING_MARGIN = 1;

// Calibration observations. Keep null for unknown fields — never assume zero.
// Never mix inferred scores and observed game scores in one column.
const TRANSFER_SAMPLES = [
  {
    id: 'benchmark-a-2026-09',
    observed_date: '2026-09-13',
    displayed_power: 95600000,
    troop_power: 40300000,
    governor_gear_power: 12527040,
    hero_power: 21791408,
    pet_power: 6793200,
    master_power: 5444760,
    charm_level_description: 'all level 3',
    truegold_level: 2,
    transfer_score: null,                      // never confirmed in game
    estimated_score_at_time: [300000, 350000], // previous working estimate, unverified
    estimated_passes_at_time: [8, 10],
    actual_passes: 8,
    source: 'historical user in-game report',
    notes: 'Confirmed pass quote; transfer score was only a previous estimate'
  },
  {
    id: 'benchmark-b-2026-09',
    observed_date: '2026-09',
    governor_gear_power: 13420000,
    hero_power: 21020000,
    pet_power: 6570000,
    master_power: 5840000,
    truegold_level: 3,
    transfer_score: 329379,                    // observed in game
    actual_passes: 10,
    source: 'comparison example recorded in discussion',
    notes: 'Incomplete breakdown and transfer group unknown'
  }
];

// Parse "95,600,000", "95.6m", "95,6M" (locale decimal comma), "95600000" → integer or null.
function parsePowerInput(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  const m = s.match(/^([\d.,\s]+)\s*([kmb])?$/);
  if (!m) return null;
  let num = m[1].replace(/\s/g, '');
  const mult = m[2] ? { k: 1e3, m: 1e6, b: 1e9 }[m[2]] : 1;
  if (num.includes(',') && !num.includes('.')) {
    const parts = num.split(',');
    // A single comma followed by 1–2 digits with a unit suffix reads as a locale decimal (95,6M).
    if (parts.length === 2 && parts[1].length <= 2 && mult > 1) num = parts.join('.');
    else num = parts.join('');
  } else {
    num = num.replace(/,/g, '');
  }
  if (!/^\d+(\.\d+)?$/.test(num)) return null;
  const v = parseFloat(num);
  if (isNaN(v) || v < 0) return null;
  return Math.round(v * mult);
}

function clampPasses(n) { return Math.max(1, Math.min(50, Math.round(n))); }

// Pass shortfall from an estimate result + passes owned. Reflects both ends of the range.
function computePassShortfall(est, passesOwned) {
  const owned = passesOwned || 0;
  if (!est) return null;
  if (est.observed) return { lo: Math.max(0, est.observed - owned), hi: Math.max(0, est.observed - owned) };
  if (est.range) return { lo: Math.max(0, est.range[0] - owned), hi: Math.max(0, est.range[1] - owned) };
  return null;
}

// ------------------------------------------------------------
// Estimate engine.
// Input d (all numbers already parsed; null/undefined = not provided):
//   observedQuote      — real pass quote seen in the game's Transfer screen
//   transferScore      — actual in-game Transfer Score, if the event UI exposes it
//   groupRating        — in-game transfer group comparison/rating value, if known
//   govGear, charmPower, heroPower, heroGearPower, petPower, masterPower, techPower
//   totalPower, troopPower
// Returns { tier, modelVersion, disclaimer, confidence, reasons[], missing[],
//           observed? | range?[lo,hi] + best?, nonTroopPower? }
// Troop power and destination Power Cap are deliberately NOT inputs to the
// pass-cost estimate (official FAQ: troop dismissal does not change the score;
// cap is an eligibility question, not a price question).
// ------------------------------------------------------------
function computeTransferEstimate(d) {
  d = d || {};
  const reasons = [];
  const missing = [];
  const nonTroop = (d.totalPower != null && d.troopPower != null)
    ? Math.max(0, d.totalPower - d.troopPower) : null;

  // ---- Tier A: actual in-game quote supplied ----
  if (d.observedQuote != null && d.observedQuote >= 1) {
    return {
      tier: 'A', modelVersion: TRANSFER_MODEL_VERSION, disclaimer: TRANSFER_DISCLAIMER,
      observed: clampPasses(d.observedQuote),
      confidence: 'Observed',
      reasons: [
        'You entered a real quote from the in-game Transfer screen — that number is authoritative and is shown as-is, not replaced by a model.',
        'Quotes can change with account progression or event conditions — re-check before transferring.',
      ],
      missing: [], nonTroopPower: nonTroop,
    };
  }

  // ---- Tier B: actual Transfer Score known ----
  if (d.transferScore != null && d.transferScore > 0) {
    const ref = TRANSFER_SAMPLES.find(s => s.transfer_score != null);
    const ratio = d.transferScore / ref.transfer_score;
    const est = ref.actual_passes * ratio;
    let lo = clampPasses(Math.floor(est) - 1);
    let hi = clampPasses(Math.ceil(est) + 1);
    reasons.push(`Scaled from the one recorded score-to-pass observation (${ref.transfer_score.toLocaleString()} score → ${ref.actual_passes} passes, Sept 2026). One sample cannot prove a universal curve.`);
    reasons.push('Pass cost depends on your score RELATIVE to the eligible transfer group’s rating — the same score can price differently in a different group or event.');
    if (d.groupRating == null) {
      lo = clampPasses(lo - 1); hi = clampPasses(hi + 1);
      missing.push('Transfer group rating / comparison value (widens the range when absent — the model will not invent a denominator)');
    }
    return {
      tier: 'B', modelVersion: TRANSFER_MODEL_VERSION, disclaimer: TRANSFER_DISCLAIMER,
      range: [lo, hi], best: clampPasses(est),
      confidence: 'Low',
      reasons, missing, nonTroopPower: nonTroop,
    };
  }

  // ---- Tier C: development breakdown, no exact score ----
  const FIELD_MAP = {
    govGear: 'governor_gear_power',
    heroPower: 'hero_power',
    petPower: 'pet_power',
    masterPower: 'master_power',
  };
  const devFields = Object.keys(FIELD_MAP);
  const have = devFields.filter(f => d[f] != null && d[f] > 0);

  if (have.length >= 2) {
    // Similarity-weighted estimate: scale each benchmark's actual passes by the
    // geometric-mean ratio of shared development fields, then weight each
    // scaled estimate by how closely the account resembles that benchmark
    // (mean |log ratio| distance). A profile that nearly matches a benchmark
    // gets a tight range around it; a distant profile gets a wider one.
    const comps = TRANSFER_SAMPLES.map(s => {
      const ratios = have
        .map(f => (s[FIELD_MAP[f]] != null && s[FIELD_MAP[f]] > 0) ? d[f] / s[FIELD_MAP[f]] : null)
        .filter(r => r !== null && isFinite(r) && r > 0);
      if (!ratios.length) return null;
      const logs = ratios.map(r => Math.log(r));
      const gmean = Math.exp(logs.reduce((a, l) => a + l, 0) / logs.length);
      const dist = logs.reduce((a, l) => a + Math.abs(l), 0) / logs.length;
      return { est: s.actual_passes * gmean, dist };
    }).filter(c => c !== null);

    const wsum = comps.reduce((a, c) => a + 1 / (c.dist + 0.03), 0);
    const center = comps.reduce((a, c) => a + c.est / (c.dist + 0.03), 0) / wsum;
    const variance = comps.reduce((a, c) => a + Math.pow(c.est - center, 2) / (c.dist + 0.03), 0) / wsum;
    const dNear = Math.min(...comps.map(c => c.dist));
    // Spread: at least ±1 (two samples can never justify less), grows with
    // benchmark disagreement and with distance from the nearest benchmark.
    let spread = Math.max(1, Math.sqrt(variance)) + Math.min(2, dNear * 3);
    let confidence = 'Low';

    const absent = devFields.filter(f => !(d[f] != null && d[f] > 0));
    if (absent.length > 0) {
      spread += 1;
      confidence = 'Very low';
      const NICE = { govGear: 'Governor Gear Power', heroPower: 'Hero Power', petPower: 'Pet Power', masterPower: 'Master Power' };
      absent.forEach(f => missing.push(NICE[f]));
    }
    if (d.groupRating == null) missing.push('Transfer group rating / comparison value');

    // Asymmetric range: the floor stays tight, but the ceiling carries a +1
    // budget safety margin. Field-tested Nov 2026: an account quoted 6-9 by
    // the symmetric model needed exactly 9 in-game — landing on the ceiling.
    // Running out of passes mid-transfer hurts more than owning one spare.
    const lo = clampPasses(center - spread);
    const hi = clampPasses(center + spread + TRANSFER_CEILING_MARGIN);

    reasons.push('Compared your development stats to the two confirmed observations (Benchmark A: 8 actual passes; Benchmark B: 10 actual passes — both Sept 2026), weighted by how closely your profile matches each.');
    reasons.push('The ceiling includes a +1 budget safety margin: a November 2026 field test landed exactly on the model’s ceiling, so plan passes against the top of the range.');
    reasons.push('The closer your stats sit to a confirmed benchmark, the tighter this range gets — but two samples can never justify a single exact number. Troop power is ignored for pass cost by design.');
    reasons.push('Your in-game Transfer Score, if the event screen shows one, beats any figure inferred from these stats — enter it above if you can see it.');
    return {
      tier: 'C', modelVersion: TRANSFER_MODEL_VERSION, disclaimer: TRANSFER_DISCLAIMER,
      range: [lo, hi], best: clampPasses(center),
      confidence, reasons, missing, nonTroopPower: nonTroop,
    };
  }

  // ---- Tier D: only headline power ----
  if (nonTroop != null) {
    reasons.push('Non-troop displayed power is development context only — it is NOT the Transfer Score and a pass number will not be guessed from it.');
    reasons.push('Troop power never drives pass cost (official FAQ), so displayed total power alone cannot price a transfer.');
  }
  ['Governor Gear Power', 'Hero Power', 'Pet Power', 'Master Power'].forEach(f => missing.push(f));
  missing.push('Or best of all: the actual in-game Transfer Score / pass quote');
  return {
    tier: 'D', modelVersion: TRANSFER_MODEL_VERSION, disclaimer: TRANSFER_DISCLAIMER,
    confidence: 'Insufficient data',
    reasons, missing, nonTroopPower: nonTroop,
  };
}

// ------------------------------------------------------------
// Eligibility engine — independent of the pass estimate.
// Three-state checks: 'pass' | 'fail' | 'unknown'. Unknown stays unknown.
// Input d: sameGroup, capacity, recentTransfer, blockedState, charLimit,
//          phaseOk, specialInvite  — each 'yes' | 'no' | 'unsure'/null
//          totalPower, targetCap, tcLevel, passesOwned, observedQuote — numbers/null
// ------------------------------------------------------------
function computeTransferEligibility(d) {
  d = d || {};
  const sel = v => v === 'yes' || v === 'no' ? v : null;
  const rows = [];

  const tri = (val, yesIsPass, passNote, failNote, unknownNote) => {
    const v = sel(val);
    if (v === null) return { status: 'unknown', note: unknownNote };
    const ok = yesIsPass ? v === 'yes' : v === 'no';
    return ok ? { status: 'pass', note: passNote } : { status: 'fail', note: failNote };
  };

  rows.push({ id: 'group', label: 'Source & destination in the same eligible transfer group',
    ...tri(d.sameGroup, true,
      'Confirmed by you — groups are set per event, so re-check each event.',
      'Different groups — transfer is not possible this event.',
      'Groups are assigned per event — check the in-game transfer panel.') });

  rows.push({ id: 'capacity', label: 'Destination has transfer capacity / is accepting players',
    ...tri(d.capacity, true,
      'Confirmed by you.',
      'Destination full or not accepting — pick another kingdom or wait.',
      'Check the destination kingdom in the transfer panel.') });

  // Power Cap — computed, never conflated with pass price.
  if (d.totalPower != null && d.targetCap != null) {
    if (d.totalPower <= d.targetCap) {
      rows.push({ id: 'cap', label: 'Player meets the target kingdom Power Cap', status: 'pass',
        note: `Displayed power ${d.totalPower.toLocaleString()} ≤ cap ${d.targetCap.toLocaleString()}. Verify in-game whether wounded/reserves count toward Transfer Power.` });
    } else if (sel(d.specialInvite) === 'yes') {
      rows.push({ id: 'cap', label: 'Player meets the target kingdom Power Cap', status: 'pass',
        note: `Above cap (${d.totalPower.toLocaleString()} > ${d.targetCap.toLocaleString()}) but you report a Special Invite — an ordinary invitation does NOT override the cap; confirm the special invite in-game.` });
    } else {
      rows.push({ id: 'cap', label: 'Player meets the target kingdom Power Cap', status: 'fail',
        note: `Displayed power ${d.totalPower.toLocaleString()} exceeds the cap ${d.targetCap.toLocaleString()} — a Special Invite is generally required.` });
    }
  } else {
    rows.push({ id: 'cap', label: 'Player meets the target kingdom Power Cap', status: 'unknown',
      note: 'Enter your displayed power and the target kingdom’s cap.' });
  }

  if (d.tcLevel != null) {
    rows.push(d.tcLevel >= 25
      ? { id: 'tc', label: 'Minimum Town Center level met', status: 'pass',
          note: `TC ${d.tcLevel} meets the commonly-cited level 25 minimum — the exact requirement can vary per event.` }
      : { id: 'tc', label: 'Minimum Town Center level met', status: 'fail',
          note: `TC ${d.tcLevel} — first transfer events commonly require TC 25. Verify the current event’s rule in-game.` });
  } else {
    rows.push({ id: 'tc', label: 'Minimum Town Center level met', status: 'unknown', note: 'Enter your Town Center level.' });
  }

  rows.push({ id: 'cooldown', label: 'Transfer cooldown expired (guides describe 25 days)',
    ...tri(d.recentTransfer, false,
      'No transfer in the last 25 days.',
      'Guides describe a 25-day cooldown after a transfer — verify the exact timer in-game.',
      'Say whether you transferred in the last 25 days.') });

  rows.push({ id: 'blocked', label: 'No transfer-blocking state (left alliance, no active battle, allowed role)',
    ...tri(d.blockedState, false,
      'No blocking state reported.',
      'Resolve the blocking state first (leave alliance / finish battles / change role).',
      'Confirm in-game: alliance left if required, no active battles, allowed role.') });

  rows.push({ id: 'chars', label: 'Destination character limit not exceeded (guides indicate max 4)',
    ...tri(d.charLimit, true,
      'Confirmed by you — verify in-game.',
      'Too many characters in the destination kingdom.',
      'Current guides indicate a four-character maximum per kingdom — verify in-game.') });

  if (d.observedQuote != null && d.passesOwned != null) {
    rows.push(d.passesOwned >= d.observedQuote
      ? { id: 'passes', label: 'Enough Transfer Passes per the actual event screen', status: 'pass',
          note: `${d.passesOwned} owned ≥ ${d.observedQuote} quoted.` }
      : { id: 'passes', label: 'Enough Transfer Passes per the actual event screen', status: 'fail',
          note: `${d.passesOwned} owned < ${d.observedQuote} quoted — ${d.observedQuote - d.passesOwned} more needed.` });
  } else {
    rows.push({ id: 'passes', label: 'Enough Transfer Passes per the actual event screen', status: 'unknown',
      note: 'Needs the real quote from the event screen plus your owned pass count.' });
  }

  rows.push({ id: 'phase', label: 'Event phase permits the proposed route (invitation / open transfer)',
    ...tri(d.phaseOk, true,
      'Confirmed by you.',
      'Wait for the phase that permits your route (Pre-Transfer → Invitational → Open).',
      'Phases: Pre-Transfer, Invitational Transfer, Open Transfer — check which is live.') });

  return rows;
}

// Node export for unit tests; browser just gets globals.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TRANSFER_MODEL_VERSION, TRANSFER_DISCLAIMER, TRANSFER_SAMPLES, TRANSFER_CEILING_MARGIN,
    parsePowerInput, clampPasses, computePassShortfall,
    computeTransferEstimate, computeTransferEligibility,
  };
}
