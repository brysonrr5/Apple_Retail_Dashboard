"""Independent check of the "Product revenue concentration" chart, straight from the source workbook.

Reads the .xlsx with the Python standard library only (no pandas needed), applies the same
cut-off as the dashboard (sales before 1 Nov 2024), ranks products by revenue and prints the
Top 10 and Top 20% shares plus the top and bottom products for a few filter combinations.
It does not use data/data.js, so it checks the whole pipeline, not just the chart code.

Run from the dashboard folder (takes a minute or two; the workbook is not copied anywhere):
    python3 prep/validation/check_concentration.py ~/Downloads/Apple_Sales_Data_3331_2.0.xlsx
"""
import collections
import datetime
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
RNS = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
CUTOFF = datetime.date(2024, 11, 1)  # November 2024 is incomplete and excluded, as in the dashboard


# ---------- minimal .xlsx reader ----------
def open_workbook(path):
    z = zipfile.ZipFile(path)
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        for _, el in ET.iterparse(z.open('xl/sharedStrings.xml')):
            if el.tag == NS + 'si':
                shared.append(''.join(t.text or '' for t in el.iter(NS + 't')))
                el.clear()
    wb = ET.parse(z.open('xl/workbook.xml')).getroot()
    rels = ET.parse(z.open('xl/_rels/workbook.xml.rels')).getroot()
    target = {r.get('Id'): r.get('Target') for r in rels}
    paths = {}
    for s in wb.iter(NS + 'sheet'):
        t = target[s.get(RNS + 'id')].lstrip('/')
        paths[s.get('name')] = t if t.startswith('xl/') else 'xl/' + t
    return z, shared, paths


def col_index(ref):
    n = 0
    for ch in re.match(r'[A-Z]+', ref).group():
        n = n * 26 + ord(ch) - 64
    return n - 1


def rows(book, name):
    """Yield each data row of a sheet as a dict keyed by the header row."""
    z, shared, paths = book
    header = None
    for _, el in ET.iterparse(z.open(paths[name])):
        if el.tag != NS + 'row':
            continue
        vals = {}
        for c in el.iter(NS + 'c'):
            v, t = c.find(NS + 'v'), c.get('t')
            if t == 'inlineStr':
                val = ''.join(x.text or '' for x in c.iter(NS + 't'))
            elif v is None:
                val = None
            elif t == 's':
                val = shared[int(v.text)]
            else:
                val = v.text
            vals[col_index(c.get('r'))] = val
        el.clear()
        line = [vals.get(i) for i in range(max(vals) + 1)] if vals else []
        if header is None:
            header = line
        else:
            yield dict(zip(header, line))


def to_date(v):
    try:
        return datetime.date(1899, 12, 30) + datetime.timedelta(days=float(v))  # Excel serial date
    except ValueError:
        return datetime.date.fromisoformat(str(v)[:10])


# ---------- load and aggregate ----------
def load(path):
    book = open_workbook(path)
    cats = {r['category_id']: r['category_name'] for r in rows(book, 'Category')}
    products = {r['Product_ID']: r for r in rows(book, 'Products')}
    country = {r['Store_ID']: r['Country'] for r in rows(book, 'Stores')}
    agg = collections.defaultdict(lambda: [0.0, 0.0])  # (product, year, country) -> [units, revenue]
    for r in rows(book, 'Sales'):
        d = to_date(r['sale_date'])
        if d >= CUTOFF:
            continue
        p = products[r['product_id']]
        q = float(r['quantity'])
        a = agg[(r['product_id'], d.year, country[r['store_id']])]
        a[0] += q
        a[1] += q * float(p['Price'])  # revenue = quantity × list price
    return cats, products, agg


def report(cats, products, agg, title, year=None, ctry=None, category=None):
    tot = collections.defaultdict(lambda: [0.0, 0.0])
    for (pid, y, c), (u, rv) in agg.items():
        if year not in (None, y) or ctry not in (None, c):
            continue
        if category is not None and cats[products[pid]['Category_ID']] != category:
            continue
        tot[pid][0] += u
        tot[pid][1] += rv
    ranked = sorted(tot.items(), key=lambda kv: -kv[1][1])
    n, total = len(ranked), sum(rv for _, (_, rv) in ranked)
    cum, run = [], 0.0
    for _, (_, rv) in ranked:
        run += rv
        cum.append(run / total)
    k20 = max(1, round(n * 0.2))  # 20% of products, rounded to the nearest whole product (89 -> 18)
    print(f'== {title}: {n} products, revenue ${total:,.0f}')
    if n > 10:
        print(f'   Top 10 products = {cum[9] * 100:.1f}% of revenue')
    print(f'   Top 20% of products ({k20} of {n}) = {cum[k20 - 1] * 100:.1f}% of revenue')
    for k, (pid, (u, rv)) in enumerate(ranked):
        if k < 3 or k >= n - 3:
            p = products[pid]
            print(f"   #{k + 1:<2} {p['Product_Name']} ({cats[p['Category_ID']]}): price ${float(p['Price']):,.0f}, "
                  f'units {u:,.0f}, revenue ${rv:,.0f}, cumulative {cum[k] * 100:.1f}%')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    cats, products, agg = load(sys.argv[1])
    report(cats, products, agg, 'No filters')
    report(cats, products, agg, '2022, Germany', year=2022, ctry='Germany')
    report(cats, products, agg, 'Laptop category', category='Laptop')
