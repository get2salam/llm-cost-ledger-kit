import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

const FIELD_ALIASES = {
  model: ['model', 'model_name', 'engine'],
  input_tokens: ['input_tokens', 'prompt_tokens', 'input', 'in_tokens'],
  output_tokens: ['output_tokens', 'completion_tokens', 'output', 'out_tokens'],
  cached_input_tokens: ['cached_input_tokens', 'cache_read_input_tokens', 'cached_tokens'],
  timestamp: ['timestamp', 'time', 'created_at', 'ts'],
  request_id: ['request_id', 'id', 'req_id'],
};

function pick(obj, keys) {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
      return obj[key];
    }
  }
  return undefined;
}

function toInt(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.trunc(n));
}

export function normalizeRecord(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new TypeError('Each usage record must be an object');
  }
  // Some providers nest under usage: { input_tokens, output_tokens }
  const merged = { ...raw, ...(raw.usage ?? {}) };

  const model = pick(merged, FIELD_ALIASES.model);
  if (!model || typeof model !== 'string') {
    throw new Error(`Usage record is missing a model field: ${JSON.stringify(raw)}`);
  }

  return {
    model: model.trim(),
    input_tokens: toInt(pick(merged, FIELD_ALIASES.input_tokens)),
    output_tokens: toInt(pick(merged, FIELD_ALIASES.output_tokens)),
    cached_input_tokens: toInt(pick(merged, FIELD_ALIASES.cached_input_tokens)),
    timestamp: pick(merged, FIELD_ALIASES.timestamp) ?? null,
    request_id: pick(merged, FIELD_ALIASES.request_id) ?? null,
  };
}

export function parseJsonl(text) {
  const records = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch (err) {
      throw new SyntaxError(`Invalid JSON on line ${i + 1}: ${err.message}`);
    }
    records.push(normalizeRecord(obj));
  }
  return records;
}

export function parseJson(text) {
  const parsed = JSON.parse(text);
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.records)
      ? parsed.records
      : Array.isArray(parsed?.data)
        ? parsed.data
        : null;
  if (!list) {
    throw new Error('JSON input must be an array, or an object with a "records" or "data" array');
  }
  return list.map(normalizeRecord);
}

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else if (ch === '"') {
      inQuotes = true;
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = cells[j];
    }
    records.push(normalizeRecord(row));
  }
  return records;
}

export function parseUsage(text, format) {
  const fmt = (format ?? '').toLowerCase();
  if (fmt === 'jsonl' || fmt === 'ndjson') return parseJsonl(text);
  if (fmt === 'json') return parseJson(text);
  if (fmt === 'csv') return parseCsv(text);

  // auto-detect
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    // Could still be JSONL if object-per-line. Try JSON first, fall back.
    try {
      return parseJson(trimmed);
    } catch {
      return parseJsonl(text);
    }
  }
  // Header-style detect for CSV vs JSONL
  const firstLine = trimmed.split(/\r?\n/, 1)[0];
  if (firstLine.includes(',') && !firstLine.includes('{')) return parseCsv(text);
  return parseJsonl(text);
}

export function parseUsageFile(path, format) {
  const text = readFileSync(path, 'utf8');
  const fmt = format ?? detectFormatFromPath(path);
  return parseUsage(text, fmt);
}

export function detectFormatFromPath(path) {
  const ext = extname(path).toLowerCase();
  if (ext === '.jsonl' || ext === '.ndjson') return 'jsonl';
  if (ext === '.json') return 'json';
  if (ext === '.csv') return 'csv';
  return null;
}
