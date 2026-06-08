import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const CLI = resolve(root, 'bin', 'ledger.js');
const FIXTURE = resolve(root, 'fixtures', 'sample.jsonl');

function runCli(args, { input } = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    input,
  });
}

test('CLI --help prints usage', () => {
  const r = runCli(['--help']);
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes('Usage:'));
  assert.ok(r.stdout.includes('--budget'));
});

test('CLI summarizes a JSONL fixture in table format', () => {
  const r = runCli(['--input', FIXTURE]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes('LLM Cost Ledger'));
  assert.ok(r.stdout.includes('gpt-4o'));
  assert.ok(r.stdout.includes('TOTAL'));
});

test('CLI emits JSON when --format-output json', () => {
  const r = runCli(['--input', FIXTURE, '--format-output', 'json']);
  assert.equal(r.status, 0, r.stderr);
  const payload = JSON.parse(r.stdout);
  assert.ok(payload.summary.total_cost > 0);
  assert.ok(Array.isArray(payload.summary.models));
});

test('CLI exits non-zero when budget is exceeded', () => {
  const r = runCli(['--input', FIXTURE, '--budget', '0.001']);
  assert.equal(r.status, 1);
  assert.ok(r.stdout.includes('EXCEEDED'));
});

test('CLI exits zero when budget is comfortably high', () => {
  const r = runCli(['--input', FIXTURE, '--budget', '1000']);
  assert.equal(r.status, 0, r.stderr);
});

test('CLI accepts usage on stdin with "-"', () => {
  const sample = '{"model":"gpt-4o","input_tokens":1000,"output_tokens":500}\n';
  const r = runCli(['--input', '-', '--format', 'jsonl', '--format-output', 'json'], {
    input: sample,
  });
  assert.equal(r.status, 0, r.stderr);
  const payload = JSON.parse(r.stdout);
  assert.equal(payload.summary.total_requests, 1);
});

test('CLI --compare shows alternative costs', () => {
  const r = runCli(['--input', FIXTURE, '--compare', 'gpt-4o-mini,claude-3-5-haiku']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes('Cost if every request used'));
  assert.ok(r.stdout.includes('gpt-4o-mini'));
  assert.ok(r.stdout.includes('claude-3-5-haiku'));
});

test('CLI fails with an unknown option', () => {
  const r = runCli(['--nope']);
  assert.equal(r.status, 2);
  assert.ok(r.stderr.includes('Unknown option'));
});
