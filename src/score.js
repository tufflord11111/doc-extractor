// Scores an extraction run against hand-written answer keys (<name>.expected.json).
// Usage: npm run score -- --out stress-output --key stress-test
// Reports field accuracy, OK/REVIEW accuracy, and "silent errors": wrong values in documents marked OK.
// Silent errors are the number that matters to a client: they are mistakes nobody would check.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const outDir = opt('out', 'output');
const keyDir = opt('key', 'samples');

const resultsFile = path.join(outDir, 'results.json');
if (!fs.existsSync(resultsFile)) { console.error(`No ${resultsFile}. Run npm run extract first.`); process.exit(1); }
const results = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));

const norm = (v) => (v === null || v === undefined ? null : String(v).toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim());
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const same = (got, want) => {
  if (isNum(want) || isNum(got)) return isNum(want) && isNum(got) && Math.abs(got - want) <= 0.005;
  if (typeof want === 'boolean') return got === want;
  return norm(got) === norm(want);
};

let fields = 0, correct = 0, statusRight = 0, scored = 0, silent = 0;
for (const r of results) {
  const keyFile = path.join(keyDir, r.file.replace(/\.[^.]+$/, '.expected.json'));
  if (!fs.existsSync(keyFile)) continue;
  const key = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  scored++;
  if (r.error) { console.log(`\nERROR  ${r.file}: ${r.error}`); continue; }

  const skip = new Set(key._skip || []);
  const wrong = [];
  const check = (label, got, want) => {
    if (skip.has(label)) return;
    fields++;
    if (same(got, want)) correct++; else wrong.push(`${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
  };

  for (const f of ['doc_type', 'supplier_name', 'document_number', 'document_date', 'currency', 'subtotal', 'tax', 'tax_inclusive', 'total']) {
    check(f, r.data[f] ?? (f === 'tax_inclusive' ? false : null), key[f] ?? (f === 'tax_inclusive' ? false : null));
  }
  const adjSum = (a) => Math.round((a || []).reduce((s, x) => s + x.amount, 0) * 100) / 100;
  check('adjustments (sum)', adjSum(r.data.adjustments), adjSum(key.adjustments));
  check('line count', r.data.line_items.length, key.line_items.length);
  key.line_items.forEach((want, i) => {
    const got = r.data.line_items[i] || {};
    for (const f of ['description', 'sku', 'quantity', 'unit_price', 'line_total']) check(`line ${i + 1} ${f}`, got[f] ?? null, want[f] ?? null);
  });

  const wantStatus = key._expect_status || 'OK';
  const statusOk = r.check.status === wantStatus;
  if (statusOk) statusRight++;
  if (r.check.status === 'OK') silent += wrong.length;

  console.log(`\n${wrong.length ? 'MISS ' : 'PASS '} ${r.file}  status ${r.check.status} (expected ${wantStatus})${statusOk ? '' : '  <-- wrong status'}`);
  wrong.forEach((w) => console.log(`       - ${w}`));
}

if (!scored) { console.error(`No answer keys in ${keyDir} match files in ${resultsFile}.`); process.exit(1); }
console.log(`\nField accuracy: ${correct}/${fields} (${((correct / fields) * 100).toFixed(1)}%)`);
console.log(`OK/REVIEW correct: ${statusRight}/${scored}`);
console.log(`Silent errors (wrong values in documents marked OK): ${silent}`);
