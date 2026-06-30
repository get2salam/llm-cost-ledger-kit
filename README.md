# LLM Cost Ledger Kit

A developer tool for estimating and comparing the cost of LLM API runs from
token-usage logs — no SaaS, no account, no telemetry. Point it at a JSONL/JSON/CSV
log of `(model, input_tokens, output_tokens)` records and it produces a per-model
cost breakdown, a what-if comparison against other models, and budget warnings
you can wire into CI.

Built on Node.js (≥ 20) using only the standard library and the built-in
`node:test` runner — zero npm dependencies.

## Why

Most teams discover LLM costs in arrears, from the provider invoice. By then
it's too late to choose a cheaper model, add prompt caching, or cap a runaway
job. This kit lets you:

- **Estimate** the cost of a workload **before** you ship it (replay a usage log
  against the pricing table).
- **Compare** the same token traffic against alternative models
  (e.g. "what would this cost on `gpt-4o-mini` instead of `gpt-4o`?").
- **Enforce** a budget in CI — the CLI exits non-zero when a run exceeds a
  threshold, so a regression turns into a red build instead of a surprise bill.

## Features

- **Multi-format parser** — JSONL, JSON arrays, JSON `{records: [...]}`,
  OpenAI-style nested `usage.{prompt,completion}_tokens`, and CSV. Format is
  auto-detected from the file extension or content; `--format` overrides.
- **Pricing table** — bundled prices for popular OpenAI, Anthropic, Google, and
  open-weight models, with version-suffix aliases
  (`claude-3-5-sonnet-20241022` → `claude-3-5-sonnet`). Override with
  `--pricing path/to/custom.json`; custom tables are validated up front so bad
  units, missing rates, or broken aliases fail before cost totals are produced.
- **Prompt caching aware** — `cached_input_tokens` are billed at the
  cached-input rate and subtracted from billable input tokens.
- **Budget warnings** — total budget plus per-model caps, with a configurable
  warn-at ratio. Three severity levels (`info`, `warn`, `exceeded`) and a
  `--fail-on` flag to control CI exit behavior.
- **Model-switch scoring** — re-prices your actual token totals against any set
  of candidate models and reports deterministic delta/savings metrics.
- **Table, labelled list, or JSON output** — pretty table for humans, a
  screen-reader-friendly list for accessibility, and JSON for pipelines.
- **Tested** — 45 tests covering the parser, calculator, budget logic,
  reporter, and the CLI itself (spawned end-to-end).
- **CI workflow** — GitHub Actions runs the test suite on every push.

## Quickstart

```bash
git clone https://github.com/get2salam/llm-cost-ledger-kit.git
cd llm-cost-ledger-kit

# No install step required — zero npm dependencies.
node bin/ledger.js --input fixtures/sample.jsonl --budget 0.20 \
  --compare gpt-4o-mini,claude-3-5-haiku,gemini-1.5-flash
```

You can also `npm link` to put `llm-cost-ledger` on your `$PATH`, or run with
`npx llm-cost-ledger-kit` once published.

## Example input

The CLI accepts any of these (auto-detected from extension or content):

**`usage.jsonl`** — one JSON object per line:

```jsonl
{"timestamp":"2026-01-15T09:12:33Z","model":"gpt-4o","input_tokens":1820,"output_tokens":420}
{"timestamp":"2026-01-15T09:14:01Z","model":"gpt-4o","input_tokens":2400,"output_tokens":612,"cached_input_tokens":800}
{"timestamp":"2026-01-15T09:18:11Z","model":"gpt-4o-mini","input_tokens":4500,"output_tokens":950}
```

**`usage.csv`** — header row + comma-separated values:

```csv
timestamp,model,input_tokens,output_tokens,cached_input_tokens
2026-01-15T09:12:33Z,gpt-4o,1820,420,0
2026-01-15T09:14:01Z,gpt-4o,2400,612,800
```

**OpenAI-style JSON** — recognised via `usage.prompt_tokens` /
`usage.completion_tokens`:

```json
{"records":[{"model":"gpt-4o","usage":{"prompt_tokens":1820,"completion_tokens":420}}]}
```

## Example output

Running the bundled fixture:

```bash
$ node bin/ledger.js --input fixtures/sample.jsonl --budget 0.20 \
    --compare gpt-4o-mini,claude-3-5-haiku,gemini-1.5-flash

LLM Cost Ledger
===============

Model                       Requests           Input          Output          Cost
----------------------------------------------------------------------------------
gpt-4o                             3           9,620           2,432       $0.0474
claude-3-5-sonnet                  2           4,380           1,120       $0.0299
o1-mini                            1           2,200           1,800       $0.0282
gemini-1.5-pro                     1           4,800           1,500       $0.0135
claude-3-5-haiku                   1           6,200           1,100       $0.0094
gpt-4o-mini                        2           7,800           1,570       $0.0021
----------------------------------------------------------------------------------
TOTAL                             10          35,000           9,522       $0.1305

Cost if every request used:
Model                                 Cost         Delta    Savings
-------------------------------------------------------------------
gemini-1.5-flash                   $0.0055       -$0.1250     95.8%
gpt-4o-mini                        $0.0109       -$0.1196     91.6%
claude-3-5-haiku                   $0.0661       -$0.0644     49.4%
```

A tighter budget surfaces warnings and a non-zero exit code:

```bash
$ node bin/ledger.js --input fixtures/sample.jsonl --budget 0.10 \
    --model-budget gpt-4o=0.04
...
Budget signals:
  [EXCEEDED] Total cost $0.1305 exceeds budget $0.1000 (130.5%).
  [EXCEEDED] Model "gpt-4o" cost $0.0474 exceeds cap $0.0400 (118.4%).
$ echo $?
1
```

For screen readers or narrow terminals, pass `--format-output list` to avoid
alignment-dependent tables:

```bash
node bin/ledger.js --input fixtures/sample.jsonl --format-output list --budget 0.20
```

For machine-readable output, pass `--format-output json`:

```bash
node bin/ledger.js --input fixtures/sample.jsonl --format-output json | jq .summary.total_cost
```

## CLI reference

```
Usage: llm-cost-ledger [options]

  -i, --input <path>          Path to usage log (.jsonl/.json/.csv). Use "-" for stdin.
  -f, --format <fmt>          Force format: jsonl | json | csv
  -p, --pricing <path>        Custom pricing JSON
  -b, --budget <amount>       Total budget
      --warn-at <ratio>       Fraction of budget at which to warn (default 0.8)
      --model-budget <m=amt>  Per-model cap (repeatable)
      --compare <models>      Comma-separated models to re-cost against
      --format-output <fmt>   table (default) | list | json
      --fail-on <level>       Exit non-zero on warn|exceeded (default: exceeded)
  -h, --help                  Show help
  -V, --version               Show version
```

## Project layout

```
llm-cost-ledger-kit/
├── bin/ledger.js          CLI entry point
├── src/
│   ├── parser.js          JSONL/JSON/CSV parsing + field normalization
│   ├── pricing.js         Pricing table loader and alias resolution
│   ├── calculator.js      Per-record costing, aggregation, what-if comparison
│   ├── budget.js          Budget evaluation and severity ranking
│   ├── reporter.js        Table and JSON output rendering
│   └── index.js           Public library exports
├── pricing.json           Bundled price list (per-million-token rates)
├── fixtures/              Sample JSONL / JSON / CSV inputs
├── test/                  node:test suite (parser, calc, budget, reporter, CLI)
└── .github/workflows/test.yml
```

## Using it as a library

```js
import {
  parseUsageFile,
  loadPricing,
  summarize,
  evaluateBudget,
} from 'llm-cost-ledger-kit';

const pricing = loadPricing();
const records = parseUsageFile('usage.jsonl');
const summary = summarize(records, pricing);
const warnings = evaluateBudget(summary, { budget: 5.0, warnAt: 0.8 });

console.log(summary.total_cost, warnings);
```

## Embedding cost analysis in scripts

The example below shows how to call the library API directly — no CLI, no
log file, and no npm install step required.  The script embeds a small inline
workload, loads the bundled pricing table, and prints a cost breakdown plus a
model-switch comparison showing which candidate would have been cheapest for
the same token traffic.

```bash
node examples/model-switch-analysis.js
```

```
=== Workload summary ===
Requests : 6
Input    : 48,500 tokens
Output   : 11,680 tokens
Cached   : 3,800 tokens
Cost     : $0.1931

=== Per-model cost ===
  gpt-4o                    $0.1242  (3 requests)
  claude-3-5-sonnet         $0.0654  (2 requests)
  gpt-4o-mini               $0.0035  (1 request)

=== Model-switch candidates (same token traffic) ===
  gemini-1.5-flash          $0.0071  saves $0.1860 (96.3% cheaper)
  gpt-4o-mini               $0.0140  saves $0.1791 (92.8% cheaper)
  claude-3-5-haiku          $0.0855  saves $0.1076 (55.7% cheaper)
  gemini-1.5-pro            $0.1190  saves $0.0741 (38.4% cheaper)

Switch to gemini-1.5-flash to save $0.1860 (96.3%) on this workload.

All self-checks passed.
```

The script includes inline `node:assert` guards at the end so it exits
non-zero if the comparison logic produces inconsistent results.  You can drop
it into a CI job alongside your build step to catch pricing-table regressions
before they reach production.

See [`examples/model-switch-analysis.js`](examples/model-switch-analysis.js)
for the full source.

## Pricing notes

`pricing.json` ships with example list prices in USD per **million** tokens.
Provider prices change — treat the bundled table as a starting point and
override with `--pricing custom.json` for production use. New models are easy to
add: drop them into the `models` map and (optionally) map any version suffixes
through `aliases`.

## Verification

```bash
npm test
```

This runs 45 `node:test` cases:

```
# tests 45
# pass 45
# fail 0
```

Same command runs in CI on every push and PR (`.github/workflows/test.yml`).

## License

MIT — see [LICENSE](LICENSE).
