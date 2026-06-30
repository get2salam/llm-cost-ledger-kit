#!/usr/bin/env node
/**
 * Demonstrates the llm-cost-ledger-kit library API for inline workload
 * cost estimation and model-switch analysis — no log file or CLI required.
 *
 * Run with:
 *   node examples/model-switch-analysis.js
 *
 * The script uses an embedded two-week traffic sample, loads the bundled
 * pricing table, and surfaces which candidate model would have been cheapest
 * for the same token traffic.  Inline assertions guard the output so you
 * can wire this into a pre-ship validation step or a CI smoke check.
 */

import assert from 'node:assert/strict';
import {
  loadPricing,
  summarize,
  compareAgainstModels,
  formatMoney,
} from '../src/index.js';

// --- inline workload (two weeks of mixed traffic) ----------------------
// Two records carry cached_input_tokens to show caching's effect on cost.
const WORKLOAD = [
  { model: 'gpt-4o',            input_tokens:  8_200, output_tokens: 1_400, cached_input_tokens:     0 },
  { model: 'gpt-4o',            input_tokens:  6_500, output_tokens: 2_100, cached_input_tokens: 1_800 },
  { model: 'gpt-4o',            input_tokens:  9_100, output_tokens: 3_200, cached_input_tokens:     0 },
  { model: 'claude-3-5-sonnet', input_tokens:  5_400, output_tokens: 1_200, cached_input_tokens: 2_000 },
  { model: 'claude-3-5-sonnet', input_tokens:  7_300, output_tokens:   980, cached_input_tokens:     0 },
  { model: 'gpt-4o-mini',       input_tokens: 12_000, output_tokens: 2_800, cached_input_tokens:     0 },
];

// Candidate models: would any of these have been cheaper?
const CANDIDATES = ['gpt-4o-mini', 'claude-3-5-haiku', 'gemini-1.5-flash', 'gemini-1.5-pro'];

// --- compute -----------------------------------------------------------
const pricing = loadPricing();
const summary = summarize(WORKLOAD, pricing);
const comparison = compareAgainstModels(WORKLOAD, pricing, CANDIDATES);

// --- workload summary --------------------------------------------------
console.log('=== Workload summary ===');
console.log(`Requests : ${summary.total_requests}`);
console.log(`Input    : ${summary.total_input_tokens.toLocaleString()} tokens`);
console.log(`Output   : ${summary.total_output_tokens.toLocaleString()} tokens`);
console.log(`Cached   : ${summary.total_cached_input_tokens.toLocaleString()} tokens`);
console.log(`Cost     : ${formatMoney(summary.total_cost, summary.currency)}`);

// --- per-model breakdown -----------------------------------------------
console.log('\n=== Per-model cost ===');
for (const m of summary.models) {
  const req = `${m.requests} request${m.requests === 1 ? '' : 's'}`;
  console.log(
    `  ${m.model.padEnd(24)} ${formatMoney(m.cost, summary.currency).padStart(8)}  (${req})`,
  );
}

// --- model-switch candidates -------------------------------------------
const priced = comparison.filter((c) => !c.unpriced).sort((a, b) => a.cost - b.cost);

console.log('\n=== Model-switch candidates (same token traffic) ===');
for (const c of priced) {
  const delta  = c.cost_delta ?? 0;
  const impact = delta < 0
    ? `saves ${formatMoney(Math.abs(delta), pricing.currency)}`
    : `+${formatMoney(delta, pricing.currency)}`;
  const pct = c.savings_percent != null ? ` (${c.savings_percent.toFixed(1)}% cheaper)` : '';
  console.log(
    `  ${c.model.padEnd(24)} ${formatMoney(c.cost, pricing.currency).padStart(8)}  ${impact}${pct}`,
  );
}

const cheapest = priced[0];
if (cheapest && (cheapest.cost_delta ?? 0) < 0) {
  console.log(
    `\nSwitch to ${cheapest.model} to save ` +
    `${formatMoney(Math.abs(cheapest.cost_delta), pricing.currency)} ` +
    `(${cheapest.savings_percent.toFixed(1)}%) on this workload.`,
  );
}

// --- self-checks (guard against regressions) ---------------------------
assert.strictEqual(
  summary.total_requests,
  WORKLOAD.length,
  'Request count must match workload length',
);
assert.ok(summary.total_cost > 0, 'Expected non-zero total cost');
assert.strictEqual(priced.length, CANDIDATES.length, 'All candidates must resolve to priced models');
assert.ok(
  cheapest.cost < summary.total_cost,
  `Cheapest candidate (${cheapest.model}) must cost less than the actual workload spend`,
);

// Sorted ascending: each entry should be no cheaper than the one before it.
for (let i = 1; i < priced.length; i++) {
  assert.ok(
    priced[i].cost >= priced[i - 1].cost,
    `Comparison results must be sorted ascending by cost`,
  );
}

console.log('\nAll self-checks passed.');
