import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateBudget, formatMoney, highestSeverity, Severity } from '../src/budget.js';

function summaryFor(totalCost, perModel = [], unpriced = []) {
  return {
    currency: 'USD',
    total_cost: totalCost,
    total_requests: perModel.reduce((s, m) => s + m.requests, 0),
    total_input_tokens: 0,
    total_output_tokens: 0,
    total_cached_input_tokens: 0,
    models: perModel,
    unpriced_models: unpriced,
  };
}

test('evaluateBudget returns no warnings when under threshold and no caps', () => {
  const w = evaluateBudget(summaryFor(1.0, [{ model: 'gpt-4o', requests: 1, cost: 1.0 }]), {
    budget: 10,
  });
  assert.equal(w.length, 0);
});

test('evaluateBudget warns when ratio crosses warnAt', () => {
  const w = evaluateBudget(summaryFor(8.5), { budget: 10, warnAt: 0.8 });
  assert.equal(w.length, 1);
  assert.equal(w[0].severity, Severity.WARN);
  assert.equal(w[0].scope, 'total');
});

test('evaluateBudget flags EXCEEDED when over budget', () => {
  const w = evaluateBudget(summaryFor(12), { budget: 10 });
  assert.equal(w[0].severity, Severity.EXCEEDED);
  assert.ok(w[0].message.includes('exceeds budget'));
});

test('evaluateBudget honors per-model caps', () => {
  const w = evaluateBudget(
    summaryFor(0.5, [
      { model: 'gpt-4o', requests: 5, cost: 0.5 },
      { model: 'gpt-4o-mini', requests: 5, cost: 0.05 },
    ]),
    { perModelBudget: { 'gpt-4o': 0.25, 'gpt-4o-mini': 1.0 } },
  );
  assert.equal(w.length, 1);
  assert.equal(w[0].scope, 'model');
  assert.equal(w[0].model, 'gpt-4o');
  assert.equal(w[0].severity, Severity.EXCEEDED);
});

test('evaluateBudget emits INFO for unpriced models', () => {
  const w = evaluateBudget(summaryFor(0, [], ['mystery-model']), {});
  assert.equal(w.length, 1);
  assert.equal(w[0].severity, Severity.INFO);
  assert.ok(w[0].message.includes('mystery-model'));
});

test('highestSeverity ranks correctly', () => {
  assert.equal(highestSeverity([]), null);
  assert.equal(
    highestSeverity([{ severity: Severity.INFO }, { severity: Severity.WARN }]),
    Severity.WARN,
  );
  assert.equal(
    highestSeverity([{ severity: Severity.WARN }, { severity: Severity.EXCEEDED }]),
    Severity.EXCEEDED,
  );
});

test('formatMoney renders symbols and precision', () => {
  assert.equal(formatMoney(1.5), '$1.50');
  assert.equal(formatMoney(0.0123), '$0.0123');
  assert.equal(formatMoney(-2.5), '-$2.50');
  assert.equal(formatMoney(10, 'EUR'), '€10.00');
});
