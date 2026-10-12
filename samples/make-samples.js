// Generates 3 FICTIONAL test documents (clearly marked SAMPLE) plus the output we expect from them.
// They exist so the pipeline can be demoed and tested without any real customer data.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

const dir = path.dirname(fileURLToPath(import.meta.url));
const money = (n) => n.toFixed(2);

function invoicePdf(file, d) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(fs.createWriteStream(path.join(dir, file)));
  doc.fontSize(9).fillColor('#b00').text('SAMPLE DOCUMENT - FICTIONAL TEST DATA, NOT A REAL INVOICE', { align: 'center' }).fillColor('black');
  doc.moveDown().fontSize(18).text(d.supplier);
  doc.fontSize(10).text('10 Example Road, #01-01, Singapore 000000');
  doc.moveDown().fontSize(14).text(d.title);
  doc.fontSize(10).text(`${d.title === 'PRICE LIST' ? 'Ref' : 'Invoice No'}: ${d.number}`).text(`Date: ${d.datePrinted}`).text(`Currency: ${d.currency}`);
  doc.moveDown();
  const cols = d.priceList ? [50, 330, 450] : [50, 280, 340, 430];
  const head = d.priceList ? ['Item', 'SKU', 'Unit price'] : ['Description', 'Qty', 'Unit price', 'Amount'];
  let y = doc.y;
  doc.font('Helvetica-Bold');
  head.forEach((h, i) => doc.text(h, cols[i], y));
  doc.font('Helvetica');
  d.lines.forEach((l) => {
    y += 18;
    const cells = d.priceList ? [l.description, l.sku, money(l.unit_price)] : [l.description, String(l.quantity), money(l.unit_price), money(l.printedTotal ?? l.line_total)];
    cells.forEach((c, i) => doc.text(c, cols[i], y));
  });
  if (!d.priceList) {
    y += 30;
    doc.text(`Subtotal: ${money(d.subtotal)}`, 380, y).text(`GST 9%: ${money(d.tax)}`, 380, y + 16).font('Helvetica-Bold').text(`TOTAL: ${money(d.total)}`, 380, y + 32);
  }
  doc.end();
}

const okLines = [
  { description: 'Arabica coffee beans 1kg', sku: null, quantity: 10, unit_price: 28.5, line_total: 285 },
  { description: 'Paper cups 12oz (pack of 50)', sku: null, quantity: 20, unit_price: 6.2, line_total: 124 },
  { description: 'Oat milk 1L', sku: null, quantity: 24, unit_price: 3.9, line_total: 93.6 },
];
const okSub = 502.6, okTax = 45.23, okTotal = 547.83;

const errLines = [
  { description: 'Stainless steel tumbler 500ml', sku: null, quantity: 12, unit_price: 4.5, line_total: 45, printedTotal: 45 }, // 12 x 4.50 is 54.00
  { description: 'Gift box (small)', sku: null, quantity: 30, unit_price: 1.2, line_total: 36 },
];
const errSub = 81, errTax = 7.29, errTotal = 88.29;

const plLines = [
  { description: 'Bamboo toothbrush (soft)', sku: 'BT-001', quantity: null, unit_price: 2.8, line_total: null },
  { description: 'Refill shampoo bar 100g', sku: 'SB-100', quantity: null, unit_price: 9.5, line_total: null },
  { description: 'Beeswax food wrap (set of 3)', sku: 'BW-003', quantity: null, unit_price: 14.9, line_total: null },
];

invoicePdf('sample-invoice-ok.pdf', { supplier: 'Example Beans Trading (fictional)', title: 'TAX INVOICE', number: 'INV-1042', datePrinted: '03/10/2026', currency: 'SGD', lines: okLines, subtotal: okSub, tax: okTax, total: okTotal });
invoicePdf('sample-invoice-error.pdf', { supplier: 'Demo Homeware Supply (fictional)', title: 'TAX INVOICE', number: 'DH-2209', datePrinted: '05/10/2026', currency: 'SGD', lines: errLines, subtotal: errSub, tax: errTax, total: errTotal });
invoicePdf('sample-price-list.pdf', { supplier: 'Green Test Goods (fictional)', title: 'PRICE LIST', number: 'PL-OCT26', datePrinted: '01/10/2026', currency: 'SGD', lines: plLines, priceList: true });

const strip = (ls) => ls.map(({ printedTotal, ...l }) => l);
const expected = {
  'sample-invoice-ok': { doc_type: 'invoice', supplier_name: 'Example Beans Trading (fictional)', document_number: 'INV-1042', document_date: '2026-10-03', currency: 'SGD', line_items: strip(okLines), subtotal: okSub, adjustments: [], tax: okTax, tax_inclusive: false, total: okTotal, uncertain_values: [], remarks: '' },
  'sample-invoice-error': { doc_type: 'invoice', supplier_name: 'Demo Homeware Supply (fictional)', document_number: 'DH-2209', document_date: '2026-10-05', currency: 'SGD', line_items: strip(errLines), subtotal: errSub, adjustments: [], tax: errTax, tax_inclusive: false, total: errTotal, uncertain_values: [], remarks: '', _expect_status: 'REVIEW' },
  'sample-price-list': { doc_type: 'price_list', supplier_name: 'Green Test Goods (fictional)', document_number: 'PL-OCT26', document_date: '2026-10-01', currency: 'SGD', line_items: plLines, subtotal: null, adjustments: [], tax: null, tax_inclusive: false, total: null, uncertain_values: [], remarks: '' },
};
for (const [name, data] of Object.entries(expected)) fs.writeFileSync(path.join(dir, `${name}.expected.json`), JSON.stringify(data, null, 2) + '\n');
console.log('Wrote 3 sample PDFs + expected outputs to samples/');
