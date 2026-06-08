import { formatMoney, Severity } from './budget.js';

function fmtTokens(n) {
  return n.toLocaleString('en-US');
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
  const header = `${pad('Model', 28)}  ${pad('Cost', 12, 'right')}`;
  lines.push(header);
  lines.push('-'.repeat(header.length));
  const priced = comparison.filter((c) => !c.unpriced).sort((a, b) => a.cost - b.cost);
  const unpriced = comparison.filter((c) => c.unpriced);
  for (const c of priced) {
    lines.push(`${pad(c.model, 28)}  ${pad(formatMoney(c.cost, currency), 12, 'right')}`);
  }
  for (const c of unpriced) {
    lines.push(`${pad(c.model, 28)}  ${pad('(no price)', 12, 'right')}`);
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
