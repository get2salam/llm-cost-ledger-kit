import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const DEFAULT_PRICING_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'pricing.json',
);

export function loadPricing(path = DEFAULT_PRICING_PATH) {
  const raw = readFileSync(path, 'utf8');
  const parsed = JSON.parse(raw);
  return normalizePricing(parsed);
}

const UNIT_DIVISORS = Object.freeze({
  per_million_tokens: 1_000_000,
  per_thousand_tokens: 1_000,
  per_token: 1,
});

const RATE_FIELDS = Object.freeze(['input', 'output', 'cached_input']);

export function normalizePricing(table) {
  if (!table || typeof table !== 'object' || Array.isArray(table)) {
    throw new TypeError('Pricing table must be an object');
  }
  if (!table.models || typeof table.models !== 'object' || Array.isArray(table.models)) {
    throw new TypeError('Pricing table must include a "models" object');
  }

  const unit = table.unit ?? 'per_million_tokens';
  const divisor = UNIT_DIVISORS[unit];
  if (!divisor) {
    throw new TypeError(`Pricing table unit must be one of: ${Object.keys(UNIT_DIVISORS).join(', ')}`);
  }

  const models = normalizeModels(table.models);
  const aliases = normalizeAliases(table.aliases ?? {}, models);

  return {
    currency: table.currency ?? 'USD',
    unit,
    divisor,
    models,
    aliases,
  };
}

function normalizeModels(models) {
  const entries = Object.entries(models);
  if (entries.length === 0) {
    throw new TypeError('Pricing table must define at least one model');
  }

  return Object.fromEntries(entries.map(([model, rates]) => [model, normalizeRates(model, rates)]));
}

function normalizeRates(model, rates) {
  if (!rates || typeof rates !== 'object' || Array.isArray(rates)) {
    throw new TypeError(`Pricing entry for "${model}" must be an object`);
  }
  if (!Number.isFinite(rates.input) || !Number.isFinite(rates.output)) {
    throw new TypeError(`Pricing entry for "${model}" must include finite input and output rates`);
  }

  const normalized = {};
  for (const field of RATE_FIELDS) {
    if (rates[field] === undefined) continue;
    if (!Number.isFinite(rates[field]) || rates[field] < 0) {
      throw new TypeError(`Pricing entry for "${model}" has invalid ${field} rate`);
    }
    normalized[field] = rates[field];
  }
  return normalized;
}

function normalizeAliases(aliases, models) {
  if (!aliases || typeof aliases !== 'object' || Array.isArray(aliases)) {
    throw new TypeError('Pricing aliases must be an object');
  }

  return Object.fromEntries(Object.entries(aliases).map(([alias, canonical]) => {
    if (typeof canonical !== 'string' || !models[canonical]) {
      throw new TypeError(`Pricing alias "${alias}" points to unknown model "${canonical}"`);
    }
    return [alias, canonical];
  }));
}

export function resolveModel(pricing, model) {
  if (!model) return null;
  if (pricing.models[model]) return model;
  const alias = pricing.aliases[model];
  if (alias && pricing.models[alias]) return alias;
  return null;
}

export function getRates(pricing, model) {
  const canonical = resolveModel(pricing, model);
  if (!canonical) return null;
  return { canonical, rates: pricing.models[canonical] };
}
