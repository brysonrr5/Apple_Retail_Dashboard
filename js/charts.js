/* charts.js — small SVG chart helpers written in plain JavaScript (no external library).
 *
 * Three chart types are used by the dashboard:
 *   Charts.hBar(container, items, options)     horizontal ranked bars
 *   Charts.line(container, config, options)    line chart over time with a hover crosshair
 *   Charts.column(container, items, options)   vertical columns (calendar months)
 *   Charts.donut(container, items, options)    ring of slices with a legend and center text
 *   Charts.concentration(container, items, opt) cumulative-share curve vs an equal-share diagonal
 *
 * Every chart is drawn as an <svg> that fills the width of its container,
 * and every mark shows a tooltip on mouse hover and on keyboard focus.
 */
const Charts = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  // ---------- small helpers ----------
  function svgEl(tag, attrs = {}, parent) {
    const el = document.createElementNS(NS, tag);
    for (const key in attrs) el.setAttribute(key, attrs[key]);
    if (parent) parent.appendChild(el);
    return el;
  }
  function svgText(parent, x, y, str, attrs = {}) {
    const t = svgEl('text', { x, y, ...attrs }, parent);
    t.textContent = str; // textContent (never innerHTML) so data labels can't inject markup
    return t;
  }
  function newSvg(container, width, height, label) {
    container.replaceChildren();
    return svgEl('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': label }, container);
  }

  // Measure text width so long labels can be shortened instead of overlapping
  const measureCtx = document.createElement('canvas').getContext('2d');
  function textWidth(str, size = 12) {
    measureCtx.font = `${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    return measureCtx.measureText(str).width;
  }
  function fitText(str, maxWidth, size = 12) {
    if (textWidth(str, size) <= maxWidth) return str;
    let s = str;
    while (s.length > 1 && textWidth(s + '…', size) > maxWidth) s = s.slice(0, -1);
    return s + '…';
  }

  // Round axis ticks: 0, step, 2*step ... up to at least max
  function niceTicks(max, count = 4) {
    if (!(max > 0)) return [0, 1];
    const raw = max / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => s >= raw);
    const top = Math.ceil(max / step) * step;
    const ticks = [];
    for (let i = 0; i * step <= top + step / 1000; i++) ticks.push(i * step);
    return ticks;
  }

  // Axis range that hugs the data (line chart only, so the axis does not start at 0).
  // The chart spans the data plus 8% of its range above and below; gridlines sit at round
  // numbers (1, 2, 2.5 or 5 × a power of ten) inside that span, using the largest step that
  // still gives at least 3 gridlines.
  function niceRange(min, max) {
    if (!(max > 0)) return { min: 0, max: 1, ticks: [0, 1] };
    const span = max - min || Math.abs(max) * 0.1 || 1;
    const lo = Math.max(0, min - span * 0.08), hi = max + span * 0.08;
    const ticksFor = (step) => {
      const out = [];
      for (let i = Math.ceil(lo / step); i * step <= hi; i++) out.push(+(i * step).toPrecision(12));
      return out;
    };
    const mag = Math.pow(10, Math.floor(Math.log10(hi - lo)));
    for (const s of [5, 2.5, 2, 1, 0.5, 0.25, 0.2, 0.1]) {
      const ticks = ticksFor(s * mag);
      if (ticks.length >= 3) return { min: lo, max: hi, ticks };
    }
    return { min: lo, max: hi, ticks: ticksFor(0.05 * mag) };
  }

  // Bar shapes: 4px rounded at the data end, square at the baseline
  function hBarPath(x0, y, w, h, r = 4) {
    r = Math.min(r, h / 2, w);
    return `M${x0},${y} H${x0 + w - r} A${r},${r} 0 0 1 ${x0 + w},${y + r} V${y + h - r} A${r},${r} 0 0 1 ${x0 + w - r},${y + h} H${x0} Z`;
  }
  function colPath(x, yBase, w, h, r = 4) {
    r = Math.min(r, w / 2, h);
    const yTop = yBase - h;
    return `M${x},${yBase} V${yTop + r} A${r},${r} 0 0 1 ${x + r},${yTop} H${x + w - r} A${r},${r} 0 0 1 ${x + w},${yTop + r} V${yBase} Z`;
  }

  // ---------- tooltip ----------
  const tipEl = () => document.getElementById('tooltip');
  function showTip(evt, title, rows) {
    const tip = tipEl();
    tip.replaceChildren();
    const head = document.createElement('div');
    head.className = 'tt-title';
    head.textContent = title;
    tip.appendChild(head);
    rows.forEach((r) => {
      const row = document.createElement('div');
      row.className = 'tt-row';
      if (r.color) { const key = document.createElement('i'); key.style.background = r.color; row.appendChild(key); }
      const val = document.createElement('b'); val.textContent = r.value; row.appendChild(val);
      if (r.label) { const lab = document.createElement('span'); lab.textContent = r.label; row.appendChild(lab); }
      tip.appendChild(row);
    });
    tip.hidden = false;
    moveTip(evt);
  }
  function moveTip(evt) {
    const tip = tipEl();
    let x, y;
    if (evt.type === 'focus' || evt.type === 'keydown' || evt.clientX === undefined) {
      const box = (evt.anchor || evt.currentTarget || evt.target).getBoundingClientRect();
      x = box.left + box.width / 2; y = box.top;
    } else { x = evt.clientX; y = evt.clientY; }
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let left = x + 14, top = y - h - 10;
    if (left + w > window.innerWidth - 8) left = x - w - 14;
    if (top < 8) top = y + 18;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }
  function hideTip() { tipEl().hidden = true; }

  // Attach hover + keyboard-focus tooltips to one mark group
  function bindTip(group, title, rows) {
    group.setAttribute('tabindex', '0');
    group.setAttribute('aria-label', `${title}: ${rows.map((r) => `${r.label ? r.label + ' ' : ''}${r.value}`).join(', ')}`);
    group.addEventListener('pointermove', (e) => showTip(e, title, rows));
    group.addEventListener('pointerleave', hideTip);
    group.addEventListener('focus', (e) => showTip(e, title, rows));
    group.addEventListener('blur', hideTip);
  }

  // ---------- horizontal bar chart ----------
  // items: [{ label, value, valueText, color, tipTitle, tipRows }]
  function hBar(container, items, opt = {}) {
    // the chart fills its card: row height = available height ÷ number of bars (capped)
    const width = Math.max(container.clientWidth, 200);
    const avail = container.clientHeight || items.length * 30;
    const rowH = Math.min(opt.maxRowHeight || 34, avail / Math.max(items.length, 1));
    const barH = Math.max(6, Math.min(opt.maxBar || 18, rowH * 0.62));
    const valueW = opt.valueWidth || 70;
    const longest = Math.max(...items.map((d) => textWidth(d.label)), 40);
    const labelW = Math.min(longest + 8, width * (opt.maxLabelShare || 0.42));
    const x0 = labelW + 8;
    const plotW = Math.max(width - x0 - valueW, 40);
    const height = Math.max(avail, items.length * rowH);
    const svg = newSvg(container, width, height, opt.ariaLabel || 'Bar chart');
    if (!items.length) { svgText(svg, 0, 20, 'No data for this filter combination', { class: 'bar-label' }); return; }

    const max = opt.max || Math.max(...items.map((d) => d.value), 1);
    items.forEach((d, i) => {
      const y = i * rowH;
      const g = svgEl('g', { class: 'mark-group' }, svg);
      svgEl('rect', { class: 'mark-hit', x: 0, y, width, height: rowH }, g); // hit area = whole row
      svgText(g, labelW, y + rowH / 2 + 4, fitText(d.label, labelW), { class: 'bar-label', 'text-anchor': 'end' });
      const w = Math.max((d.value / max) * plotW, d.value > 0 ? 2 : 0);
      svgEl('path', { class: 'mark', d: hBarPath(x0, y + (rowH - barH) / 2, w, barH), fill: d.color || css('--series-1') }, g);
      svgText(g, x0 + w + 6, y + rowH / 2 + 4, d.valueText, { class: 'value-label' });
      bindTip(g, d.tipTitle || d.label, d.tipRows || [{ value: d.valueText }]);
    });
    svgEl('line', { class: 'baseline', x1: x0, x2: x0, y1: 0, y2: items.length * rowH }, svg);
  }

  // ---------- line chart ----------
  // config: { labels: [full x labels], ticks: [index list to label], tickText: fn(i),
  //           series: [{ name, color, width (default 2), values: [number|null] }] }
  // Series are drawn in order, so put the one that should sit on top last.
  // opt.tipRows(i), if given, returns the tooltip rows for month i instead of one row per series.
  function line(container, config, opt = {}) {
    const width = Math.max(container.clientWidth, 200);
    const height = Math.max(container.clientHeight || 260, 120);
    const m = { top: 8, right: 14, bottom: 22, left: 52 };
    const plotW = width - m.left - m.right, plotH = height - m.top - m.bottom;
    const svg = newSvg(container, width, height, opt.ariaLabel || 'Line chart');
    const n = config.labels.length;
    const allVals = config.series.flatMap((s) => s.values.filter((v) => v != null));
    if (!allVals.length) { svgText(svg, m.left, 30, 'No data for this filter combination', { class: 'bar-label' }); return; }

    // axis is zoomed to the data range (not from zero) so month-to-month changes are visible;
    // the card subtitle says "axis does not start at $0"
    const { min: yMin, max: yMax, ticks } = niceRange(Math.min(...allVals), Math.max(...allVals));
    const x = (i) => m.left + (n === 1 ? plotW / 2 : (i * plotW) / (n - 1));
    const y = (v) => m.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

    // gridlines + y labels
    ticks.forEach((t) => {
      svgEl('line', { class: t === 0 ? 'baseline' : 'gridline', x1: m.left, x2: m.left + plotW, y1: y(t), y2: y(t) }, svg);
      svgText(svg, m.left - 8, y(t) + 4, opt.axisFormat(t), { class: 'axis-label', 'text-anchor': 'end' });
    });
    // x labels
    config.ticks.forEach((i) => {
      svgText(svg, x(i), height - 6, config.tickText(i), { class: 'axis-label', 'text-anchor': 'middle' });
    });

    // one path per series; null values break the line
    config.series.forEach((s) => {
      let d = '', pen = false;
      s.values.forEach((v, i) => {
        if (v == null) { pen = false; return; }
        d += `${pen ? 'L' : 'M'}${x(i)},${y(v)} `;
        pen = true;
      });
      svgEl('path', { d, fill: 'none', stroke: s.color, 'stroke-width': s.width || 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
      const last = s.values.reduce((acc, v, i) => (v != null ? i : acc), -1);
      if (last >= 0) svgEl('circle', { cx: x(last), cy: y(s.values[last]), r: 4, fill: s.color, stroke: css('--surface'), 'stroke-width': 2 }, svg);
    });

    // hover layer: crosshair snaps to the nearest month and lists every series
    const cross = svgEl('line', { class: 'crosshair', y1: m.top, y2: m.top + plotH, visibility: 'hidden' }, svg);
    const dots = config.series.map((s) => svgEl('circle', { r: 4, fill: s.color, stroke: css('--surface'), 'stroke-width': 2, visibility: 'hidden' }, svg));
    const overlay = svgEl('rect', { x: m.left, y: m.top, width: plotW, height: plotH, fill: 'transparent', tabindex: 0,
      'aria-label': `${opt.ariaLabel || 'Line chart'}. Use left and right arrow keys to step through months.` }, svg);
    let current = n - 1;
    function show(i, evt) {
      current = Math.max(0, Math.min(n - 1, i));
      cross.setAttribute('x1', x(current)); cross.setAttribute('x2', x(current)); cross.setAttribute('visibility', 'visible');
      config.series.forEach((s, k) => {
        const v = s.values[current];
        if (v == null) { dots[k].setAttribute('visibility', 'hidden'); return; }
        dots[k].setAttribute('cx', x(current)); dots[k].setAttribute('cy', y(v)); dots[k].setAttribute('visibility', 'visible');
      });
      const rows = opt.tipRows ? opt.tipRows(current) : config.series
        .filter((s) => s.values[current] != null)
        .map((s) => ({ color: s.color, value: opt.format(s.values[current]), label: config.series.length > 1 ? s.name : '' }));
      showTip(evt, config.labels[current], rows.length ? rows : [{ value: 'No data' }]);
    }
    function hide() { cross.setAttribute('visibility', 'hidden'); dots.forEach((d) => d.setAttribute('visibility', 'hidden')); hideTip(); }
    overlay.addEventListener('pointermove', (e) => {
      const box = svg.getBoundingClientRect();
      const px = ((e.clientX - box.left) / box.width) * width;
      show(Math.round(((px - m.left) / plotW) * (n - 1)), e);
    });
    overlay.addEventListener('pointerleave', hide);
    overlay.addEventListener('focus', (e) => show(current, { type: 'focus', anchor: dots[0] }));
    overlay.addEventListener('blur', hide);
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        show(current + (e.key === 'ArrowRight' ? 1 : -1), { type: 'keydown', anchor: dots[0] });
      }
    });
  }

  // ---------- column chart ----------
  // items: [{ label, value, color, tipTitle, tipRows }]; the highest and lowest columns get value labels
  function column(container, items, opt = {}) {
    const width = Math.max(container.clientWidth, 200);
    const height = Math.max(container.clientHeight || 240, 120);
    const m = { top: 18, right: 4, bottom: 22, left: 52 };
    const plotW = width - m.left - m.right, plotH = height - m.top - m.bottom;
    const svg = newSvg(container, width, height, opt.ariaLabel || 'Column chart');
    const vals = items.map((d) => d.value).filter((v) => v != null);
    if (!vals.length) { svgText(svg, m.left, 30, 'No data for this filter combination', { class: 'bar-label' }); return; }

    const ticks = niceTicks(Math.max(...vals));
    const yMax = ticks[ticks.length - 1];
    const y = (v) => m.top + plotH - (v / yMax) * plotH;
    ticks.forEach((t) => {
      svgEl('line', { class: t === 0 ? 'baseline' : 'gridline', x1: m.left, x2: m.left + plotW, y1: y(t), y2: y(t) }, svg);
      svgText(svg, m.left - 8, y(t) + 4, opt.axisFormat(t), { class: 'axis-label', 'text-anchor': 'end' });
    });
    const band = plotW / items.length;
    const colW = Math.min(24, band * 0.6);
    const maxV = Math.max(...vals), minV = Math.min(...vals);
    items.forEach((d, i) => {
      const cx = m.left + band * i + band / 2;
      const g = svgEl('g', { class: 'mark-group' }, svg);
      svgEl('rect', { class: 'mark-hit', x: m.left + band * i, y: m.top, width: band, height: plotH }, g);
      if (d.value != null) {
        svgEl('path', { class: 'mark', d: colPath(cx - colW / 2, y(0), colW, y(0) - y(d.value)), fill: d.color || css('--series-1') }, g);
        if (d.value === maxV || d.value === minV) {
          // label only the highest and lowest columns; the halo keeps the text readable over a neighbouring column
          svgText(g, cx, y(d.value) - 6, opt.labelFormat(d.value), { class: 'value-label halo', 'text-anchor': 'middle' });
        }
      }
      // narrow columns get one-letter month labels so they don't overlap
      svgText(g, cx, height - 6, band < 30 ? d.label.charAt(0) : d.label, { class: 'axis-label', 'text-anchor': 'middle' });
      bindTip(g, d.tipTitle || d.label, d.tipRows || [{ value: d.value == null ? 'No data' : opt.labelFormat(d.value) }]);
    });
  }

  // ---------- donut chart ----------
  // items: [{ label, value, valueText, color, tipTitle, tipRows }] drawn clockwise from 12 o'clock.
  // opt.center: { big, small } text for the hole; opt.emptyText when every value is 0.
  // A legend (swatch · name · count and percent) sits beside the ring, or below it when the card is narrow.
  function arcPath(cx, cy, rOut, rIn, a0, a1) {
    // a full circle can't be one arc, so split it in two
    if (a1 - a0 >= Math.PI * 2 - 1e-6) {
      const mid = a0 + Math.PI;
      return arcPath(cx, cy, rOut, rIn, a0, mid) + ' ' + arcPath(cx, cy, rOut, rIn, mid, a1);
    }
    const pt = (r, a) => `${cx + r * Math.sin(a)},${cy - r * Math.cos(a)}`;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return `M${pt(rOut, a0)} A${rOut},${rOut} 0 ${large} 1 ${pt(rOut, a1)} L${pt(rIn, a1)} A${rIn},${rIn} 0 ${large} 0 ${pt(rIn, a0)} Z`;
  }
  function donut(container, items, opt = {}) {
    const width = Math.max(container.clientWidth, 160);
    const height = Math.max(container.clientHeight || 200, 120);
    const svg = newSvg(container, width, height, opt.ariaLabel || 'Donut chart');
    const total = items.reduce((a, d) => a + d.value, 0);

    // legend size: swatch + longest name + gap + longest value
    const nameW = Math.max(...items.map((d) => textWidth(d.label, 11.5)));
    const valW = Math.max(...items.map((d) => textWidth(d.valueText, 10.5)));
    const legendW = 10 + 6 + nameW + 10 + valW;
    const rowH = 20, legendH = items.length * rowH;

    // beside the ring if there is room for a ring at least 110px across; otherwise stacked
    const besideR = Math.min(height / 2 - 4, (width - legendW - 16) / 2);
    const beside = besideR >= 55;
    const R = beside ? besideR : Math.max(30, Math.min((height - legendH - 12) / 2, width / 2 - 4));
    const cx = beside ? R + 2 : width / 2;
    const cy = beside ? height / 2 : R + 2;
    const rIn = R * 0.62;
    const lx = beside ? Math.min(cx + R + 16, width - legendW) : Math.max(0, (width - legendW) / 2);
    const ly = beside ? (height - legendH) / 2 : cy + R + 12;

    // center text
    const center = total ? opt.center : { big: '', small: opt.emptyText || 'No data' };
    if (!total) svgEl('path', { d: arcPath(cx, cy, R, rIn, 0, Math.PI * 2), fill: css('--grid') }, svg);
    if (center && center.big) {
      svgText(svg, cx, cy + 2, center.big, { class: 'donut-big', 'text-anchor': 'middle' });
      svgText(svg, cx, cy + 18, center.small, { class: 'value-label', 'text-anchor': 'middle' });
    } else if (center) {
      svgText(svg, cx, cy + 4, fitText(center.small, rIn * 2 - 8, 10.5), { class: 'value-label', 'text-anchor': 'middle' });
    }

    let a = 0;
    items.forEach((d, i) => {
      const g = svgEl('g', { class: 'mark-group' }, svg);
      if (total && d.value > 0) {
        const a1 = a + (d.value / total) * Math.PI * 2;
        // a 2px surface-colored outline leaves a visible gap between neighbouring slices
        svgEl('path', { class: 'mark', d: arcPath(cx, cy, R, rIn, a, a1), fill: d.color, stroke: css('--surface'), 'stroke-width': 2, 'stroke-linejoin': 'round' }, g);
        a = a1;
      }
      // legend row (part of the same hover group, so hovering the row or the slice shows the same tooltip)
      const y = ly + i * rowH;
      svgEl('rect', { class: 'mark-hit', x: lx - 4, y, width: legendW + 8, height: rowH }, g);
      svgEl('rect', { class: 'mark', x: lx, y: y + rowH / 2 - 5, width: 10, height: 10, rx: 2, fill: d.color }, g);
      svgText(g, lx + 16, y + rowH / 2 + 4, d.label, { class: 'bar-label' });
      svgText(g, lx + legendW, y + rowH / 2 + 4, d.valueText, { class: 'value-label', 'text-anchor': 'end' });
      bindTip(g, d.tipTitle || d.label, d.tipRows || [{ value: d.valueText }]);
    });
  }

  // ---------- concentration curve ----------
  // items: [{ share, tipTitle, tipRows }] already ranked highest first; share = cumulative fraction (0–1) up to that item.
  // Point k (1-based) sits at x = k/n of items, y = its cumulative share; the curve starts at (0, 0).
  // A thin gray diagonal shows equal revenue per item. opt.markers: [{ k, text }] get a dot and a label
  // placed in the empty lower-right area with a thin pointer line.
  // Hover snaps to the nearest item; keyboard: one tab stop, left/right arrows step through items.
  function concentration(container, items, opt = {}) {
    const width = Math.max(container.clientWidth, 200);
    const height = Math.max(container.clientHeight || 240, 140);
    const m = { top: 10, right: 14, bottom: 34, left: 44 };
    const plotW = width - m.left - m.right, plotH = height - m.top - m.bottom;
    const svg = newSvg(container, width, height, opt.ariaLabel || 'Concentration chart');
    if (!items.length) { svgText(svg, m.left, 30, 'No data for this filter combination', { class: 'bar-label' }); return; }

    const n = items.length;
    const x = (f) => m.left + f * plotW; // f = fraction of items
    const y = (f) => m.top + plotH - f * plotH; // f = fraction of revenue
    const px = (k) => x(k / n), py = (k) => y(k === 0 ? 0 : items[k - 1].share);
    const pctText = (f) => `${Math.round(f * 100)}%`;

    [0, 0.25, 0.5, 0.75, 1].forEach((t) => {
      svgEl('line', { class: t === 0 ? 'baseline' : 'gridline', x1: m.left, x2: m.left + plotW, y1: y(t), y2: y(t) }, svg);
      svgText(svg, m.left - 8, y(t) + 4, pctText(t), { class: 'axis-label', 'text-anchor': 'end' });
      svgText(svg, x(t), m.top + plotH + 14, pctText(t), { class: 'axis-label', 'text-anchor': t === 0 ? 'start' : t === 1 ? 'end' : 'middle' });
    });
    svgEl('line', { class: 'baseline', x1: m.left, x2: m.left, y1: m.top, y2: m.top + plotH }, svg);
    svgText(svg, m.left + plotW / 2, height - 4, opt.xTitle || '', { class: 'axis-label', 'text-anchor': 'middle' });

    // equal-share diagonal with a label running along it
    svgEl('line', { class: 'diagonal', x1: x(0), y1: y(0), x2: x(1), y2: y(1) }, svg);
    const angle = (Math.atan2(-plotH, plotW) * 180) / Math.PI;
    const lx = x(0.72), ly = y(0.72) + 12;
    svgText(svg, lx, ly, opt.diagonalLabel || 'Equal share', { class: 'axis-label halo', 'text-anchor': 'middle', transform: `rotate(${angle} ${lx} ${ly})` });

    // the curve
    let d = `M${px(0)},${py(0)}`;
    for (let k = 1; k <= n; k++) d += ` L${px(k)},${py(k)}`;
    svgEl('path', { d, fill: 'none', stroke: opt.color || css('--series-1'), 'stroke-width': 2, 'stroke-linejoin': 'round' }, svg);

    // marked points: labels stacked in the lower-right, the higher point gets the higher label
    const marks = (opt.markers || []).filter((mk) => mk.k >= 1 && mk.k <= n).sort((a, b) => b.k - a.k);
    const tx = x(1) - 2; // labels are right-aligned to the plot's right edge
    marks.forEach((mk, j) => {
      const labelY = m.top + plotH - 18 - (marks.length - 1 - j) * 16; // clear of the x-axis, below the diagonal
      const w = textWidth(mk.text, 11);
      svgEl('line', { class: 'leader', x1: px(mk.k), y1: py(mk.k), x2: tx - w - 4, y2: labelY - 4 }, svg);
      svgText(svg, tx, labelY, mk.text, { class: 'mark-label halo', 'text-anchor': 'end' });
      svgEl('circle', { cx: px(mk.k), cy: py(mk.k), r: 4, fill: opt.color || css('--series-1'), stroke: css('--surface'), 'stroke-width': 2 }, svg);
    });

    // hover layer
    const dot = svgEl('circle', { r: 4.5, fill: opt.color || css('--series-1'), stroke: css('--text-primary'), 'stroke-width': 1.5, visibility: 'hidden' }, svg);
    const overlay = svgEl('rect', { x: m.left, y: m.top, width: plotW, height: plotH, fill: 'transparent', tabindex: 0,
      'aria-label': `${opt.ariaLabel || 'Concentration chart'}. Use left and right arrow keys to step through items.` }, svg);
    let current = 1;
    function show(k, evt) {
      current = Math.max(1, Math.min(n, k));
      dot.setAttribute('cx', px(current)); dot.setAttribute('cy', py(current)); dot.setAttribute('visibility', 'visible');
      const it = items[current - 1];
      showTip(evt, it.tipTitle, it.tipRows);
    }
    function hide() { dot.setAttribute('visibility', 'hidden'); hideTip(); }
    overlay.addEventListener('pointermove', (e) => {
      const box = svg.getBoundingClientRect();
      const fx = (((e.clientX - box.left) / box.width) * width - m.left) / plotW;
      show(Math.round(fx * n), e);
    });
    overlay.addEventListener('pointerleave', hide);
    overlay.addEventListener('focus', () => show(current, { type: 'focus', anchor: dot }));
    overlay.addEventListener('blur', hide);
    overlay.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      show(current + (e.key === 'ArrowRight' ? 1 : -1), { type: 'keydown', anchor: dot });
    });
  }

  return { hBar, line, column, donut, concentration, showTip, hideTip };
})();
