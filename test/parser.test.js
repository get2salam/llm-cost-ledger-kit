import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  parseJsonl,
  parseJson,
  parseCsv,
  parseUsage,
  parseUsageFile,
  normalizeRecord,
  detectFormatFromPath,
} from '../src/parser.js';

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name) => resolve(here, '..', 'fixtures', name);

test('normalizeRecord accepts canonical fields', () => {
  const rec = normalizeRecord({
    model: 'gpt-4o',
    input_tokens: 100,
    output_tokens: 50,
    timestamp: 't',
    request_id: 'r',
  });
  assert.deepEqual(rec, {
    model: 'gpt-4o',
    input_tokens: 100,
    output_tokens: 50,
    cached_input_tokens: 0,
    timestamp: 't',
    request_id: 'r',
  });
});

test('normalizeRecord accepts OpenAI-style usage nesting and aliases', () => {
  const rec = normalizeRecord({
    model: 'gpt-4o',
    usage: { prompt_tokens: 1000, completion_tokens: 200 },
  });
  assert.equal(rec.input_tokens, 1000);
  assert.equal(rec.output_tokens, 200);
});

test('normalizeRecord coerces strings to integers and clamps negatives', () => {
  const rec = normalizeRecord({
    model: 'gpt-4o',
    input_tokens: '420',
    output_tokens: '-5',
  });
  assert.equal(rec.input_tokens, 420);
  assert.equal(rec.output_tokens, 0);
});

test('normalizeRecord rejects records without a model', () => {
  assert.throws(() => normalizeRecord({ input_tokens: 1 }), /model/);
  assert.throws(() => normalizeRecord(null));
});

test('parseJsonl skips blank lines and reports bad lines', () => {
  const out = parseJsonl(
    '{"model":"gpt-4o","input_tokens":1,"output_tokens":1}\n\n{"model":"gpt-4o-mini","input_tokens":2,"output_tokens":2}\n',
  );
  assert.equal(out.length, 2);
  assert.throws(
    () => parseJsonl('{"model":"gpt-4o","input_tokens":1}\nnot-json\n'),
    /line 2/,
  );
});

test('parseJson accepts array, {records}, {data}', () => {
  const arr = parseJson('[{"model":"gpt-4o","input_tokens":1,"output_tokens":1}]');
  assert.equal(arr.length, 1);
  const obj = parseJson('{"records":[{"model":"gpt-4o","input_tokens":1,"output_tokens":1}]}');
  assert.equal(obj.length, 1);
  const data = parseJson('{"data":[{"model":"gpt-4o","input_tokens":1,"output_tokens":1}]}');
  assert.equal(data.length, 1);
  assert.throws(() => parseJson('{"oops":true}'), /array/);
});

test('parseCsv handles quoted fields and aliases', () => {
  const csv = 'model,prompt_tokens,completion_tokens\n"gpt-4o",100,50\n"gpt-4o-mini",200,75\n';
  const out = parseCsv(csv);
  assert.equal(out.length, 2);
  assert.equal(out[0].input_tokens, 100);
  assert.equal(out[1].output_tokens, 75);
});

test('parseUsage auto-detects formats', () => {
  assert.equal(parseUsage('').length, 0);
  assert.equal(
    parseUsage('{"model":"gpt-4o","input_tokens":1,"output_tokens":1}').length,
    1,
  );
  assert.equal(
    parseUsage('[{"model":"gpt-4o","input_tokens":1,"output_tokens":1}]').length,
    1,
  );
  assert.equal(parseUsage('model,input_tokens,output_tokens\ngpt-4o,1,1\n').length, 1);
});

test('detectFormatFromPath maps extensions', () => {
  assert.equal(detectFormatFromPath('a.jsonl'), 'jsonl');
  assert.equal(detectFormatFromPath('a.ndjson'), 'jsonl');
  assert.equal(detectFormatFromPath('a.json'), 'json');
  assert.equal(detectFormatFromPath('a.csv'), 'csv');
  assert.equal(detectFormatFromPath('a.txt'), null);
});

test('parseUsageFile reads bundled fixtures', () => {
  const jsonl = parseUsageFile(fx('sample.jsonl'));
  assert.equal(jsonl.length, 10);
  assert.equal(jsonl[1].cached_input_tokens, 800);

  const csv = parseUsageFile(fx('sample.csv'));
  assert.equal(csv.length, 6);

  const json = parseUsageFile(fx('sample.json'));
  assert.equal(json.length, 3);
  assert.equal(json[0].input_tokens, 1820);
});
