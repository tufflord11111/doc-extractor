"""Generates 5 FICTIONAL stress-test documents (all marked TEST DOCUMENT) plus answer keys.

They are harder than samples/: a photographed cafe receipt with service charge, a GST-inclusive
online order with a voucher and shipping, a 2-page US quote (MM/DD date, thousands separators),
a scanned invoice with a stain over one value, and an invoice whose printed total is wrong.

Requires: pip install pillow reportlab numpy   (only needed if you want to regenerate)
Run:      python stress-test/make_stress_test.py
"""
import json, os, random
from decimal import Decimal, ROUND_HALF_UP
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

D = os.path.dirname(os.path.abspath(__file__))
random.seed(7)
np.random.seed(7)
FONT_DIRS = ['/usr/share/fonts/truetype/dejavu', 'C:/Windows/Fonts']
BANNER = 'TEST DOCUMENT - FICTIONAL DATA, NOT A REAL TRANSACTION'


def money(x):
    return Decimal(str(x)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def font(name, size):
    for d in FONT_DIRS:
        p = os.path.join(d, name)
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def line(desc, qty, unit, sku=None):
    q, u = Decimal(str(qty)), money(unit)
    return {'description': desc, 'sku': sku, 'quantity': float(q), 'unit_price': float(u), 'line_total': float(money(q * u))}


def key(name, **kw):
    base = {'adjustments': [], 'tax_inclusive': False, 'uncertain_values': [], 'remarks': ''}
    base.update(kw)
    with open(os.path.join(D, f'{name}.expected.json'), 'w') as f:
        json.dump(base, f, indent=2)
        f.write('\n')


def photo_finish(img, angle, blur, noise, quality, path, bg=(92, 84, 76), pad=60):
    canvas_img = Image.new('RGB', (img.width + pad * 2, img.height + pad * 2), bg)
    canvas_img.paste(img, (pad, pad))
    canvas_img = canvas_img.rotate(angle, resample=Image.BICUBIC, expand=False, fillcolor=bg)
    arr = np.asarray(canvas_img).astype(np.int16)
    arr = np.clip(arr + np.random.normal(0, noise, arr.shape), 0, 255).astype(np.uint8)
    out = Image.fromarray(arr).filter(ImageFilter.GaussianBlur(blur))
    out.save(path, quality=quality) if path.endswith('.jpg') else out.save(path)


# 1. Cafe receipt photo: service charge 10% + GST 9% on top (common in SG F&B)
def cafe_receipt():
    items = [line('Iced Latte', 2, 6.50), line('Kaya Toast Set', 1, 5.80), line('Nasi Lemak', 2, 8.90)]
    sub = money(sum(Decimal(str(i['line_total'])) for i in items))
    svc = money(sub * Decimal('0.10'))
    gst = money((sub + svc) * Decimal('0.09'))
    total = sub + svc + gst
    W, f, fb, fs = 520, font('DejaVuSansMono.ttf', 22), font('DejaVuSansMono-Bold.ttf', 24), font('DejaVuSansMono.ttf', 15)
    img = Image.new('RGB', (W, 900), (250, 248, 240))
    d = ImageDraw.Draw(img)
    y = 20
    def c(text, fnt=f, dy=30):
        nonlocal y
        d.text(((W - d.textlength(text, font=fnt)) / 2, y), text, fill=(30, 30, 30), font=fnt); y += dy
    def lr(left, right, fnt=f, dy=30):
        nonlocal y
        d.text((24, y), left, fill=(30, 30, 30), font=fnt)
        d.text((W - 24 - d.textlength(right, font=fnt), y), right, fill=(30, 30, 30), font=fnt); y += dy
    c('TEST RECEIPT - FICTIONAL', fs, 26)
    c('KOPI LANE CAFE (FICTIONAL)', fb, 34)
    c('1 Sample Street #01-23', fs, 22); c('Singapore 000000', fs, 34)
    lr('Receipt: R0451-2291', '', fs, 22); lr('Date: 11/10/2026', '13:42', fs, 22); lr('Table 7', 'Pax 3', fs, 30)
    c('-' * 36, f, 28)
    for i in items:
        lr(f"{int(i['quantity'])} {i['description']}", f"{i['line_total']:.2f}")
        lr(f"   {int(i['quantity'])} x {i['unit_price']:.2f}", '', fs, 26)
    c('-' * 36, f, 28)
    lr('Subtotal', f'{sub}'); lr('Svc Chg 10%', f'{svc}'); lr('GST 9%', f'{gst}')
    lr('TOTAL', f'{total}', fb, 40)
    lr('PAYNOW', f'{total}', f, 40)
    c('Thank you! See you again', fs, 22)
    img = img.crop((0, 0, W, y + 30))
    photo_finish(img, angle=2.2, blur=0.8, noise=9, quality=68, path=os.path.join(D, 'stress-cafe-receipt.jpg'))
    key('stress-cafe-receipt', doc_type='receipt', supplier_name='Kopi Lane Cafe (fictional)', document_number='R0451-2291',
        document_date='2026-10-11', currency='SGD', line_items=items, subtotal=float(sub),
        adjustments=[{'label': 'Svc Chg 10%', 'amount': float(svc)}], tax=float(gst), total=float(total))


def pdf_header(cv, title_lines, y=800):
    cv.setFont('Helvetica', 8); cv.setFillColorRGB(0.7, 0, 0)
    cv.drawCentredString(297, 820, BANNER); cv.setFillColorRGB(0, 0, 0)
    for size, text in title_lines:
        cv.setFont('Helvetica-Bold' if size > 11 else 'Helvetica', size); cv.drawString(50, y, text); y -= size + 6
    return y


# 2. Online order: prices include GST, voucher discount, shipping fee
def online_order():
    items = [line('USB-C cable 1m (braided)', 2, 9.90, 'PP-CBL-1M'), line('Aluminium phone stand', 1, 15.90, 'PP-STD-01'),
             line('Tempered glass screen protector', 3, 7.50, 'PP-SCR-3')]
    sub = money(sum(Decimal(str(i['line_total'])) for i in items))
    voucher, ship = money(-5), money(2.99)
    total = sub + voucher + ship
    gst_incl = money(total * 9 / Decimal(109))
    cv = canvas.Canvas(os.path.join(D, 'stress-online-order.pdf'), pagesize=A4)
    y = pdf_header(cv, [(18, 'Pixel Pantry Online (fictional)'), (9, 'support@example.invalid  |  UEN 000000000X (fictional)'),
                        (14, 'TAX INVOICE / ORDER SUMMARY'), (10, 'Order No: PP-260119-0042'), (10, 'Order date: 12 Oct 2026'),
                        (10, 'Ship to: Test Customer, Singapore 000000')])
    y -= 14
    cols = [50, 120, 330, 390, 470]
    cv.setFont('Helvetica-Bold', 10)
    for x, h in zip(cols, ['SKU', 'Item', 'Qty', 'Price (S$)', 'Amount (S$)']): cv.drawString(x, y, h)
    cv.setFont('Helvetica', 10)
    for i in items:
        y -= 18
        for x, v in zip(cols, [i['sku'], i['description'], str(int(i['quantity'])), f"{i['unit_price']:.2f}", f"{i['line_total']:.2f}"]): cv.drawString(x, y, v)
    y -= 34
    for label, val in [('Merchandise subtotal', f'S${sub}'), ('Voucher SAVE5', f'-S${-voucher}'), ('Shipping fee', f'S${ship}')]:
        cv.drawString(330, y, label); cv.drawRightString(540, y, val); y -= 16
    cv.setFont('Helvetica-Bold', 12); cv.drawString(330, y - 4, 'Order total'); cv.drawRightString(540, y - 4, f'S${total}')
    cv.setFont('Helvetica', 9); cv.drawString(330, y - 22, f'All prices include GST. GST (9%) included: S${gst_incl}')
    cv.save()
    key('stress-online-order', doc_type='invoice', supplier_name='Pixel Pantry Online (fictional)', document_number='PP-260119-0042',
        document_date='2026-10-12', currency='SGD', line_items=items, subtotal=float(sub),
        adjustments=[{'label': 'Voucher SAVE5', 'amount': float(voucher)}, {'label': 'Shipping fee', 'amount': float(ship)}],
        tax=float(gst_incl), tax_inclusive=True, total=float(total))


# 3. Two-page US quotation: MM/DD date, USD, thousands separators, freight, no tax
def us_quote():
    sizes = ['6x6x6', '8x8x8', '10x8x6', '12x10x8', '12x12x12', '14x10x6', '16x12x10', '18x12x12', '20x14x10', '24x18x12']
    items = []
    for n in range(28):
        kind = n % 3
        if kind == 0:
            s = sizes[n // 3 % len(sizes)]
            items.append(line(f'Corrugated box {s} in, single wall', random.choice([250, 500, 1000, 1200, 2500]), random.choice([0.42, 0.58, 0.71, 0.89, 1.14, 1.36]), f'RB-{s.replace("x", "")}'))
        elif kind == 1:
            items.append(line(f'Packing tape 48mm x {random.choice([50, 100])}m, clear', random.choice([36, 72, 144]), random.choice([1.95, 2.40, 3.15]), f'RT-{n:03d}'))
        else:
            items.append(line(f'Poly mailer {random.choice(["10x13", "12x15.5", "14.5x19"])} in, {random.choice(["white", "grey"])}', random.choice([500, 1000, 2000]), random.choice([0.09, 0.12, 0.17]), f'RM-{n:03d}'))
    sub = money(sum(Decimal(str(i['line_total'])) for i in items))
    freight = money(145)
    total = sub + freight
    cv = canvas.Canvas(os.path.join(D, 'stress-us-quote.pdf'), pagesize=A4)
    def head():
        y = pdf_header(cv, [(18, 'Ridgeline Packaging Co. (fictional)'), (9, '100 Example Ave, Springfield, ST 00000, USA'),
                            (14, 'QUOTATION'), (10, 'Quote #: Q-77310'), (10, 'Date: 10/25/2026'), (10, 'Currency: USD'), (10, 'Valid for 30 days')])
        y -= 12
        cv.setFont('Helvetica-Bold', 9)
        for x, h in zip([50, 110, 360, 420, 490], ['Item #', 'Description', 'Qty', 'Unit $', 'Ext. $']): cv.drawString(x, y, h)
        cv.setFont('Helvetica', 9)
        return y
    y = head()
    for idx, i in enumerate(items):
        if idx == 18:
            cv.setFont('Helvetica', 8); cv.drawString(50, 40, 'Continued on page 2'); cv.drawRightString(540, 40, 'Page 1 of 2')
            cv.showPage(); y = head()
        y -= 16
        cv.drawString(50, y, i['sku']); cv.drawString(110, y, i['description'])
        cv.drawRightString(395, y, f"{int(i['quantity']):,}"); cv.drawRightString(465, y, f"{i['unit_price']:.2f}"); cv.drawRightString(540, y, f"{i['line_total']:,.2f}")
    y -= 30
    cv.setFont('Helvetica', 10)
    for label, val in [('Subtotal', f'{sub:,.2f}'), ('Freight (est.)', f'{freight:,.2f}'), ('Sales tax', 'not included')]:
        cv.drawString(380, y, label); cv.drawRightString(540, y, val); y -= 16
    cv.setFont('Helvetica-Bold', 12); cv.drawString(380, y - 4, 'TOTAL USD'); cv.drawRightString(540, y - 4, f'{total:,.2f}')
    cv.setFont('Helvetica', 8); cv.drawRightString(540, 40, 'Page 2 of 2')
    cv.save()
    key('stress-us-quote', doc_type='quotation', supplier_name='Ridgeline Packaging Co. (fictional)', document_number='Q-77310',
        document_date='2026-10-25', currency='USD', line_items=items, subtotal=float(sub),
        adjustments=[{'label': 'Freight (est.)', 'amount': float(freight)}], tax=None, total=float(total))


# 4. Scanned invoice with a stain covering one unit price -> must be flagged, not guessed
def scanned_invoice():
    items = [line('PVC pipe 20mm x 3m', 15, 4.20), line('Cable ties 200mm (100 pcs)', 4, 3.50),
             line('Wall plugs 8mm (50 pcs)', 6, 2.10), line('Silicone sealant clear 300ml', 2, 7.80)]
    sub = money(sum(Decimal(str(i['line_total'])) for i in items))
    gst = money(sub * Decimal('0.09'))
    total = sub + gst
    W, H = 1240, 1200
    img = Image.new('RGB', (W, H), (246, 244, 236))
    d = ImageDraw.Draw(img)
    f, fb, fh, fs = font('DejaVuSerif.ttf', 26), font('DejaVuSerif-Bold.ttf', 26), font('DejaVuSerif-Bold.ttf', 40), font('DejaVuSans.ttf', 18)
    d.text((80, 40), BANNER, fill=(170, 0, 0), font=fs)
    d.text((80, 90), 'LIM BROS HARDWARE (FICTIONAL)', fill=(20, 20, 20), font=fh)
    d.text((80, 145), 'Blk 000 Example Industrial Park, Singapore 000000', fill=(40, 40, 40), font=fs)
    d.text((80, 210), 'INVOICE', fill=(20, 20, 20), font=fh)
    d.text((80, 270), 'Invoice No: LB-5530', fill=(20, 20, 20), font=f)
    d.text((80, 310), 'Date: 07/10/2026', fill=(20, 20, 20), font=f)
    d.text((80, 350), 'Terms: 30 days', fill=(20, 20, 20), font=f)
    cols = [80, 600, 760, 960]
    y = 430
    for x, h in zip(cols, ['Description', 'Qty', 'Unit Price', 'Amount']): d.text((x, y), h, fill=(20, 20, 20), font=fb)
    d.line((80, y + 40, 1160, y + 40), fill=(60, 60, 60), width=2)
    stain_at = None
    for n, i in enumerate(items):
        y += 60
        d.text((80, y), i['description'], fill=(25, 25, 25), font=f)
        d.text((600, y), str(int(i['quantity'])), fill=(25, 25, 25), font=f)
        d.text((760, y), f"{i['unit_price']:.2f}", fill=(25, 25, 25), font=f)
        d.text((960, y), f"{i['line_total']:.2f}", fill=(25, 25, 25), font=f)
        if n == 2: stain_at = (760, y)
    y += 50
    d.line((600, y, 1160, y), fill=(60, 60, 60), width=2)
    for label, val in [('Subtotal', sub), ('GST 9%', gst)]:
        y += 45; d.text((760, y), label, fill=(25, 25, 25), font=f); d.text((960, y), f'{val}', fill=(25, 25, 25), font=f)
    y += 50; d.text((760, y), 'TOTAL S$', fill=(20, 20, 20), font=fb); d.text((960, y), f'{total}', fill=(20, 20, 20), font=fb)
    # coffee-style stain over line 3's unit price
    stain = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(stain)
    sx, sy = stain_at
    for _ in range(60):
        rx, ry = random.randint(-5, 100), random.randint(8, 24)
        r = random.randint(14, 24)
        sd.ellipse((sx + rx - r, sy + ry - r, sx + rx + r, sy + ry + r), fill=(84, 52, 24, 255))
    stain = stain.filter(ImageFilter.GaussianBlur(1.5))
    img = Image.alpha_composite(img.convert('RGBA'), stain).convert('RGB')
    photo_finish(img, angle=-0.9, blur=0.6, noise=11, quality=72, path=os.path.join(D, 'stress-scanned-invoice.jpg'), bg=(205, 205, 205), pad=30)
    key('stress-scanned-invoice', doc_type='invoice', supplier_name='Lim Bros Hardware (fictional)', document_number='LB-5530',
        document_date='2026-10-07', currency='SGD', line_items=items, subtotal=float(sub), tax=float(gst), total=float(total),
        uncertain_values=[{'field': 'line 3 unit_price', 'reason': 'covered by a stain'}],
        _skip=['line 3 unit_price'], _expect_status='REVIEW')


# 5. Invoice whose printed total is wrong (should be 261.60, printed 271.60)
def wrong_total():
    items = [line('Name cards, 500 pcs, matte', 2, 45.00), line('A5 flyers, 1000 pcs, gloss', 1, 120.00), line('Artwork adjustment fee', 1, 30.00)]
    sub = money(sum(Decimal(str(i['line_total'])) for i in items))
    gst = money(sub * Decimal('0.09'))
    printed_total = sub + gst + 10
    cv = canvas.Canvas(os.path.join(D, 'stress-invoice-total-wrong.pdf'), pagesize=A4)
    y = pdf_header(cv, [(18, 'Harbour Print Studio (fictional)'), (9, '2 Example Quay #02-02, Singapore 000000'),
                        (14, 'TAX INVOICE'), (10, 'Invoice: HPS-0918'), (10, 'Date: 09/10/2026'), (10, 'Currency: SGD')])
    y -= 14
    cols = [50, 330, 410, 480]
    cv.setFont('Helvetica-Bold', 10)
    for x, h in zip(cols, ['Description', 'Qty', 'Unit price', 'Amount']): cv.drawString(x, y, h)
    cv.setFont('Helvetica', 10)
    for i in items:
        y -= 18
        for x, v in zip(cols, [i['description'], str(int(i['quantity'])), f"{i['unit_price']:.2f}", f"{i['line_total']:.2f}"]): cv.drawString(x, y, v)
    y -= 34
    cv.drawString(380, y, 'Subtotal'); cv.drawRightString(540, y, f'{sub}')
    cv.drawString(380, y - 16, 'GST 9%'); cv.drawRightString(540, y - 16, f'{gst}')
    cv.setFont('Helvetica-Bold', 12); cv.drawString(380, y - 38, 'TOTAL'); cv.drawRightString(540, y - 38, f'{printed_total}')
    cv.save()
    key('stress-invoice-total-wrong', doc_type='invoice', supplier_name='Harbour Print Studio (fictional)', document_number='HPS-0918',
        document_date='2026-10-09', currency='SGD', line_items=items, subtotal=float(sub), tax=float(gst), total=float(printed_total),
        _expect_status='REVIEW')


if __name__ == '__main__':
    cafe_receipt(); online_order(); us_quote(); scanned_invoice(); wrong_total()
    print('Wrote 5 stress-test documents + answer keys to stress-test/')
