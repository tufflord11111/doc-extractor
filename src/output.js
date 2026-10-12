import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';

export async function writeOutputs(outDir, results) {
  fs.mkdirSync(outDir, { recursive: true });

  const docHead = ['File', 'Status', 'Type', 'Supplier', 'Doc number', 'Date', 'Currency', 'Lines', 'Subtotal', 'Adjustments', 'Tax', 'Tax incl.', 'Total', 'Issues', 'Remarks'];
  const adjText = (d) => (d.adjustments || []).map((a) => `${a.label}: ${a.amount}`).join('; ');
  const docRows = results.map((r) => r.error
    ? [r.file, 'ERROR', '', '', '', '', '', '', '', '', '', '', '', r.error, '']
    : [r.file, r.check.status, r.data.doc_type, r.data.supplier_name, r.data.document_number, r.data.document_date,
       r.data.currency, r.data.line_items.length, r.data.subtotal, adjText(r.data), r.data.tax, r.data.tax_inclusive ? 'yes' : 'no', r.data.total, r.check.issues.join(' | '), r.data.remarks || '']);

  const lineHead = ['File', 'Supplier', 'Date', 'Currency', 'Description', 'SKU', 'Qty', 'Unit price', 'Line total', 'Doc status'];
  const lineRows = results.filter((r) => !r.error).flatMap((r) => r.data.line_items.map((it) =>
    [r.file, r.data.supplier_name, r.data.document_date, r.data.currency, it.description, it.sku, it.quantity, it.unit_price, it.line_total, r.check.status]));

  const reviewRows = results.filter((r) => r.error || r.check.status !== 'OK')
    .flatMap((r) => (r.error ? [[r.file, r.error]] : r.check.issues.map((i) => [r.file, i])));

  fs.writeFileSync(path.join(outDir, 'documents.csv'), toCsv([docHead, ...docRows]));
  fs.writeFileSync(path.join(outDir, 'line-items.csv'), toCsv([lineHead, ...lineRows]));
  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2)); // used by npm run score

  const wb = new ExcelJS.Workbook();
  const sheet = (name, head, rows, widths) => {
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.addRow(head).font = { bold: true };
    rows.forEach((r) => ws.addRow(r));
    ws.columns.forEach((c, i) => { c.width = widths[i] || 14; });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: head.length } };
    return ws;
  };
  const ws1 = sheet('Documents', docHead, docRows, [28, 9, 11, 26, 14, 12, 9, 7, 11, 26, 9, 8, 11, 70, 40]);
  ws1.eachRow((row, n) => {
    if (n === 1) return;
    const s = row.getCell(2).value;
    const color = s === 'OK' ? 'FFD9F2E3' : s === 'REVIEW' ? 'FFFFF1C2' : 'FFF8D0D0';
    row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
  });
  sheet('Line items', lineHead, lineRows, [28, 26, 12, 9, 42, 14, 7, 11, 11, 10]);
  sheet('Review queue', ['File', 'What to check'], reviewRows, [28, 110]);
  const xlsx = path.join(outDir, 'results.xlsx');
  await wb.xlsx.writeFile(xlsx);
  return { xlsx, docs: docRows.length, lines: lineRows.length, review: reviewRows.length };
}
