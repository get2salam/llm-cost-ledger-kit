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

export function normalizePricing(table) {
  if (!table || typeof table !== 'object') {
    throw new TypeError('Pricing table must be an object');
  }
  if (!table.models || typeof table.models !== 'object') {
    throw new TypeError('Pricing table must include a "models" object');
  }

  const unit = table.unit ?? 'per_million_tokens';
  const divisor = unit === 'per_million_tokens'
    ? 1_000_000
    : unit === 'per_thousand_tokens'
      ? 1_000
      : 1;

  return {
    currency: table.currency ?? 'USD',
    unit,
    divisor,
    models: table.models,
    aliases: table.aliases ?? {},
  };
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
