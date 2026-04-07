export function renderPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#fffdf7" media="(prefers-color-scheme: light)" />
<meta name="theme-color" content="#1a1917" media="(prefers-color-scheme: dark)" />
<meta name="description" content="scemas webhook echo — live alert feed for Hamilton, ON" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="pager" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta property="og:title" content="pager — SCEMAS" />
<meta property="og:description" content="live feed of webhook alerts from the scemas alerting system" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="SCEMAS" />
<meta property="og:locale" content="en_CA" />
<meta name="twitter:card" content="summary" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&display=swap" rel="stylesheet" />
<title>pager | SCEMAS</title>
<style>
  :root {
    --bg: #fffdf7; --card: #fefcf6; --border: #e5e2dc; --muted: #f5f3ef;
    --fg: #1a1a1a; --muted-fg: #737068;
    --critical: #dc2626; --warning: #d97706; --low: #16a34a;
    --connected: #16a34a; --disconnected: #dc2626;
    --raw-bg: #e8e5df;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #1a1917; --card: #242320; --border: rgba(255,255,255,0.1); --muted: #2a2926;
      --fg: #e8e6e1; --muted-fg: #9c9890;
      --raw-bg: #353330;
    }
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { height: 100dvh; overflow: hidden; }
  body {
    font-family: 'Geist', ui-sans-serif, system-ui, -apple-system, sans-serif;
    background: var(--bg); color: var(--fg);
    height: 100%; display: flex; flex-direction: column;
    -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
  }
  header {
    position: sticky; top: 0; z-index: 10;
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px; border-bottom: 1px solid var(--border);
    background: var(--card); backdrop-filter: blur(8px);
  }
  header h1 { font-size: 14px; font-weight: 600; letter-spacing: -0.01em; }
  .status { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--muted-fg); }
  .dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .dot.on { background: var(--connected); }
  .dot.off { background: var(--disconnected); }
  .count { font-family: ui-monospace, monospace; font-size: 11px; color: var(--muted-fg); margin-left: 8px; }
  #feed { flex: 1; height: 100%; overflow-y: auto; position: relative; }
  .sentinel { pointer-events: none; width: 1px; }
  .empty {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 12px; height: 60vh; color: var(--muted-fg); font-size: 13px; padding: 16px;
    text-align: center;
  }
  .empty code {
    display: block; margin-top: 4px; padding: 6px 10px; border-radius: 4px;
    background: var(--muted); font-family: ui-monospace, monospace;
    font-size: 11px; color: var(--fg); user-select: all; word-break: break-all;
  }
  .spinner {
    width: 16px; height: 16px; border: 2px solid var(--border);
    border-top-color: var(--muted-fg); border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .event {
    position: absolute; left: 0; right: 0;
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 10px 16px; min-height: 56px; border-bottom: 1px solid var(--border);
    cursor: pointer; transition: background 0.15s;
    background: var(--bg);
  }
  .event:hover { background: var(--muted); }
  .event-left { min-width: 0; flex: 1; }
  .event-top { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .event-bottom {
    margin-top: 3px; font-size: 11px; color: var(--muted-fg);
    display: flex; gap: 6px; flex-wrap: wrap;
  }
  .badge {
    display: inline-flex; align-items: center; border-radius: 3px;
    padding: 1px 6px; font-size: 10px; font-weight: 500; color: #fff; line-height: 16px;
    text-transform: uppercase; letter-spacing: 0.02em;
  }
  .badge.critical { background: var(--critical); }
  .badge.warning { background: var(--warning); }
  .badge.low { background: var(--low); }
  .tag {
    background: var(--muted); border-radius: 3px;
    padding: 1px 4px; font-size: 11px; color: var(--muted-fg);
  }
  .event-right { flex-shrink: 0; text-align: right; }
  .value { font-family: ui-monospace, monospace; font-size: 13px; font-variant-numeric: tabular-nums; }
  .time { font-size: 11px; color: var(--muted-fg); margin-top: 2px; }
  .raw { display: none; }
  .event.expanded .raw {
    display: block; margin-top: 8px; padding: 8px; border-radius: 4px;
    background: var(--raw-bg); font-family: ui-monospace, monospace;
    font-size: 11px; white-space: pre-wrap; word-break: break-all;
    color: var(--muted-fg); max-height: 200px; overflow-y: auto;
  }
  .event.expanded { align-items: flex-start; z-index: 1; }
  footer {
    position: sticky; bottom: 0; z-index: 10;
    padding: 8px 16px; border-top: 1px solid var(--border);
    background: var(--card); font-size: 11px; color: var(--muted-fg);
    display: flex; justify-content: space-between; gap: 8px;
  }
  footer code { font-family: ui-monospace, monospace; user-select: all; }
</style>
</head>
<body>
<header>
  <div style="display:flex;align-items:baseline;gap:8px">
    <h1>pager</h1>
    <span class="count" id="count">0 events</span>
  </div>
  <div class="status">
    <div class="dot off" id="dot"></div>
    <span id="status-label">connecting</span>
  </div>
</header>
<div id="feed">
  <div class="empty" id="empty">
    <div class="spinner"></div>
    <span>waiting for webhooks&hellip;</span>
    <span style="font-size:11px">POST alert payloads to:
      <code id="webhook-url"></code>
    </span>
  </div>
</div>
<footer>
  <span>SCEMAS</span>
  <code id="url"></code>
</footer>
<script>
const ROW_H = 56;

const feed = document.getElementById('feed');
const empty = document.getElementById('empty');
const dot = document.getElementById('dot');
const statusLabel = document.getElementById('status-label');
const countEl = document.getElementById('count');
const urlEl = document.getElementById('url');
const webhookUrlEl = document.getElementById('webhook-url');

const webhookUrl = location.origin + '/webhook';
urlEl.textContent = webhookUrl;
webhookUrlEl.textContent = webhookUrl;

let items = [];
let heights = [];
let offsets = [];
let totalH = 0;
let expandedId = null;
const pool = new Map();
let sentinel = null;
let rafPending = false;
let retryMs = 500;

function overscan() {
  return Math.max(3, Math.ceil(feed.clientHeight / ROW_H));
}

function recalcOffsets() {
  offsets = new Array(items.length);
  let cum = 0;
  for (let i = 0; i < items.length; i++) {
    offsets[i] = cum;
    cum += (heights[i] || ROW_H);
  }
  totalH = cum;
  if (sentinel) sentinel.style.height = totalH + 'px';
}

function findStart(scrollTop, buf) {
  let lo = 0, hi = items.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (offsets[mid] + (heights[mid] || ROW_H) <= scrollTop) lo = mid + 1;
    else hi = mid - 1;
  }
  return Math.max(0, lo - buf);
}

function scheduleRender() {
  if (!rafPending) {
    rafPending = true;
    requestAnimationFrame(doRender);
  }
}

function doRender() {
  rafPending = false;
  if (items.length === 0) return;

  const scrollTop = feed.scrollTop;
  const viewH = feed.clientHeight;
  if (viewH === 0) return;

  const buf = overscan();
  const start = findStart(scrollTop, buf);

  let end = start;
  let accH = offsets[start] || 0;
  const limit = scrollTop + viewH + buf * ROW_H;
  while (end < items.length && accH < limit) {
    accH += (heights[end] || ROW_H);
    end++;
  }

  const needed = new Map();
  for (let i = start; i < end; i++) needed.set(items[i].id, i);

  const stale = [];
  for (const [id] of pool) {
    if (!needed.has(id)) stale.push(id);
  }
  for (const id of stale) {
    pool.get(id).el.remove();
    pool.delete(id);
  }

  for (const [id, idx] of needed) {
    if (pool.has(id)) {
      const entry = pool.get(id);
      if (entry.idx !== idx) {
        entry.el.style.top = offsets[idx] + 'px';
        entry.idx = idx;
      }
    } else {
      const el = createRow(items[idx]);
      el.style.top = offsets[idx] + 'px';
      if (items[idx].id === expandedId) el.classList.add('expanded');
      feed.appendChild(el);
      pool.set(id, { el, idx });
    }
  }

  if (expandedId && pool.has(expandedId)) {
    const entry = pool.get(expandedId);
    const measured = entry.el.offsetHeight;
    if (measured > 0 && Math.abs(measured - heights[entry.idx]) > 2) {
      heights[entry.idx] = measured;
      recalcOffsets();
      for (const [, e] of pool) e.el.style.top = offsets[e.idx] + 'px';
    }
  }
}

function severity(n) {
  if (n === 3) return { cls: 'critical', label: 'critical' };
  if (n === 2) return { cls: 'warning', label: 'warning' };
  return { cls: 'low', label: 'low' };
}

function fmtTime(iso) {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function fmtZone(z) {
  return z ? z.replace(/_/g, ' ') : '?';
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function extractAlert(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const a = payload.alert;
  if (a && typeof a === 'object' && a.severity !== undefined) return a;
  if (payload.severity !== undefined && payload.metricType) return payload;
  return null;
}

function createRow(evt) {
  const a = extractAlert(evt.payload);
  const el = document.createElement('div');
  el.className = 'event';

  el.onclick = () => {
    const idx = items.findIndex(e => e.id === evt.id);
    if (idx < 0) return;
    const wasExpanded = expandedId === evt.id;

    if (expandedId && expandedId !== evt.id) {
      const prevIdx = items.findIndex(e => e.id === expandedId);
      if (prevIdx >= 0) {
        heights[prevIdx] = ROW_H;
        const prev = pool.get(expandedId);
        if (prev) prev.el.classList.remove('expanded');
      }
    }

    expandedId = wasExpanded ? null : evt.id;
    el.classList.toggle('expanded');
    heights[idx] = wasExpanded ? ROW_H : Math.max(ROW_H, el.offsetHeight);
    recalcOffsets();
    scheduleRender();
  };

  if (a) {
    const s = severity(a.severity);
    const metric = esc((a.metricType || '').replace(/_/g, ' '));
    const zone = esc(fmtZone(a.zone));
    const sensor = esc(a.sensorId || '?');
    const id = esc((a.id || '').slice(0, 8));
    const val = esc(String(a.triggeredValue ?? '?'));
    el.innerHTML =
      '<div class="event-left">' +
        '<div class="event-top">' +
          '<span class="badge ' + s.cls + '">' + s.label + '</span>' +
          '<span class="tag">' + metric + '</span>' +
          '<span class="tag">' + zone + '</span>' +
        '</div>' +
        '<div class="event-bottom">' +
          '<span>sensor ' + sensor + '</span>' +
          '<span>' + id + '</span>' +
        '</div>' +
        '<div class="raw">' + esc(JSON.stringify(evt.payload, null, 2)) + '</div>' +
      '</div>' +
      '<div class="event-right">' +
        '<div class="value">' + val + '</div>' +
        '<div class="time">' + esc(fmtTime(evt.receivedAt)) + '</div>' +
      '</div>';
  } else {
    el.innerHTML =
      '<div class="event-left">' +
        '<div class="event-top"><span class="tag">raw payload</span></div>' +
        '<div class="event-bottom"><span>' + esc(fmtTime(evt.receivedAt)) + '</span></div>' +
        '<div class="raw">' + esc(JSON.stringify(evt.payload, null, 2)) + '</div>' +
      '</div>';
  }

  return el;
}

function ensureFeed() {
  if (empty && empty.parentNode) empty.remove();
  if (!sentinel) {
    sentinel = document.createElement('div');
    sentinel.className = 'sentinel';
    feed.appendChild(sentinel);
  }
}

function updateCount() {
  countEl.textContent = items.length + ' event' + (items.length === 1 ? '' : 's');
}

function clearPool() {
  for (const [, entry] of pool) entry.el.remove();
  pool.clear();
}

function setEvents(evts) {
  clearPool();
  expandedId = null;
  items = evts;
  heights = new Array(evts.length).fill(ROW_H);
  ensureFeed();
  recalcOffsets();
  doRender();
  updateCount();
}

function addEvent(evt) {
  ensureFeed();
  items.unshift(evt);
  heights.unshift(ROW_H);
  const ids = Array.from(pool.keys());
  for (const id of ids) pool.get(id).idx++;
  recalcOffsets();
  doRender();
  updateCount();
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(proto + '//' + location.host + '/ws');
  ws.onopen = () => {
    dot.className = 'dot on';
    statusLabel.textContent = 'connected';
    retryMs = 500;
  };
  ws.onclose = () => {
    dot.className = 'dot off';
    statusLabel.textContent = 'disconnected';
    setTimeout(connect, Math.min(retryMs *= 1.5, 10000));
  };
  ws.onerror = (e) => {
    console.error('[pager] ws error', e);
  };
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (Array.isArray(msg)) { setEvents(msg); }
      else { addEvent(msg); }
    } catch (err) {
      console.error('[pager] failed to process message', err, e.data);
    }
  };
}

feed.addEventListener('scroll', scheduleRender, { passive: true });
window.addEventListener('resize', scheduleRender, { passive: true });
connect();
</script>
</body>
</html>`
}
