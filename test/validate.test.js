import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../src/validate.js';

const base = {
  doc_type: 'invoice', supplier_name: 'Example Co', document_number: '1', document_date: '2026-10-03', currency: 'SGD',
  line_items: [{ description: 'A', sku: null, quantity: 2, unit_price: 10, line_total: 20 }],
  subtotal: 20, tax: 1.8, total: 21.8, uncertain_values: [], remarks: '',
};

test('clean invoice passes', () => {
  assert.deepEqual(validate(base), { status: 'OK', issues: [] });
});

test('line maths error is flagged', () => {
  const r = validate({ ...base, line_items: [{ ...base.line_items[0], line_total: 25 }], subtotal: 25, total: 26.8 });
  assert.equal(r.status, 'REVIEW');
  assert.match(r.issues.join(' '), /2 x 10 = 20/);
});

test('subtotal + tax must equal total', () => {
  const r = validate({ ...base, total: 30 });
  assert.equal(r.status, 'REVIEW');
  assert.match(r.issues.join(' '), /Subtotal 20 \+ tax 1.8/);
});

test('rounding within 2 cents is accepted', () => {
  const r = validate({ ...base, line_items: [{ description: 'A', sku: null, quantity: 3, unit_price: 3.33, line_total: 10 }], subtotal: 10, tax: 0.9, total: 10.9 });
  assert.equal(r.status, 'OK');
});

test('price list without quantities passes', () => {
  const r = validate({ ...base, doc_type: 'price_list', line_items: [{ description: 'B', sku: 'X1', quantity: null, unit_price: 5, line_total: null }], subtotal: null, tax: null, total: null });
  assert.equal(r.status, 'OK');
});

test('AI uncertainty always goes to review', () => {
  const r = validate({ ...base, uncertain_values: [{ field: 'line 1 unit_price', reason: 'blurry' }] });
  assert.equal(r.status, 'REVIEW');
});

test('remarks alone do not trigger review', () => {
  assert.equal(validate({ ...base, remarks: 'Sample watermark present' }).status, 'OK');
});

test('bad date and missing supplier flagged', () => {
  const r = validate({ ...base, supplier_name: null, document_date: '03/10/2026' });
  assert.equal(r.issues.length, 2);
});

test('service charge + GST on top passes (SG cafe receipt)', () => {
  const r = validate({ ...base, doc_type: 'receipt', line_items: [{ description: 'Latte', sku: null, quantity: 2, unit_price: 6.5, line_total: 13 }],
    subtotal: 13, adjustments: [{ label: 'Svc Chg 10%', amount: 1.3 }], tax: 1.29, tax_inclusive: false, total: 15.59 });
  assert.equal(r.status, 'OK');
});

test('GST-inclusive order with voucher and shipping passes', () => {
  const r = validate({ ...base, subtotal: 20, line_items: [{ description: 'A', sku: null, quantity: 2, unit_price: 10, line_total: 20 }],
    adjustments: [{ label: 'Voucher', amount: -5 }, { label: 'Shipping', amount: 2.99 }], tax: 1.48, tax_inclusive: true, total: 17.99 });
  assert.equal(r.status, 'OK');
});

test('wrong total is flagged even with adjustments', () => {
  const r = validate({ ...base, adjustments: [{ label: 'Delivery', amount: 5 }], total: 36.8 });
  assert.equal(r.status, 'REVIEW');
  assert.match(r.issues.join(' '), /Delivery 5/);
});
