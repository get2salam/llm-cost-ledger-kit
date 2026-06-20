import { formatMoney, Severity } from './budget.js';

function fmtTokens(n) {
  return n.toLocaleString('en-US');
}

function plural(n, singular, pluralForm = `${singular}s`) {
  return n === 1 ? singular : pluralForm;
}

function fmtPercent(n) {
  if (n === null || n === undefined) return 'n/a';
  return `${n.toFixed(1)}%`;
}

function pad(str, width, align = 'left') {
  const s = String(str);
  if (s.length >= width) return s;
  const space = ' '.repeat(width - s.length);
  return align === 'right' ? space + s : s + space;
}

export function renderTable(summary, warnings = []) {
  const lines = [];
  lines.push('LLM Cost Ledger');
  lines.push('===============');
  lines.push('');

  const header = [
    pad('Model', 24),
    pad('Requests', 10, 'right'),
    pad('Input', 14, 'right'),
    pad('Output', 14, 'right'),
    pad('Cost', 12, 'right'),
  ].join('  ');
  lines.push(header);
  lines.push('-'.repeat(header.length));

  for (const m of summary.models) {
    lines.push(
      [
        pad(m.unpriced ? `${m.model} (no price)` : m.model, 24),
        pad(fmtTokens(m.requests), 10, 'right'),
        pad(fmtTokens(m.input_tokens), 14, 'right'),
        pad(fmtTokens(m.output_tokens), 14, 'right'),
        pad(formatMoney(m.cost, summary.currency), 12, 'right'),
      ].join('  '),
    );
  }

  lines.push('-'.repeat(header.length));
  lines.push(
    [
      pad('TOTAL', 24),
      pad(fmtTokens(summary.total_requests), 10, 'right'),
      pad(fmtTokens(summary.total_input_tokens), 14, 'right'),
      pad(fmtTokens(summary.total_output_tokens), 14, 'right'),
      pad(formatMoney(summary.total_cost, summary.currency), 12, 'right'),
    ].join('  '),
  );

  if (warnings.length > 0) {
    lines.push('');
    lines.push('Budget signals:');
    for (const w of warnings) {
      lines.push(`  [${severityTag(w.severity)}] ${w.message}`);
    }
  }

  return lines.join('\n');
}

export function renderComparison(comparison, currency = 'USD') {
  const lines = [];
  lines.push('');
  lines.push('Cost if every request used:');
  const header = [
    pad('Model', 28),
    pad('Cost', 12, 'right'),
    pad('Delta', 12, 'right'),
    pad('Savings', 9, 'right'),
  ].join('  ');
  lines.push(header);
  lines.push('-'.repeat(header.length));
  const priced = comparison.filter((c) => !c.unpriced).sort((a, b) => a.cost - b.cost);
  const unpriced = comparison.filter((c) => c.unpriced);
  for (const c of priced) {
    const delta = c.cost_delta ?? 0;
    const deltaText = `${delta >= 0 ? '+' : '-'}${formatMoney(Math.abs(delta), currency)}`;
    lines.push(
      [
        pad(c.model, 28),
        pad(formatMoney(c.cost, currency), 12, 'right'),
        pad(deltaText, 12, 'right'),
        pad(fmtPercent(c.savings_percent), 9, 'right'),
      ].join('  '),
    );
  }
  for (const c of unpriced) {
    lines.push(
      [pad(c.model, 28), pad('(no price)', 12, 'right'), pad('n/a', 12, 'right'), pad('n/a', 9, 'right')].join(
        '  ',
      ),
    );
  }
  return lines.join('\n');
}

export function renderList(summary, warnings = [], comparison = null) {
  const lines = [];
  lines.push('LLM Cost Ledger summary');
  lines.push(
    `Total: ${fmtTokens(summary.total_requests)} ${plural(summary.total_requests, 'request')}, ${fmtTokens(summary.total_input_tokens)} input tokens, ${fmtTokens(summary.total_output_tokens)} output tokens, ${formatMoney(summary.total_cost, summary.currency)}.`,
  );
  lines.push('');
  lines.push('Models:');
  for (const m of summary.models) {
    const priceNote = m.unpriced ? ' No pricing data was available, so cost is reported as zero.' : '';
    lines.push(
      `- ${m.model}: ${fmtTokens(m.requests)} ${plural(m.requests, 'request')}, ${fmtTokens(m.input_tokens)} input tokens, ${fmtTokens(m.output_tokens)} output tokens, ${formatMoney(m.cost, summary.currency)}.${priceNote}`,
    );
  }

  if (comparison?.length) {
    lines.push('');
    lines.push('Comparison costs if every request used one model:');
    const priced = comparison.filter((c) => !c.unpriced).sort((a, b) => a.cost - b.cost);
    const unpriced = comparison.filter((c) => c.unpriced);
    for (const c of priced) {
      const delta = c.cost_delta ?? 0;
      const impact =
        delta <= 0
          ? `saves ${formatMoney(Math.abs(delta), summary.currency)} versus current spend (${fmtPercent(c.savings_percent)} savings)`
          : `adds ${formatMoney(delta, summary.currency)} versus current spend (${fmtPercent(Math.abs(c.savings_percent ?? 0))} increase)`;
      lines.push(
        `- ${c.model}: ${formatMoney(c.cost, summary.currency)}; ${impact}.`,
      );
    }
    for (const c of unpriced) lines.push(`- ${c.model}: no pricing data available`);
  }

  if (warnings.length > 0) {
    lines.push('');
    lines.push('Budget signals:');
    for (const w of warnings) lines.push(`- ${severityTag(w.severity)}: ${w.message}`);
  }

  return lines.join('\n');
}

export function renderJson(summary, warnings = [], comparison = null) {
  const payload = { summary, warnings };
  if (comparison) payload.comparison = comparison;
  return JSON.stringify(payload, null, 2);
}

function severityTag(sev) {
  if (sev === Severity.EXCEEDED) return 'EXCEEDED';
  if (sev === Severity.WARN) return 'WARN';
  return 'INFO';
}
