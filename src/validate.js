// Checks that turn "AI output" into "data you can trust".
// Every document gets status OK or REVIEW, with the exact reasons.

const close = (a, b) => Math.abs(a - b) <= Math.max(0.02, Math.abs(b) * 0.005); // 2 cents or 0.5%
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const r2 = (v) => Math.round(v * 100) / 100;

export function validate(doc) {
  const issues = [];
  const items = Array.isArray(doc.line_items) ? doc.line_items : [];

  if (!doc.supplier_name) issues.push('Supplier name missing');
  if (items.length === 0) issues.push('No line items found');
  if (doc.document_date && !/^\d{4}-\d{2}-\d{2}$/.test(doc.document_date)) {
    issues.push(`Date not in YYYY-MM-DD: "${doc.document_date}"`);
  } else if (doc.document_date && Number.isNaN(Date.parse(doc.document_date))) {
    issues.push(`Date is not a real date: "${doc.document_date}"`);
  }

  const billable = ['invoice', 'receipt', 'quotation'].includes(doc.doc_type);
  if (billable && !isNum(doc.total)) issues.push('Total missing');

  // Line maths: quantity x unit price = line total
  items.forEach((it, i) => {
    if (!it.description || !String(it.description).trim()) issues.push(`Line ${i + 1}: description missing`);
    if (isNum(it.quantity) && isNum(it.unit_price) && isNum(it.line_total)) {
      const expected = r2(it.quantity * it.unit_price);
      if (!close(expected, it.line_total)) {
        issues.push(`Line ${i + 1} "${String(it.description).slice(0, 40)}": ${it.quantity} x ${it.unit_price} = ${expected}, but document says ${it.line_total}`);
      }
    }
    if (isNum(it.unit_price) && it.unit_price < 0) issues.push(`Line ${i + 1}: negative unit price`);
  });

  // Document maths: lines add up to subtotal; subtotal + tax = total
  const lineTotals = items.map((it) => it.line_total).filter(isNum);
  if (lineTotals.length === items.length && lineTotals.length > 0) {
    const sum = r2(lineTotals.reduce((a, b) => a + b, 0));
    const target = isNum(doc.subtotal) ? doc.subtotal : (!isNum(doc.tax) && isNum(doc.total) ? doc.total : null);
    if (target !== null && !close(sum, target)) {
      issues.push(`Line totals add up to ${sum}, but ${isNum(doc.subtotal) ? 'subtotal' : 'total'} says ${target}`);
    }
  }
  // subtotal + adjustments (+ tax, unless prices already include it) = total
  const adjs = (Array.isArray(doc.adjustments) ? doc.adjustments : []).filter((a) => isNum(a.amount));
  const adjSum = r2(adjs.reduce((a, b) => a + b.amount, 0));
  const taxAdded = isNum(doc.tax) && !doc.tax_inclusive ? doc.tax : 0;
  if (isNum(doc.subtotal) && isNum(doc.total) && (isNum(doc.tax) || adjs.length)) {
    const expected = r2(doc.subtotal + adjSum + taxAdded);
    if (!close(expected, doc.total)) {
      const parts = [`Subtotal ${doc.subtotal}`, ...adjs.map((a) => `${a.label} ${a.amount}`), ...(taxAdded ? [`tax ${doc.tax}`] : [])];
      issues.push(`${parts.join(' + ')} = ${expected}, but total says ${doc.total}`);
    }
  }
  if (isNum(doc.tax) && doc.tax_inclusive && isNum(doc.total) && doc.tax > doc.total) issues.push(`Included tax ${doc.tax} is larger than total ${doc.total}`);

  (Array.isArray(doc.uncertain_values) ? doc.uncertain_values : []).forEach((u) => {
    issues.push(`AI unsure about ${u.field}: ${u.reason}`);
  });

  return { status: issues.length ? 'REVIEW' : 'OK', issues };
}
