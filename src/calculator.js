import { getRates } from './pricing.js';

export function costForRecord(record, pricing) {
  const entry = getRates(pricing, record.model);
  if (!entry) {
    return {
      model: record.model,
      canonical: null,
      cost: 0,
      breakdown: { input: 0, output: 0, cached_input: 0 },
      unpriced: true,
    };
  }
  const { canonical, rates } = entry;
  const divisor = pricing.divisor;

  const inputRate = rates.input ?? 0;
  const outputRate = rates.output ?? 0;
  const cachedRate = rates.cached_input ?? inputRate;

  const billableInput = Math.max(0, record.input_tokens - record.cached_input_tokens);

  const inputCost = (billableInput * inputRate) / divisor;
  const outputCost = (record.output_tokens * outputRate) / divisor;
  const cachedCost = (record.cached_input_tokens * cachedRate) / divisor;

  return {
    model: record.model,
    canonical,
    cost: inputCost + outputCost + cachedCost,
    breakdown: {
      input: inputCost,
      output: outputCost,
      cached_input: cachedCost,
    },
    unpriced: false,
  };
}

export function summarize(records, pricing) {
  const perModel = new Map();
  let totalCost = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCachedTokens = 0;
  const unpriced = new Set();

  for (const record of records) {
    const result = costForRecord(record, pricing);
    if (result.unpriced) {
      unpriced.add(record.model);
    }

    const key = result.canonical ?? record.model;
    const bucket = perModel.get(key) ?? {
      model: key,
      requests: 0,
      input_tokens: 0,
      output_tokens: 0,
      cached_input_tokens: 0,
      cost: 0,
      unpriced: result.unpriced,
    };
    bucket.requests += 1;
    bucket.input_tokens += record.input_tokens;
    bucket.output_tokens += record.output_tokens;
    bucket.cached_input_tokens += record.cached_input_tokens;
    bucket.cost += result.cost;
    bucket.unpriced = bucket.unpriced && result.unpriced;
    perModel.set(key, bucket);

    totalCost += result.cost;
    totalInputTokens += record.input_tokens;
    totalOutputTokens += record.output_tokens;
    totalCachedTokens += record.cached_input_tokens;
  }

  const models = [...perModel.values()].sort((a, b) => b.cost - a.cost);

  return {
    currency: pricing.currency,
    total_cost: totalCost,
    total_requests: records.length,
    total_input_tokens: totalInputTokens,
    total_output_tokens: totalOutputTokens,
    total_cached_input_tokens: totalCachedTokens,
    models,
    unpriced_models: [...unpriced],
  };
}

export function compareAgainstModels(records, pricing, candidateModels) {
  // Re-cost the same token totals against each candidate model — useful for
  // "what if we switched from gpt-4o to claude-3-5-sonnet" comparisons.
  const totals = records.reduce(
    (acc, r) => {
      acc.input += r.input_tokens;
      acc.output += r.output_tokens;
      acc.cached += r.cached_input_tokens;
      return acc;
    },
    { input: 0, output: 0, cached: 0 },
  );

  return candidateModels.map((model) => {
    const entry = getRates(pricing, model);
    if (!entry) {
      return { model, canonical: null, cost: null, unpriced: true };
    }
    const { canonical, rates } = entry;
    const divisor = pricing.divisor;
    const billableInput = Math.max(0, totals.input - totals.cached);
    const cachedRate = rates.cached_input ?? rates.input ?? 0;
    const cost =
      (billableInput * (rates.input ?? 0)) / divisor +
      (totals.output * (rates.output ?? 0)) / divisor +
      (totals.cached * cachedRate) / divisor;
    return { model, canonical, cost, unpriced: false };
  });
}
