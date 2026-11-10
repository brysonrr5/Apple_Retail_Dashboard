/* charts.js — small SVG chart helpers written in plain JavaScript (no external library).
 *
 * Three chart types are used by the dashboard:
 *   Charts.hBar(container, items, options)     horizontal ranked bars
 *   Charts.line(container, config, options)    line chart over time with a hover crosshair
 *   Charts.column(container, items, options)   vertical columns (calendar months)
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
  //           series: [{ name, color, values: [number|null] }] }
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
      svgEl('path', { d, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
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
      const rows = config.series
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

  return { hBar, line, column, showTip, hideTip };
})();
