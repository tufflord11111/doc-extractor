// Usage:
//   npm run extract -- --in path/to/folder [--out output] [--model claude-sonnet-5-5] [--date-format DMY|MDY]
//   npm run demo        (offline: uses samples/ and their .expected.json, no API key needed)
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { makeExtractor, SUPPORTED } from './extract.js';
import { validate } from './validate.js';
import { writeOutputs } from './output.js';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const flag = (name) => args.includes(`--${name}`);

const inDir = opt('in', 'input');
const outDir = opt('out', 'output');
const model = opt('model', process.env.MODEL || 'claude-sonnet-5-5');
const mock = flag('mock');
const concurrency = Number(opt('concurrency', 2));
const dateFormat = String(opt('date-format', process.env.DATE_FORMAT || 'DMY')).toUpperCase();
if (!['DMY', 'MDY'].includes(dateFormat)) { console.error('--date-format must be DMY or MDY'); process.exit(1); }

if (!fs.existsSync(inDir)) { console.error(`Input folder not found: ${inDir}`); process.exit(1); }
if (!mock && !process.env.ANTHROPIC_API_KEY) { console.error('Set ANTHROPIC_API_KEY in .env (or run npm run demo for the offline demo).'); process.exit(1); }

const files = fs.readdirSync(inDir).filter((f) => SUPPORTED.includes(path.extname(f).toLowerCase())).sort();
if (!files.length) { console.error(`No PDF/PNG/JPG files in ${inDir}`); process.exit(1); }

const extract = makeExtractor({ model, cacheDir: path.join(outDir, '.cache'), mockDir: mock ? inDir : null, dateFormat });
console.log(`${mock ? 'DEMO (offline)' : `Model ${model}`}: ${files.length} file(s) from ${inDir}\n`);

const results = [];
let next = 0, cost = 0;
async function worker() {
  while (next < files.length) {
    const f = files[next++];
    try {
      const r = await extract(path.join(inDir, f));
      const check = validate(r.data);
      cost += r.fromCache ? 0 : r.costUsd;
      results.push({ file: f, data: r.data, check });
      console.log(`${check.status === 'OK' ? 'OK    ' : 'REVIEW'} ${f}  (${r.data.line_items.length} lines${r.fromCache ? ', cached' : ''})`);
      check.issues.forEach((i) => console.log(`       - ${i}`));
    } catch (e) {
      results.push({ file: f, error: e.message });
      console.log(`ERROR  ${f}: ${e.message}`);
    }
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
results.sort((a, b) => a.file.localeCompare(b.file));

const out = await writeOutputs(outDir, results);
const ok = results.filter((r) => r.check?.status === 'OK').length;
console.log(`\n${ok}/${results.length} documents passed every check, ${results.length - ok} need a human look.`);
console.log(`${out.lines} line items -> ${out.xlsx} (+ documents.csv, line-items.csv)`);
if (!mock) console.log(`API cost this run: ~US$${cost.toFixed(4)}`);
