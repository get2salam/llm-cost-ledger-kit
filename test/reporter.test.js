import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTable, renderJson, renderComparison, renderList } from '../src/reporter.js';
import { Severity } from '../src/budget.js';

const summary = {
  currency: 'USD',
  total_cost: 12.5,
  total_requests: 2,
  total_input_tokens: 1_000_000,
  total_output_tokens: 1_000_000,
  total_cached_input_tokens: 0,
  models: [
    {
      model: 'gpt-4o',
      requests: 2,
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      cached_input_tokens: 0,
      cost: 12.5,
      unpriced: false,
    },
  ],
  unpriced_models: [],
};

test('renderTable contains headers, totals, and warnings', () => {
  const out = renderTable(summary, [
    { severity: Severity.WARN, message: 'careful now', scope: 'total' },
  ]);
  assert.ok(out.includes('LLM Cost Ledger'));
  assert.ok(out.includes('gpt-4o'));
  assert.ok(out.includes('TOTAL'));
  assert.ok(out.includes('$12.50'));
  assert.ok(out.includes('[WARN]'));
  assert.ok(out.includes('careful now'));
});

test('renderTable annotates unpriced models', () => {
  const s = {
    ...summary,
    models: [{ ...summary.models[0], model: 'mystery', cost: 0, unpriced: true }],
    unpriced_models: ['mystery'],
    total_cost: 0,
  };
  const out = renderTable(s);
  assert.ok(out.includes('mystery (no price)'));
});

test('renderJson returns parseable JSON with comparison when provided', () => {
  const comp = [{ model: 'gpt-4o', canonical: 'gpt-4o', cost: 12.5, unpriced: false }];
  const json = JSON.parse(renderJson(summary, [], comp));
  assert.equal(json.summary.total_cost, 12.5);
  assert.deepEqual(json.warnings, []);
  assert.equal(json.comparison[0].model, 'gpt-4o');
});

test('renderComparison sorts priced models ascending and lists unpriced last', () => {
  const out = renderComparison([
    { model: 'expensive', canonical: 'x', cost: 10, unpriced: false },
    { model: 'cheap', canonical: 'y', cost: 1, unpriced: false },
    { model: 'unknown', canonical: null, cost: null, unpriced: true },
  ]);
  const cheapIdx = out.indexOf('cheap');
  const expensiveIdx = out.indexOf('expensive');
  const unknownIdx = out.indexOf('unknown');
  assert.ok(cheapIdx < expensiveIdx);
  assert.ok(expensiveIdx < unknownIdx);
  assert.ok(out.includes('(no price)'));
});

test('renderList gives screen-reader-friendly labelled output', () => {
  const out = renderList(
    summary,
    [{ severity: Severity.EXCEEDED, message: 'budget crossed', scope: 'total' }],
    [
      { model: 'cheap', canonical: 'cheap', cost: 1, unpriced: false },
      { model: 'unknown', canonical: null, cost: null, unpriced: true },
    ],
  );

  assert.ok(out.includes('LLM Cost Ledger summary'));
  assert.ok(out.includes('Total: 2 requests'));
  assert.ok(out.includes('- gpt-4o: 2 requests'));
  assert.ok(out.includes('Comparison costs if every request used one model'));
  assert.ok(out.includes('- unknown: no pricing data available'));
  assert.ok(out.includes('- EXCEEDED: budget crossed'));
});
