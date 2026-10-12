// The JSON shape Claude must return. Used with output_config.format (structured outputs),
// so the response is guaranteed to parse and match this schema.
const num = { anyOf: [{ type: 'number' }, { type: 'null' }] };
const str = { anyOf: [{ type: 'string' }, { type: 'null' }] };

export const extractionSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'doc_type', 'supplier_name', 'document_number', 'document_date', 'currency',
    'line_items', 'subtotal', 'adjustments', 'tax', 'tax_inclusive', 'total', 'uncertain_values', 'remarks',
  ],
  properties: {
    doc_type: { type: 'string', enum: ['invoice', 'price_list', 'receipt', 'quotation', 'other'] },
    supplier_name: str,
    document_number: str,
    document_date: { ...str, description: 'ISO date YYYY-MM-DD, or null if not shown' },
    currency: { ...str, description: 'ISO 4217 code such as SGD, USD, MYR, or null' },
    line_items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['description', 'sku', 'quantity', 'unit_price', 'line_total'],
        properties: {
          description: { type: 'string' },
          sku: str,
          quantity: num,
          unit_price: num,
          line_total: num,
        },
      },
    },
    subtotal: num,
    adjustments: {
      type: 'array',
      description: 'Document-level charges or deductions between subtotal and total: service charge, discount/voucher (negative), delivery/shipping/freight, rounding. Empty array if none.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'amount'],
        properties: { label: { type: 'string' }, amount: { type: 'number', description: 'Negative for discounts' } },
      },
    },
    tax: num,
    tax_inclusive: { type: 'boolean', description: 'true if prices already include the tax (e.g. "GST included"), so tax is not added on top' },
    total: num,
    uncertain_values: {
      type: 'array',
      description: 'Only values that are unreadable, cut off, contradictory, or have two plausible readings the rules do not resolve. Empty array if none.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['field', 'reason'],
        properties: {
          field: { type: 'string', description: 'e.g. "total" or "line 2 unit_price"' },
          reason: { type: 'string' },
        },
      },
    },
    remarks: { type: 'string', description: 'Optional short observations that do NOT need human review. Empty string if none.' },
  },
};

// Bump when the prompt or schema changes, so cached results from older versions are not reused.
export const PROMPT_VERSION = 'v3';

export const systemPrompt = ({ dateFormat = 'DMY' } = {}) => `You extract data from supplier documents (invoices, price lists, receipts, quotations) for a small business.

Rules:
- Copy values exactly as printed. Never guess or invent a value. If a field is not on the document, use null.
- Numbers: plain numbers without currency symbols or thousands separators (e.g. 1299.5).
- Dates: convert to YYYY-MM-DD. Numeric dates on these documents are ${dateFormat === 'MDY' ? 'MM/DD/YYYY' : 'DD/MM/YYYY'}; apply that convention without flagging it. If a date is impossible under that convention (e.g. 10/25/2026), use the only valid reading.
- One line_item per product/service row. Skip headers, subtotal and total rows.
- subtotal is the sum of the line items before any adjustments. Service charge, discounts/vouchers (negative), delivery/shipping and rounding go in adjustments, not line_items.
- tax: the tax/GST amount shown. Set tax_inclusive true when the document says prices or the total already include it.
- For price lists without quantities, set quantity and line_total to null and put the price in unit_price.
- uncertain_values: list a value ONLY if it is unreadable, cut off, handwritten and unclear, contradicts another value, or has two plausible readings these rules do not resolve. A field that is simply not on the document is null, not uncertain. Do not comment on watermarks, sample labels or missing optional fields.
- remarks: optional short notes that need no action. Keep it empty unless useful.`;
