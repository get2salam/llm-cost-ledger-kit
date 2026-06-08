#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { argv, stdin, stdout, stderr, exit } from 'node:process';

import { loadPricing, normalizePricing } from '../src/pricing.js';
import { parseUsage, parseUsageFile } from '../src/parser.js';
import { summarize, compareAgainstModels } from '../src/calculator.js';
import { evaluateBudget, highestSeverity, Severity } from '../src/budget.js';
import { renderTable, renderJson, renderComparison } from '../src/reporter.js';

const USAGE = `Usage: llm-cost-ledger [options]

Options:
  -i, --input <path>          Path to usage log (.jsonl/.json/.csv). Use "-" for stdin.
  -f, --format <fmt>          Force format: jsonl | json | csv (auto-detected otherwise)
  -p, --pricing <path>        Custom pricing JSON (defaults to bundled pricing.json)
  -b, --budget <amount>       Total budget. Emits warnings as costs approach/exceed it.
      --warn-at <ratio>       Fraction of budget at which to warn (default 0.8)
      --model-budget <m=amt>  Per-model cap (repeatable). Example: --model-budget gpt-4o=2.50
      --compare <models>      Comma-separated models to compare same usage against
      --format-output <fmt>   "table" (default) or "json"
      --fail-on <level>       Exit non-zero on warn|exceeded (default: exceeded)
  -h, --help                  Show this help
  -V, --version               Show version

Examples:
  llm-cost-ledger --input usage.jsonl --budget 5.00
  llm-cost-ledger --input usage.csv --compare gpt-4o-mini,claude-3-5-haiku
  cat usage.jsonl | llm-cost-ledger --input - --format-output json
`;

function parseArgs(args) {
  const opts = {
    input: null,
    format: null,
    pricing: null,
    budget: null,
    warnAt: 0.8,
    modelBudget: {},
    compare: null,
    formatOutput: 'table',
    failOn: 'exceeded',
    help: false,
    version: false,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = () => args[++i];
    switch (a) {
      case '-h':
      case '--help':
        opts.help = true;
        break;
      case '-V':
      case '--version':
        opts.version = true;
        break;
      case '-i':
      case '--input':
        opts.input = next();
        break;
      case '-f':
      case '--format':
        opts.format = next();
        break;
      case '-p':
      case '--pricing':
        opts.pricing = next();
        break;
      case '-b':
      case '--budget':
        opts.budget = Number(next());
        break;
      case '--warn-at':
        opts.warnAt = Number(next());
        break;
      case '--model-budget': {
        const pair = next();
        const eq = pair.indexOf('=');
        if (eq < 0) throw new Error(`--model-budget expects model=amount, got "${pair}"`);
        const key = pair.slice(0, eq).trim();
        const val = Number(pair.slice(eq + 1));
        if (!Number.isFinite(val)) throw new Error(`Invalid amount in --model-budget "${pair}"`);
        opts.modelBudget[key] = val;
        break;
      }
      case '--compare':
        opts.compare = next().split(',').map((s) => s.trim()).filter(Boolean);
        break;
      case '--format-output':
        opts.formatOutput = next();
        break;
      case '--fail-on':
        opts.failOn = next();
        break;
      default:
        if (a.startsWith('--')) throw new Error(`Unknown option: ${a}`);
        if (!opts.input) opts.input = a;
        else throw new Error(`Unexpected argument: ${a}`);
    }
  }
  return opts;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function getPkgVersion() {
  try {
    const url = new URL('../package.json', import.meta.url);
    return JSON.parse(readFileSync(url, 'utf8')).version;
  } catch {
    return 'unknown';
  }
}

async function main() {
  let opts;
  try {
    opts = parseArgs(argv.slice(2));
  } catch (err) {
    stderr.write(`${err.message}\n\n${USAGE}`);
    exit(2);
  }

  if (opts.help) {
    stdout.write(USAGE);
    return 0;
  }
  if (opts.version) {
    stdout.write(`${getPkgVersion()}\n`);
    return 0;
  }
  if (!opts.input) {
    stderr.write(`Missing --input.\n\n${USAGE}`);
    return 2;
  }

  const pricing = opts.pricing
    ? normalizePricing(JSON.parse(readFileSync(opts.pricing, 'utf8')))
    : loadPricing();

  let records;
  if (opts.input === '-') {
    const text = await readStdin();
    records = parseUsage(text, opts.format);
  } else {
    records = parseUsageFile(opts.input, opts.format);
  }

  const summary = summarize(records, pricing);
  const warnings = evaluateBudget(summary, {
    budget: opts.budget,
    warnAt: opts.warnAt,
    perModelBudget: opts.modelBudget,
  });
  const comparison = opts.compare ? compareAgainstModels(records, pricing, opts.compare) : null;

  if (opts.formatOutput === 'json') {
    stdout.write(renderJson(summary, warnings, comparison) + '\n');
  } else {
    stdout.write(renderTable(summary, warnings) + '\n');
    if (comparison) stdout.write(renderComparison(comparison, summary.currency) + '\n');
  }

  const sev = highestSeverity(warnings);
  if (opts.failOn === 'exceeded' && sev === Severity.EXCEEDED) return 1;
  if (opts.failOn === 'warn' && (sev === Severity.WARN || sev === Severity.EXCEEDED)) return 1;
  return 0;
}

main()
  .then((code) => exit(code ?? 0))
  .catch((err) => {
    stderr.write(`Error: ${err.message}\n`);
    exit(1);
  });
