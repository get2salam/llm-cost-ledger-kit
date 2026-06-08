export const Severity = Object.freeze({
  INFO: 'info',
  WARN: 'warn',
  EXCEEDED: 'exceeded',
});

export function evaluateBudget(summary, options = {}) {
  const { budget, warnAt = 0.8, perModelBudget = {} } = options;
  const warnings = [];

  if (typeof budget === 'number' && budget > 0) {
    const ratio = summary.total_cost / budget;
    if (ratio >= 1) {
      warnings.push({
        severity: Severity.EXCEEDED,
        scope: 'total',
        ratio,
        budget,
        cost: summary.total_cost,
        message: `Total cost ${formatMoney(summary.total_cost, summary.currency)} exceeds budget ${formatMoney(budget, summary.currency)} (${(ratio * 100).toFixed(1)}%).`,
      });
    } else if (ratio >= warnAt) {
      warnings.push({
        severity: Severity.WARN,
        scope: 'total',
        ratio,
        budget,
        cost: summary.total_cost,
        message: `Total cost ${formatMoney(summary.total_cost, summary.currency)} is at ${(ratio * 100).toFixed(1)}% of budget ${formatMoney(budget, summary.currency)}.`,
      });
    }
  }

  for (const model of summary.models) {
    const cap = perModelBudget[model.model];
    if (typeof cap !== 'number' || cap <= 0) continue;
    const ratio = model.cost / cap;
    if (ratio >= 1) {
      warnings.push({
        severity: Severity.EXCEEDED,
        scope: 'model',
        model: model.model,
        ratio,
        budget: cap,
        cost: model.cost,
        message: `Model "${model.model}" cost ${formatMoney(model.cost, summary.currency)} exceeds cap ${formatMoney(cap, summary.currency)} (${(ratio * 100).toFixed(1)}%).`,
      });
    } else if (ratio >= warnAt) {
      warnings.push({
        severity: Severity.WARN,
        scope: 'model',
        model: model.model,
        ratio,
        budget: cap,
        cost: model.cost,
        message: `Model "${model.model}" cost ${formatMoney(model.cost, summary.currency)} is at ${(ratio * 100).toFixed(1)}% of cap ${formatMoney(cap, summary.currency)}.`,
      });
    }
  }

  if (summary.unpriced_models.length > 0) {
    warnings.push({
      severity: Severity.INFO,
      scope: 'pricing',
      message: `No pricing entry for: ${summary.unpriced_models.join(', ')}. These records were counted as $0.`,
    });
  }

  return warnings;
}

export function formatMoney(value, currency = 'USD') {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const digits = abs < 1 ? 4 : 2;
  return `${sign}${currencySymbol(currency)}${abs.toFixed(digits)}`;
}

function currencySymbol(currency) {
  if (currency === 'USD') return '$';
  if (currency === 'EUR') return '€';
  if (currency === 'GBP') return '£';
  return `${currency} `;
}

export function highestSeverity(warnings) {
  if (warnings.some((w) => w.severity === Severity.EXCEEDED)) return Severity.EXCEEDED;
  if (warnings.some((w) => w.severity === Severity.WARN)) return Severity.WARN;
  if (warnings.length > 0) return Severity.INFO;
  return null;
}
