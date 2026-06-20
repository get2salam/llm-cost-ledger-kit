import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePricing } from '../src/pricing.js';
import { costForRecord, summarize, compareAgainstModels } from '../src/calculator.js';

function makePricing() {
  return normalizePricing({
    currency: 'USD',
    unit: 'per_million_tokens',
    models: {
      'gpt-4o': { input: 2.5, output: 10.0, cached_input: 1.25 },
      'gpt-4o-mini': { input: 0.15, output: 0.6 },
    },
    aliases: { 'gpt-4o-2024': 'gpt-4o' },
  });
}

const approx = (a, b, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) < eps, `expected ${a} ≈ ${b}`);

test('costForRecord computes input + output cost', () => {
  const pricing = makePricing();
  const r = costForRecord(
    { model: 'gpt-4o', input_tokens: 1_000_000, output_tokens: 1_000_000, cached_input_tokens: 0 },
    pricing,
  );
  approx(r.cost, 12.5);
  approx(r.breakdown.input, 2.5);
  approx(r.breakdown.output, 10.0);
  assert.equal(r.canonical, 'gpt-4o');
  assert.equal(r.unpriced, false);
});

test('costForRecord applies cached-input discount and subtracts from billable input', () => {
  const pricing = makePricing();
  const r = costForRecord(
    {
      model: 'gpt-4o',
      input_tokens: 1_000_000,
      output_tokens: 0,
      cached_input_tokens: 400_000,
    },
    pricing,
  );
  // billable input = 600k * 2.5 / 1M = 1.5
  // cached = 400k * 1.25 / 1M = 0.5
  approx(r.breakdown.input, 1.5);
  approx(r.breakdown.cached_input, 0.5);
  approx(r.cost, 2.0);
});

test('costForRecord resolves aliases', () => {
  const pricing = makePricing();
  const r = costForRecord(
    { model: 'gpt-4o-2024', input_tokens: 1_000_000, output_tokens: 0, cached_input_tokens: 0 },
    pricing,
  );
  assert.equal(r.canonical, 'gpt-4o');
  approx(r.cost, 2.5);
});

test('costForRecord flags unpriced models with zero cost', () => {
  const pricing = makePricing();
  const r = costForRecord(
    { model: 'mystery-model', input_tokens: 1000, output_tokens: 100, cached_input_tokens: 0 },
    pricing,
  );
  assert.equal(r.unpriced, true);
  assert.equal(r.cost, 0);
  assert.equal(r.canonical, null);
});

test('summarize aggregates per model and totals', () => {
  const pricing = makePricing();
  const records = [
    { model: 'gpt-4o', input_tokens: 1_000_000, output_tokens: 0, cached_input_tokens: 0 },
    { model: 'gpt-4o', input_tokens: 0, output_tokens: 1_000_000, cached_input_tokens: 0 },
    { model: 'gpt-4o-mini', input_tokens: 2_000_000, output_tokens: 0, cached_input_tokens: 0 },
    { model: 'mystery', input_tokens: 50, output_tokens: 50, cached_input_tokens: 0 },
  ];
  const s = summarize(records, pricing);
  approx(s.total_cost, 2.5 + 10.0 + 0.3);
  assert.equal(s.total_requests, 4);
  assert.equal(s.total_input_tokens, 3_000_050);
  assert.equal(s.total_output_tokens, 1_000_050);
  assert.deepEqual(s.unpriced_models, ['mystery']);
  // gpt-4o should sort first because it costs the most
  assert.equal(s.models[0].model, 'gpt-4o');
  approx(s.models[0].cost, 12.5);
});

test('compareAgainstModels re-prices token totals across candidates', () => {
  const pricing = makePricing();
  const records = [
    { model: 'gpt-4o', input_tokens: 1_000_000, output_tokens: 1_000_000, cached_input_tokens: 0 },
  ];
  const comparison = compareAgainstModels(records, pricing, ['gpt-4o', 'gpt-4o-mini', 'nope']);
  approx(comparison[0].cost, 12.5);
  approx(comparison[0].cost_delta, 0);
  approx(comparison[0].savings_percent, 0);
  approx(comparison[1].cost, 0.15 + 0.6);
  approx(comparison[1].cost_delta, -11.75);
  approx(comparison[1].savings_percent, 94);
  assert.equal(comparison[2].unpriced, true);
  assert.equal(comparison[2].cost, null);
  assert.equal(comparison[2].cost_delta, null);
  assert.equal(comparison[2].savings_percent, null);
});
