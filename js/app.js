/* app.js — filters, KPI calculations and chart updates for the Apple Retail dashboard.
 *
 * Data comes from data/data.js (built by prep.py) as two pre-aggregated tables:
 *   cubeA: one row per month × store × category
 *          [monthIndex, storeIndex, categoryIndex, units, revenue, sales, claimsCompleted, claimsInProgress, claimsPending, claimsRejected]
 *   cubeB: one row per year × country × product
 *          [yearIndex, countryIndex, productIndex, units, revenue, sales]
 * monthIndex 0 = Jan 2020, 57 = Oct 2024. Every filter change re-sums these rows, so all
 * KPIs and charts always describe the same slice of data.
 */
(() => {
  const D = DASHBOARD_DATA;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const N_MONTHS = D.meta.months; // 58
  const FIRST_YEAR = 2020;
  const yearOf = (mi) => FIRST_YEAR + Math.floor(mi / 12);
  const monthOf = (mi) => mi % 12;
  const YEARS = [...new Set(Array.from({ length: N_MONTHS }, (_, i) => yearOf(i)))];
  const monthsInYear = (y) => Math.max(0, Math.min(12, N_MONTHS - (y - FIRST_YEAR) * 12));
  const LAST_LABEL = `${MONTHS[monthOf(N_MONTHS - 1)]} ${yearOf(N_MONTHS - 1)}`;
  const storeCountry = D.stores.map((s) => s[1]);
  const productCategory = D.products.map((p) => p[1]);
  const color = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  // Current selections. 'all' means no filter; otherwise a year number or a list index.
  const state = { year: 'all', country: 'all', category: 'all', products: 'top', stores: 'top' };

  // ---------- number formatting ----------
  function money(v) {
    const a = Math.abs(v);
    if (a >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `$${(v / 1e6).toFixed(a < 1e7 ? 2 : 1)}M`;
    if (a >= 1e4) return `$${(v / 1e3).toFixed(0)}K`;
    return `$${Math.round(v).toLocaleString('en-US')}`;
  }
  function axisMoney(v) {
    if (v === 0) return '$0';
    if (v >= 1e9) return `$${+(v / 1e9).toFixed(1)}B`;
    if (v >= 1e6) return `$${+(v / 1e6).toFixed(2)}M`; // 2 decimals so close-together ticks (e.g. $101.25M) stay distinct; trailing zeros are dropped
    if (v >= 1e3) return `$${+(v / 1e3).toFixed(1)}K`;
    return `$${v}`;
  }
  const int = (v) => Math.round(v).toLocaleString('en-US');
  const pct = (v, d = 1) => `${(v * 100).toFixed(d)}%`;
  const fullMoney = (v) => `$${Math.round(v).toLocaleString('en-US')}`;

  // ---------- filtering and totals ----------
  function rowsA({ year = state.year, country = state.country, category = state.category } = {}) {
    return D.cubeA.filter((r) =>
      (year === 'all' || yearOf(r[0]) === year) &&
      (country === 'all' || storeCountry[r[1]] === country) &&
      (category === 'all' || r[2] === category));
  }
  function rowsB() {
    return D.cubeB.filter((r) =>
      (state.year === 'all' || r[0] + FIRST_YEAR === state.year) &&
      (state.country === 'all' || r[1] === state.country) &&
      (state.category === 'all' || productCategory[r[2]] === state.category));
  }
  function totals(rows) {
    const t = { units: 0, rev: 0, n: 0, claims: [0, 0, 0, 0] };
    for (const r of rows) {
      t.units += r[3]; t.rev += r[4]; t.n += r[5];
      for (let k = 0; k < 4; k++) t.claims[k] += r[6 + k];
    }
    t.claimTotal = t.claims.reduce((a, b) => a + b, 0);
    return t;
  }
  function sumBy(rows, keyIndex, size) {
    const out = Array.from({ length: size }, () => ({ rev: 0, units: 0, n: 0 }));
    for (const r of rows) { const o = out[r[keyIndex]]; o.rev += r[4]; o.units += r[3]; o.n += r[5]; }
    return out;
  }
  const storesInView = () => (state.country === 'all' ? D.stores.length : storeCountry.filter((c) => c === state.country).length);
  const monthsInView = () => (state.year === 'all' ? N_MONTHS : monthsInYear(state.year));

  // Same months of the previous year (e.g. 2024 has Jan–Oct, so compare with Jan–Oct 2023)
  function priorPeriod() {
    const y = state.year;
    if (y === 'all' || !YEARS.includes(y - 1)) return null;
    const k = monthsInYear(y);
    const rows = rowsA({ year: y - 1 }).filter((r) => monthOf(r[0]) < k);
    const label = k === 12 ? `${y - 1}` : `${MONTHS[0]}–${MONTHS[k - 1]} ${y - 1}`;
    return { rows, label, months: k };
  }

  // ---------- KPI tiles ----------
  function setKpi(id, value, delta) {
    const tile = document.getElementById(id);
    tile.querySelector('.kpi-value').textContent = value;
    const d = tile.querySelector('.kpi-delta');
    d.textContent = delta.text;
    d.className = `kpi-delta ${delta.tone}`;
  }
  // higherIsBetter decides whether an increase is shown as good (green) or bad (red)
  function changeText(cur, prev, label, higherIsBetter = true, asPoints = false) {
    if (prev == null) {
      if (state.year === 'all') return { text: `${MONTHS[0]} ${FIRST_YEAR} – ${LAST_LABEL}`, tone: 'neutral' };
      return { text: 'First year: no prior year', tone: 'neutral' };
    }
    const diff = asPoints ? (cur - prev) * 100 : (cur - prev) / prev;
    const shown = asPoints ? `${Math.abs(diff).toFixed(2)} pts` : pct(Math.abs(diff));
    if ((asPoints && Math.abs(diff) < 0.005) || (!asPoints && Math.abs(diff) < 0.0005)) return { text: `No change vs ${label}`, tone: 'neutral' };
    const up = diff > 0;
    return { text: `${up ? '▲' : '▼'} ${shown} vs ${label}`, tone: up === higherIsBetter ? 'good' : 'bad' };
  }
  function renderKpis() {
    const cur = totals(rowsA());
    const prior = priorPeriod();
    const prev = prior ? totals(prior.rows) : null;
    const stores = storesInView();
    const lbl = prior ? prior.label : '';
    const perStore = (t, months) => t.rev / (stores * months);

    setKpi('kpi-revenue', money(cur.rev), changeText(cur.rev, prev && prev.rev, lbl));
    setKpi('kpi-units', int(cur.units), changeText(cur.units, prev && prev.units, lbl));
    setKpi('kpi-aov', fullMoney(cur.n ? cur.rev / cur.n : 0), changeText(cur.rev / cur.n, prev && prev.rev / prev.n, lbl));
    setKpi('kpi-store', money(perStore(cur, monthsInView())), changeText(perStore(cur, monthsInView()), prev && perStore(prev, prior.months), lbl));
    setKpi('kpi-claims', pct(cur.n ? cur.claimTotal / cur.n : 0, 2),
      changeText(cur.claimTotal / cur.n, prev && prev.claimTotal / prev.n, lbl, false, true));
  }

  // ---------- table view (every chart has one) ----------
  const tableData = {};
  function renderTable(cardId) {
    const card = document.getElementById(cardId);
    const box = card.querySelector('.table-view');
    const t = tableData[cardId];
    box.replaceChildren();
    if (!t) return;
    const table = document.createElement('table');
    const head = table.createTHead().insertRow();
    t.columns.forEach((c) => { const th = document.createElement('th'); th.textContent = c.label; if (c.num) th.className = 'num'; head.appendChild(th); });
    const body = table.createTBody();
    t.rows.forEach((row) => {
      const tr = body.insertRow();
      row.forEach((v, i) => { const td = tr.insertCell(); td.textContent = v; if (t.columns[i].num) td.className = 'num'; });
    });
    box.appendChild(table);
  }

  // ---------- chart: monthly revenue trend ----------
  function renderTrend() {
    const container = document.getElementById('chart-trend');
    const legend = document.getElementById('trend-legend');
    const blue = color('--series-1'), gray = color('--series-muted');
    legend.replaceChildren();

    if (state.year === 'all') {
      const values = new Array(N_MONTHS).fill(0);
      rowsA().forEach((r) => { values[r[0]] += r[4]; });
      const labels = values.map((_, i) => `${MONTHS_LONG[monthOf(i)]} ${yearOf(i)}`);
      document.getElementById('trend-sub').textContent = `USD per month, Jan 2020 – ${LAST_LABEL} · axis does not start at $0`;
      Charts.line(container, {
        labels,
        ticks: values.map((_, i) => i).filter((i) => monthOf(i) === 0),
        tickText: (i) => String(yearOf(i)),
        series: [{ name: 'Revenue', color: blue, values }],
      }, { format: money, axisFormat: axisMoney, ariaLabel: 'Monthly revenue over time' });
      tableData['card-trend'] = {
        columns: [{ label: 'Month' }, { label: 'Revenue (USD)', num: true }],
        rows: values.map((v, i) => [labels[i], fullMoney(v)]),
      };
    } else {
      const y = state.year;
      const cur = new Array(12).fill(null), prev = new Array(12).fill(null);
      rowsA().forEach((r) => { const m = monthOf(r[0]); cur[m] = (cur[m] || 0) + r[4]; });
      const hasPrev = YEARS.includes(y - 1);
      if (hasPrev) rowsA({ year: y - 1 }).forEach((r) => { const m = monthOf(r[0]); prev[m] = (prev[m] || 0) + r[4]; });
      const series = [];
      if (hasPrev) series.push({ name: String(y - 1), color: gray, values: prev });
      series.push({ name: String(y), color: blue, values: cur });
      [...series].reverse().forEach((s) => {
        const item = document.createElement('span');
        const key = document.createElement('i'); key.style.background = s.color; item.appendChild(key);
        item.appendChild(document.createTextNode(s.name));
        legend.appendChild(item);
      });
      document.getElementById('trend-sub').textContent = `USD per month, ${y}${hasPrev ? ` vs ${y - 1}` : ''}${monthsInYear(y) < 12 ? ` · data ends ${LAST_LABEL}` : ''} · axis does not start at $0`;
      Charts.line(container, {
        labels: MONTHS_LONG,
        ticks: MONTHS.map((_, i) => i),
        tickText: (i) => MONTHS[i],
        series,
      }, { format: money, axisFormat: axisMoney, ariaLabel: `Monthly revenue in ${y}` });
      tableData['card-trend'] = {
        columns: [{ label: 'Month' }, { label: `${y} revenue`, num: true }].concat(hasPrev ? [{ label: `${y - 1} revenue`, num: true }] : []),
        rows: MONTHS_LONG.map((m, i) => [m, cur[i] == null ? '—' : fullMoney(cur[i])].concat(hasPrev ? [prev[i] == null ? '—' : fullMoney(prev[i])] : [])),
      };
    }
  }

  // ---------- chart: revenue by category ----------
  function renderCategory() {
    const sums = sumBy(rowsA({ category: 'all' }), 2, D.categories.length);
    const total = sums.reduce((a, s) => a + s.rev, 0);
    const blue = color('--series-1'), gray = color('--series-muted');
    const items = sums
      .map((s, i) => ({ i, ...s }))
      .sort((a, b) => b.rev - a.rev)
      .map((s) => ({
        label: D.categories[s.i],
        value: s.rev,
        valueText: `${money(s.rev)} · ${pct(s.rev / total, 0)}`,
        color: state.category === 'all' || state.category === s.i ? blue : gray,
        tipRows: [{ value: fullMoney(s.rev), label: 'revenue' }, { value: pct(s.rev / total), label: 'share' }, { value: int(s.units), label: 'units' }],
      }));
    Charts.hBar(document.getElementById('chart-category'), items, { valueWidth: 92, maxLabelShare: 0.4, ariaLabel: 'Revenue by product category' });
    tableData['card-category'] = {
      columns: [{ label: 'Category' }, { label: 'Revenue (USD)', num: true }, { label: 'Share', num: true }, { label: 'Units', num: true }],
      rows: items.map((d, k) => [d.label, fullMoney(d.value), pct(d.value / total), int(sums[D.categories.indexOf(d.label)].units)]),
    };
  }

  // ---------- chart: product ranking ----------
  function renderProducts() {
    const sums = sumBy(rowsB(), 2, D.products.length)
      .map((s, i) => ({ i, ...s }))
      .filter((s) => s.n > 0 && (state.category === 'all' || productCategory[s.i] === state.category));
    const ranked = [...sums].sort((a, b) => b.rev - a.rev);
    const shown = state.products === 'top' ? ranked.slice(0, 10) : [...ranked].reverse().slice(0, 10);
    const max = ranked.length ? ranked[0].rev : 1; // same scale for Top and Bottom views
    const items = shown.map((s) => ({
      label: D.products[s.i][0],
      value: s.rev,
      valueText: money(s.rev),
      tipTitle: `${D.products[s.i][0]} · ${D.categories[productCategory[s.i]]}`,
      tipRows: [{ value: fullMoney(s.rev), label: 'revenue' }, { value: int(s.units), label: 'units' }, { value: `#${ranked.indexOf(s) + 1} of ${ranked.length}`, label: 'rank' }],
    }));
    Charts.hBar(document.getElementById('chart-products'), items, { max, maxLabelShare: 0.46, ariaLabel: `${state.products === 'top' ? 'Top' : 'Bottom'} products by revenue` });
    document.querySelector('#card-products .card-sub').textContent =
      `${state.products === 'top' ? 'Top' : 'Bottom'} ${shown.length} of ${ranked.length} products, USD${state.products === 'bottom' ? ', lowest first' : ''}`;
    tableData['card-products'] = {
      columns: [{ label: 'Rank', num: true }, { label: 'Product' }, { label: 'Category' }, { label: 'Revenue (USD)', num: true }, { label: 'Units', num: true }],
      rows: ranked.map((s, k) => [k + 1, D.products[s.i][0], D.categories[productCategory[s.i]], fullMoney(s.rev), int(s.units)]),
    };
  }

  // ---------- chart: store ranking ----------
  function renderStores() {
    const sums = sumBy(rowsA(), 1, D.stores.length)
      .map((s, i) => ({ i, ...s }))
      .filter((s) => state.country === 'all' || storeCountry[s.i] === state.country);
    const ranked = [...sums].sort((a, b) => b.rev - a.rev);
    const shown = state.stores === 'top' ? ranked.slice(0, 10) : [...ranked].reverse().slice(0, 10);
    const max = ranked.length ? ranked[0].rev : 1;
    const items = shown.map((s) => ({
      label: D.stores[s.i][0],
      value: s.rev,
      valueText: money(s.rev),
      tipTitle: `${D.stores[s.i][0]} · ${D.stores[s.i][2]}, ${D.countries[storeCountry[s.i]]}`,
      tipRows: [{ value: fullMoney(s.rev), label: 'revenue' }, { value: int(s.units), label: 'units' }, { value: `#${ranked.indexOf(s) + 1} of ${ranked.length}`, label: 'rank' }],
    }));
    Charts.hBar(document.getElementById('chart-stores'), items, { max, maxLabelShare: 0.46, ariaLabel: `${state.stores === 'top' ? 'Top' : 'Bottom'} stores by revenue` });
    document.querySelector('#card-stores .card-sub').textContent =
      `${state.stores === 'top' ? 'Top' : 'Bottom'} ${shown.length} of ${ranked.length} stores, USD${state.stores === 'bottom' ? ', lowest first' : ''}`;
    tableData['card-stores'] = {
      columns: [{ label: 'Rank', num: true }, { label: 'Store' }, { label: 'City' }, { label: 'Country' }, { label: 'Revenue (USD)', num: true }, { label: 'Units', num: true }],
      rows: ranked.map((s, k) => [k + 1, D.stores[s.i][0], D.stores[s.i][2], D.countries[storeCountry[s.i]], fullMoney(s.rev), int(s.units)]),
    };
  }

  // ---------- chart: revenue by city (Leaflet map) ----------
  // One bubble per city. Stores are grouped by store ID into their city, so duplicate store names never mix.
  // Bubble AREA is proportional to revenue (radius ∝ √revenue), scaled to the largest city in view.
  const cityKey = (i) => `${D.countries[storeCountry[i]]}|${D.stores[i][2]}`;
  let map = null, bubbleLayer = null, mapFittedFor = null;

  function cityTotals() {
    const cities = new Map();
    D.stores.forEach((s, i) => {
      if (state.country !== 'all' && storeCountry[i] !== state.country) return;
      const key = cityKey(i);
      if (!cities.has(key)) cities.set(key, { key, city: s[2], country: D.countries[storeCountry[i]], stores: 0, rev: 0, n: 0, claims: 0 });
      cities.get(key).stores += 1;
    });
    // rowsA() already applies the Year, Country and Category filters
    rowsA().forEach((r) => {
      const c = cities.get(cityKey(r[1]));
      c.rev += r[4]; c.n += r[5]; c.claims += r[6] + r[7] + r[8] + r[9];
    });
    return [...cities.values()].sort((a, b) => b.rev - a.rev);
  }

  // All warranty claims are dated 2024, so earlier years show a note instead of a misleading 0%
  const noClaimsYear = () => state.year !== 'all' && state.year < 2024;
  const claimRateText = (c) => (noClaimsYear() ? 'no claims recorded (claims are 2024 only)' : pct(c.n ? c.claims / c.n : 0, 2));

  function renderMap() {
    const box = document.getElementById('chart-map');
    const list = cityTotals();
    const storeCount = list.reduce((a, c) => a + c.stores, 0);
    document.getElementById('map-sub').textContent = `${list.length} ${list.length === 1 ? 'city' : 'cities'}, ${storeCount} stores · bubble size = revenue`;
    tableData['card-map'] = {
      columns: [{ label: 'City' }, { label: 'Country' }, { label: 'Stores', num: true }, { label: 'Revenue (USD)', num: true }, { label: 'Claim rate', num: true }],
      rows: list.map((c) => [c.city, c.country, c.stores, fullMoney(c.rev), noClaimsYear() ? '—' : pct(c.n ? c.claims / c.n : 0, 2)]),
    };
    // table view is showing, or the Insights page is open: draw the map when it is visible again
    if (box.hidden || box.clientWidth === 0) { mapFittedFor = null; return; }

    if (typeof L === 'undefined') { box.textContent = 'The map library (lib/leaflet/leaflet.js) did not load.'; return; }
    if (!map) {
      map = L.map(box, { zoomSnap: 0.25, minZoom: 0.5, worldCopyJump: false });
      map.attributionControl.setPrefix(false);
      // Light, plain background map (Esri "World Light Gray Canvas", no sign-up key needed; needs internet).
      // The credit line is required by Esri's terms: "Powered by Esri" plus the service's own source list.
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 16,
        attribution: 'Powered by <a href="https://www.esri.com">Esri</a> | Esri, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, and the GIS user community',
      }).addTo(map);
      bubbleLayer = L.layerGroup().addTo(map);
      map.on('movestart zoomstart', Charts.hideTip);
    }
    map.invalidateSize(); // the card may have changed size (window resize, table view, page switch)

    const blue = color('--series-1');
    const maxRev = list.length && list[0].rev > 0 ? list[0].rev : 1;
    const maxR = Math.max(10, Math.min(20, box.clientWidth / 22));
    bubbleLayer.clearLayers();
    // biggest first, so smaller bubbles are drawn on top and stay easy to hover
    list.forEach((c) => {
      const pos = CITY_COORDS[c.key];
      if (!pos) { console.warn(`No map position for ${c.key} (add it to js/cities.js)`); return; }
      if (c.rev <= 0) return;
      const bubble = L.circleMarker(pos, {
        radius: Math.max(3, maxR * Math.sqrt(c.rev / maxRev)),
        color: blue, weight: 1, opacity: 0.9, fillColor: blue, fillOpacity: 0.4,
      });
      const title = `${c.city}, ${c.country}`;
      const rows = [
        { value: String(c.stores), label: c.stores === 1 ? 'store' : 'stores' },
        { value: fullMoney(c.rev), label: 'revenue' },
        { value: claimRateText(c), label: noClaimsYear() ? '' : 'warranty claim rate' },
      ];
      bubble.on('mouseover mousemove', (e) => { bubble.setStyle({ fillOpacity: 0.7 }); Charts.showTip(e.originalEvent, title, rows); });
      bubble.on('mouseout', () => { bubble.setStyle({ fillOpacity: 0.4 }); Charts.hideTip(); });
      bubble.addTo(bubbleLayer);
    });

    // zoom to the cities in view when the country changes (or after a resize); otherwise keep the user's zoom
    if (mapFittedFor !== state.country) {
      const pts = list.map((c) => CITY_COORDS[c.key]).filter(Boolean);
      // extra room at the bottom so the credit line never covers a bubble
      if (pts.length) map.fitBounds(pts, { paddingTopLeft: [maxR + 6, maxR + 6], paddingBottomRight: [maxR + 6, maxR + 30], maxZoom: 9, animate: false });
      mapFittedFor = state.country;
    }
  }

  // ---------- chart: warranty claims by status ----------
  function renderWarranty() {
    const t = totals(rowsA());
    const items = D.meta.statuses.map((name, k) => ({
      label: name,
      value: t.claims[k],
      valueText: `${int(t.claims[k])} · ${pct(t.claimTotal ? t.claims[k] / t.claimTotal : 0, 0)}`,
      tipRows: [{ value: int(t.claims[k]), label: 'claims' }, { value: pct(t.claimTotal ? t.claims[k] / t.claimTotal : 0), label: 'of claims' }],
    }));
    Charts.hBar(document.getElementById('chart-warranty'), items, { valueWidth: 82, maxRowHeight: 60, maxBar: 24, ariaLabel: 'Warranty claims by repair status' });
    const open = t.claims[1] + t.claims[2];
    document.getElementById('warranty-note').textContent = t.claimTotal
      ? `${int(t.claimTotal)} claims · ${pct(open / t.claimTotal, 0)} still open`
      : 'No claims in this selection';
    tableData['card-warranty'] = {
      columns: [{ label: 'Repair status' }, { label: 'Claims', num: true }, { label: 'Share of claims', num: true }],
      rows: items.map((d) => [d.label, int(d.value), pct(t.claimTotal ? d.value / t.claimTotal : 0)]),
    };
  }

  // ---------- render everything ----------
  function renderSummary() {
    const parts = [
      state.year === 'all' ? `All years (Jan 2020 – ${LAST_LABEL})` : (monthsInYear(state.year) < 12 ? `${state.year} (Jan–${MONTHS[monthsInYear(state.year) - 1]})` : String(state.year)),
      state.country === 'all' ? 'All countries' : D.countries[state.country],
      state.category === 'all' ? 'All categories' : D.categories[state.category],
    ];
    document.getElementById('filter-summary').textContent = `Showing: ${parts.join(' · ')}`;
  }
  const charts = {
    'card-trend': renderTrend, 'card-category': renderCategory, 'card-products': renderProducts,
    'card-stores': renderStores, 'card-map': renderMap, 'card-warranty': renderWarranty,
  };
  function renderCard(id) {
    charts[id]();
    const card = document.getElementById(id);
    if (!card.querySelector('.table-view').hidden) renderTable(id);
  }
  function renderAll() {
    Charts.hideTip();
    renderSummary();
    renderKpis();
    Object.keys(charts).forEach(renderCard);
  }

  // ---------- set up the filter controls ----------
  function fillSelect(id, allLabel, options) {
    const sel = document.getElementById(id);
    sel.replaceChildren();
    [{ value: 'all', text: allLabel }, ...options].forEach((o) => {
      const opt = document.createElement('option');
      opt.value = o.value; opt.textContent = o.text;
      sel.appendChild(opt);
    });
  }
  fillSelect('filter-year', 'All years', YEARS.map((y) => ({ value: y, text: monthsInYear(y) < 12 ? `${y} (Jan–${MONTHS[monthsInYear(y) - 1]} only)` : String(y) })));
  fillSelect('filter-country', 'All countries', D.countries
    .map((c, i) => ({ value: i, text: `${c} (${storeCountry.filter((x) => x === i).length} stores)` })));
  fillSelect('filter-category', 'All categories', D.categories
    .map((c, i) => ({ value: i, text: c }))
    .sort((a, b) => a.text.localeCompare(b.text)));

  const parse = (v) => (v === 'all' ? 'all' : Number(v));
  document.getElementById('filter-year').addEventListener('change', (e) => { state.year = parse(e.target.value); renderAll(); });
  document.getElementById('filter-country').addEventListener('change', (e) => { state.country = parse(e.target.value); renderAll(); });
  document.getElementById('filter-category').addEventListener('change', (e) => { state.category = parse(e.target.value); renderAll(); });
  document.getElementById('reset-filters').addEventListener('click', () => {
    state.year = state.country = state.category = 'all';
    ['filter-year', 'filter-country', 'filter-category'].forEach((id) => { document.getElementById(id).value = 'all'; });
    renderAll();
  });

  // Top/Bottom and Total/Per-day toggles
  function bindToggle(cardId, key) {
    const card = document.getElementById(cardId);
    card.querySelectorAll('.toggle button').forEach((btn) => {
      btn.addEventListener('click', () => {
        state[key] = btn.dataset.view;
        card.querySelectorAll('.toggle button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
        renderCard(cardId);
      });
    });
  }
  bindToggle('card-products', 'products');
  bindToggle('card-stores', 'stores');

  // Chart / Table switch on every card
  Object.keys(charts).forEach((id) => {
    const card = document.getElementById(id);
    const btn = card.querySelector('.btn-table');
    btn.addEventListener('click', () => {
      const showTable = btn.getAttribute('aria-pressed') !== 'true';
      btn.setAttribute('aria-pressed', String(showTable));
      btn.textContent = showTable ? 'Chart' : 'Table';
      card.querySelector('.chart').hidden = showTable;
      card.querySelector('.table-view').hidden = !showTable;
      const legend = card.querySelector('.legend');
      if (legend) legend.hidden = showTable;
      if (showTable) renderTable(id); else charts[id]();
    });
  });

  // Page switch: Dashboard / Insights & notes
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-pressed', String(on));
        document.getElementById(t.dataset.page).hidden = !on;
      });
      Charts.hideTip();
      if (tab.dataset.page === 'page-dashboard') Object.keys(charts).forEach(renderCard); // redraw at the visible size
    });
  });

  // Redraw charts when the window is resized (charts size themselves to their card)
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { mapFittedFor = null; Object.keys(charts).forEach((id) => charts[id]()); }, 150);
  });

  renderAll();
})();
