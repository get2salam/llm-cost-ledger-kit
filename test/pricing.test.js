import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPricing, normalizePricing, resolveModel, getRates } from '../src/pricing.js';

test('loadPricing reads the bundled pricing file', () => {
  const pricing = loadPricing();
  assert.equal(pricing.currency, 'USD');
  assert.equal(pricing.divisor, 1_000_000);
  assert.ok(pricing.models['gpt-4o']);
  assert.ok(pricing.models['claude-3-5-sonnet']);
});

test('normalizePricing rejects bad input', () => {
  assert.throws(() => normalizePricing(null));
  assert.throws(() => normalizePricing([]));
  assert.throws(() => normalizePricing({}));
  assert.throws(() => normalizePricing({ models: [] }));
  assert.throws(() => normalizePricing({ models: {} }), /at least one model/);
});

test('normalizePricing chooses divisor based on unit', () => {
  const a = normalizePricing({ unit: 'per_thousand_tokens', models: { x: { input: 1, output: 1 } } });
  assert.equal(a.divisor, 1_000);
  const b = normalizePricing({ unit: 'per_token', models: { x: { input: 1, output: 1 } } });
  assert.equal(b.divisor, 1);
  const c = normalizePricing({ models: { x: { input: 1, output: 1 } } });
  assert.equal(c.divisor, 1_000_000, 'defaults to per_million_tokens');
  assert.throws(
    () => normalizePricing({ unit: 'per_character', models: { x: { input: 1, output: 1 } } }),
    /unit must be one of/,
  );
});

test('normalizePricing validates model rate entries before cost calculations', () => {
  assert.throws(
    () => normalizePricing({ models: { x: { input: 1 } } }),
    /finite input and output rates/,
  );
  assert.throws(
    () => normalizePricing({ models: { x: { input: 1, output: Number.NaN } } }),
    /finite input and output rates/,
  );
  assert.throws(
    () => normalizePricing({ models: { x: { input: 1, output: 1, cached_input: -0.5 } } }),
    /invalid cached_input rate/,
  );
});

test('normalizePricing validates aliases point to priced canonical models', () => {
  assert.throws(
    () => normalizePricing({ models: { x: { input: 1, output: 1 } }, aliases: [] }),
    /aliases must be an object/,
  );
  assert.throws(
    () => normalizePricing({ models: { x: { input: 1, output: 1 } }, aliases: { y: 'missing' } }),
    /points to unknown model/,
  );
});

test('resolveModel maps aliases to canonical names', () => {
  const pricing = loadPricing();
  assert.equal(resolveModel(pricing, 'gpt-4o'), 'gpt-4o');
  assert.equal(resolveModel(pricing, 'claude-3-5-sonnet-20241022'), 'claude-3-5-sonnet');
  assert.equal(resolveModel(pricing, 'made-up-model'), null);
  assert.equal(resolveModel(pricing, null), null);
});

test('getRates returns rates and canonical name', () => {
  const pricing = loadPricing();
  const hit = getRates(pricing, 'claude-3-5-sonnet-latest');
  assert.ok(hit);
  assert.equal(hit.canonical, 'claude-3-5-sonnet');
  assert.equal(typeof hit.rates.input, 'number');
  assert.equal(getRates(pricing, 'nope'), null);
});
