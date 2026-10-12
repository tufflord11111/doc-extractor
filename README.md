# doc-extractor

Turns supplier invoices, receipts and price lists (PDF, PNG, JPG) into a clean, **checked** spreadsheet using Claude.

Most "AI extraction" demos stop at "the AI read the PDF". This one checks the AI's work:
every line is re-calculated (qty x unit price = line total, lines add up to the subtotal, subtotal + tax = total),
dates and required fields are validated, and only values the model genuinely could not read go to a **Review queue** (general notes go to a separate Remarks column, so reviewers aren't flooded).
Each document comes out as `OK` or `REVIEW`, with the exact reason.

## Quick start (Windows PowerShell)

```powershell
cd $HOME\doc-extractor
npm install
npm run demo        # offline demo on 3 fictional sample documents, no API key needed
npm test            # 11 checks on the validation logic
npm run stress-demo # offline: 5 harder test documents, scored against answer keys
```

The demo writes `output\results.xlsx` with 3 sheets: **Documents**, **Line items** and **Review queue**.
One sample has a deliberate error (12 x 4.50 printed as 45.00) to show the review flag.

## Run it on real documents

1. Create an API key at console.anthropic.com (Settings -> API keys), with a small spend limit (e.g. US$10).
2. `Copy-Item .env.example .env`, then put the key in `.env`.
3. Put PDFs or images in a folder and run:

```powershell
npm run extract -- --in C:\path\to\folder --out output
```

Options: `--model claude-haiku-5-5` (cheapest; try on clean PDFs), `--concurrency 2`, `--date-format MDY` for US-style dates (default DMY).
Results are cached by file hash, so re-runs don't pay twice.
The run prints the API cost. Check current prices at https://platform.claude.com/docs/en/about-claude/pricing.

## Stress test (accuracy you can measure)

`stress-test/` holds 5 harder, fictional documents, each with a hand-written answer key:

| File | What it tests | Expected |
|---|---|---|
| `stress-cafe-receipt.jpg` | Phone photo of a receipt: tilted, noisy, service charge + GST on top | OK |
| `stress-online-order.pdf` | GST-inclusive prices, voucher discount, shipping fee | OK |
| `stress-us-quote.pdf` | 2 pages, 28 lines, US date (10/25/2026), USD, thousands separators, freight | OK |
| `stress-scanned-invoice.jpg` | Scan with a stain over one unit price: must be flagged, not guessed | REVIEW |
| `stress-invoice-total-wrong.pdf` | Printed total is S$10 too high | REVIEW |

```powershell
npm run extract -- --in stress-test --out stress-output
npm run score -- --out stress-output --key stress-test
```

The score reports field accuracy, OK/REVIEW accuracy, and **silent errors**: wrong values in documents marked OK.
Silent errors are the number a client cares about, because nobody re-checks a document marked OK.

## How it works

| Step | File | What it does |
|---|---|---|
| 1. Read | `src/extract.js` | Sends the PDF/image to Claude as a document block. Retries on rate limits, overload and network drops with back-off. Caches results. |
| 2. Structure | `src/schema.js` | `output_config.format` with a JSON schema, so the response always parses and matches the shape. The prompt forbids guessing and asks the model to list anything it was unsure about. |
| 3. Check | `src/validate.js` | Maths and field checks, including service charge, discounts, shipping and GST-inclusive totals. Any failure or AI uncertainty -> `REVIEW` with reasons. |
| 4. Deliver | `src/output.js` | `results.xlsx` (colour-coded status, filters, frozen headers) + `documents.csv` + `line-items.csv`. |
| 5. Score | `src/score.js` | Compares a run with answer keys: field accuracy, status accuracy, silent errors. |

## Use it on Upwork

Headline idea: **AI data automation: scraping + Claude pipelines that turn messy data into clean, checked spreadsheets**

Portfolio item text:
> Built an AI pipeline that turns supplier invoices and price lists (PDF/scans) into a clean Excel file.
> Every number is re-checked (line maths, subtotal, tax, total); anything uncertain is flagged for review instead of silently wrong.
> Stack: Node.js, Claude API (structured outputs), ExcelJS. Includes retries, caching and cost tracking.

Screenshots to add: the `Documents` sheet (one OK, one REVIEW), and the Review queue.

## Sample data

Everything in `samples/` is fictional and labelled SAMPLE. Don't put client documents in a public repo.
