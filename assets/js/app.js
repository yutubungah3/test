/* ===========================================================
   Daily Breakdown Unit
   Membaca Google Sheets yang di-publish sebagai CSV.
   Mendukung dua bentuk spreadsheet:
     1. Layout dashboard (blok per site, unit & status berpasangan)
     2. Tabel berkolom rapi (satu baris = satu unit)
   =========================================================== */

const CONFIG = {
  /* URL "Publish to web → CSV" milikmu. */
  SHEET_CSV_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSod7Mdzh3NW4a8uyA1cXEF51Clo-8I1KapKosN5-XgOyqXMWYoQ31_vdM53RhGJn_s6m8ETxNeTjqi/pub?output=csv',

  REFRESH_MINUTES: 15,   // auto refresh; 0 = mati
  STALE_HOURS: 8,        // data dianggap usang lewat dari sini

  /* Kolom pemisah panel kiri/kanan pada layout dashboard.
     'auto' = deteksi dari celah terbesar antar kolom unit.
     Kalau penempatan site meleset, ganti dengan angka (mis. 14). */
  SPLIT_COL: 'auto',

  /* 'auto' = kolom hanya tampil bila ada isinya */
  DOWNTIME_COL: 'auto',
  HM_COL: 'auto',
};

/* ---------- definisi status (urutan tetap) ---------- */

const STATUSES = [
  { key: 'running',     label: 'Running',     icon: 'check',  tone: 'good' },
  { key: 'standby',     label: 'Standby',     icon: 'pause',  tone: 'warning' },
  { key: 'breakdown',   label: 'Breakdown',   icon: 'alert',  tone: 'critical' },
];

const TONE_VAR = {
  good: 'var(--st-good)',
  warning: 'var(--st-warning)',
  serious: 'var(--st-serious)',
  critical: 'var(--st-critical)',
};

/* Status persis — dipakai untuk sel pada layout dashboard,
   supaya teks seperti "BREAKDOWN REPORT" tidak ikut terbaca. */
const EXACT_STATUS = {
  RUNNING: 'running', OPERASI: 'running', OPERATION: 'running', NORMAL: 'running',
  JALAN: 'running', BEROPERASI: 'running', OK: 'running',

  STANDBY: 'standby', 'STAND BY': 'standby', IDLE: 'standby', SIAP: 'standby',
  MENUNGGU: 'standby', READY: 'standby',

  BREAKDOWN: 'breakdown', BD: 'breakdown', RUSAK: 'breakdown', DOWN: 'breakdown',
  MATI: 'breakdown', TROUBLE: 'breakdown', GAGAL: 'breakdown',
};

/* Pencocokan longgar — dipakai untuk sheet berkolom rapi. */
const STATUS_WORDS = [
  [/operas|operation|running|beroperasi|jalan|normal|\bok\b/i, 'running'],
  [/stand\s?by|siap|idle|menunggu|ready/i, 'standby'],
  [/break\s?down|\bbd\b|rusak|down|mati|trouble|gagal/i, 'breakdown'],
];

const ICONS = {
  check: '<path d="M3 8.5 6.2 12 13 4.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  pause: '<path d="M6 4v8M10 4v8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  wrench: '<path d="M9.4 2.6a3.6 3.6 0 0 0-3.2 5.4L2 12v2h2l4.1-4.2a3.6 3.6 0 0 0 5.4-3.2l-1.9-1.9-2.2 2.2-1.7-1.7 2.2-2.2z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  alert: '<path d="M8 1.8 14.5 13H1.5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8 6v3.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="8" cy="11" r="0.95" fill="currentColor"/>',
};

function icon(name) {
  return `<svg viewBox="0 0 16 16" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

/* ---------- data contoh (cadangan bila gagal memuat) ---------- */

const SAMPLE_ROWS = [
  ['Tanggal', 'Site', 'Kode Unit', 'Tipe', 'Status', 'Penyebab', 'Downtime (jam)', 'HM', 'Operator', 'Keterangan'],
  ['2026-10-03', 'Pit Utara', 'EX-2001', 'Excavator PC2000', 'Running', '', '0', '18420', 'Sugiyanto', 'Front loading OB'],
  ['2026-10-03', 'Pit Utara', 'EX-2002', 'Excavator PC1250', 'Breakdown', 'Hose hidrolik boom pecah', '5.25', '15120', 'Dedi', 'Tunggu part'],
  ['2026-10-03', 'Pit Utara', 'DT-3001', 'Dump Truck HD465', 'Running', '', '0', '24510', 'Rahmat', 'Hauling OB'],
  ['2026-10-03', 'Pit Utara', 'DT-3002', 'Dump Truck HD785', 'Standby', '', '0', '22180', '', 'Tunggu operator'],
  ['2026-10-03', 'Pit Selatan', 'DT-3003', 'Dump Truck HD465', 'Breakdown', 'Turbo', '2.5', '20880', 'Joko', ''],
  ['2026-10-03', 'Pit Selatan', 'DT-3004', 'Dump Truck HD785', 'Running', '', '0', '23760', 'Sari', ''],
  ['2026-10-03', 'Pit Selatan', 'BD-5001', 'Bulldozer D85', 'Standby', '', '0', '14020', '', ''],
];

/* ---------- util ---------- */

const $ = (sel) => document.querySelector(sel);

function norm(v) {
  return String(v == null ? '' : v).trim().toUpperCase().replace(/\s+/g, ' ');
}

function normalizeKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/* Angka Indonesia: 1.500 → 1500 · 5,25 → 5.25 · 1.234,5 → 1234.5 */
function parseNum(v) {
  if (v == null) return null;
  let s = String(v).trim();
  if (!s) return null;
  s = s.replace(/[^\d.,\-]/g, '');
  if (!s || !/[\d]/.test(s)) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma > -1) {
    const frac = s.slice(lastComma + 1);
    s = (frac.length === 3 && s.split(',').length === 2) ? s.replace(',', '') : s.replace(',', '.');
  } else if (lastDot > -1) {
    const frac = s.slice(lastDot + 1);
    s = (s.split('.').length > 2 || frac.length === 3) ? s.replace(/\./g, '') : s;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function mapStatus(raw) {
  const s = String(raw || '').trim();
  if (!s) return 'standby';
  const exact = EXACT_STATUS[norm(s)];
  if (exact) return exact;
  for (const [re, key] of STATUS_WORDS) if (re.test(s)) return key;
  return 'standby';
}

function numFmt(n, digits = 0) {
  if (n == null || !Number.isFinite(n)) return '–';
  return n.toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* ---------- parser CSV ---------- */

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const src = String(text).replace(/^﻿/, '');

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    if (c === '\r') continue;
    field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

function toGrid(rows) {
  const w = Math.max(1, ...rows.map((r) => r.length));
  return rows.map((r) => {
    const a = r.slice();
    while (a.length < w) a.push('');
    return a.map((c) => String(c == null ? '' : c).trim());
  });
}

/* ---------- deteksi nama site ---------- */

const NOT_SITE = /report|pekerjaan|perbaikan|^total|status|keterangan|catatan|^\d+\.|^unit\s*&|^daily|^laporan|^safety|availability|^fixed plant|senin|selasa|rabu|kamis|jumat|sabtu|minggu|\d{4}/i;

function isSiteName(cell) {
  const s = String(cell || '').trim();
  if (!s || s.length > 40) return false;
  if (s.split(/\s+/).length > 6) return false;
  if (EXACT_STATUS[norm(s)]) return false;
  if (NOT_SITE.test(s)) return false;
  return true;
}

/* ---------- Parser 1: layout dashboard ---------- */

const MONTHS = 'januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember';

function parseLayout(grid) {
  const sections = [];
  let cur = null;
  const meta = { title: '', date: '', summary: {} };

  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    const filled = row.map((c, i) => ({ c, i })).filter((o) => o.c !== '');

    /* judul + tanggal: sel berbentuk "NAMA | Sabtu, 03 Oktober 2026" */
    if (!meta.date) {
      for (const o of filled) {
        const m = o.c.match(new RegExp('(\\d{1,2}\\s+(?:' + MONTHS + ')\\s+\\d{4})', 'i'))
               || o.c.match(/(\d{1,2}[/-]\d{1,2}[/-]\d{4})/);
        if (m) {
          meta.date = m[1];
          if (o.c.includes('|')) meta.title = o.c.split('|')[0].trim();
          break;
        }
      }
    }

    /* baris ringkasan: label di satu baris, angkanya di baris bawahnya */
    if (!Object.keys(meta.summary).length && filled.length) {
      const labels = filled.filter((o) => /^total\s*unit$|^running$|^standby$|^breakdown$|^availability$/i.test(o.c.trim()));
      if (labels.some((o) => /total\s*unit/i.test(o.c)) && grid[r + 1]) {
        const below = grid[r + 1];
        for (const l of labels) {
          const v = below[l.i] || '';
          if (!v) continue;
          const key = normalizeKey(l.c).replace(/\s+/g, '');
          meta.summary[key] = /%/.test(v) ? parseNum(v.replace('%', '')) : parseNum(v);
        }
      }
    }

    /* Baris header site. Syarat: sedikit sel terisi, TANPA sel status —
       kalau ada status di baris itu, berarti baris data (mis. "FC 005 … STANDBY"),
       bukan nama site. */
    if (filled.length <= 3 && !row.some((c) => EXACT_STATUS[norm(c)])) {
      const names = filled.filter((o) => isSiteName(o.c));
      if (names.length) {
        cur = { sites: names.map((o) => o.c), hits: [], split: null };
        sections.push(cur);
        continue;
      }
    }

    if (!cur) continue;

    /* pasangan (unit → status): status ada di sel, unit di sel terdekat ke kiri */
    for (let c = 0; c < row.length; c++) {
      const st = EXACT_STATUS[norm(row[c])];
      if (!st) continue;
      for (let k = c - 1; k >= Math.max(0, c - 6); k--) {
        const cell = row[k];
        if (!cell) continue;
        if (EXACT_STATUS[norm(cell)]) break;              // jangan lompati status lain
        if (cur.hits.some((h) => h.row === r && h.unitCol === k)) break;
        cur.hits.push({ row: r, unitCol: k, statusCol: c, code: cell, status: st });
        break;
      }
    }
  }

  /* tentukan kolom pemisah panel kiri/kanan per bagian */
  for (const sec of sections) {
    const cols = [...new Set(sec.hits.map((h) => h.unitCol))].sort((a, b) => a - b);
    if (CONFIG.SPLIT_COL !== 'auto') {
      sec.split = Number(CONFIG.SPLIT_COL);
    } else if (sec.sites.length >= 2 && cols.length >= 2) {
      let gap = -1;
      for (let i = 1; i < cols.length; i++) {
        const g = cols[i] - cols[i - 1];
        if (g > gap) { gap = g; sec.split = cols[i - 1] + g / 2; }
      }
    }
  }

  /* kumpulkan baris laporan breakdown ("1. FCBN 05 — Replace Bearing ...") */
  const reportLines = [];
  for (const row of grid) {
    for (const cell of row) {
      if (!cell) continue;
      if (EXACT_STATUS[norm(cell)]) continue;
      if (/^\d+\s*[.)]\s+\S/.test(cell) || /—|–/.test(cell)) reportLines.push(cell);
    }
  }

  const units = [];
  const seen = new Set();
  for (const sec of sections) {
    for (const h of sec.hits) {
      const key = norm(h.code);
      if (seen.has(key)) continue;
      seen.add(key);
      let site = sec.sites[0];
      if (sec.split != null && sec.sites.length >= 2) {
        site = h.unitCol < sec.split ? sec.sites[0] : sec.sites[1];
      }
      units.push({
        code: h.code,
        site,
        type: '',
        status: h.status,
        statusRaw: h.status,
        cause: matchRemark(h.code, reportLines),
        downtime: null,
        hm: null,
        operator: '',
        note: '',
        date: meta.date,
      });
    }
  }

  /* buang site yang ternyata tidak punya unit */
  const used = new Set(units.map((u) => u.site));
  return { units, meta, dropped: sections.map((s) => s.sites).flat().filter((s) => !used.has(s)) };
}

function matchRemark(code, lines) {
  const esc = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('(^|[^\\w])' + esc + '(?![\\w])');
  for (const raw of lines) {
    const t = raw.replace(/^\s*\d+\s*[.)]\s*/, '').trim();
    if (!re.test(t)) continue;
    const out = t.replace(re, '').replace(/^[\s—–\-:|]+/, '').trim();
    if (out && out.length > 2) return out;
  }
  return '';
}

/* ---------- Parser 2: tabel berkolom rapi ---------- */

const COLUMN_RULES = {
  code:   [/^kode\s*unit$|^unit\s*code$|^no\s*unit$|^nomor\s*unit$|^unit$/i],
  site:   [/^site$|^lokasi$|^pit$|^location$|^area$|^daerah$/i],
  date:   [/^tanggal$|^tgl$|^date$/i],
  type:   [/^tipe$|^type$|^jenis$|^model$|^kategori$/i],
  status: [/^status$|^kondisi$|^state$|^keadaan$/i],
  cause:  [/^penyebab$|^sebab$|^cause$|^problem$/i],
  dt:     [/^down\s*time$|^downtime$|^dt$|^durasi$/i],
  hm:     [/^hm$|^hour\s*meter$|^jam\s*meter$/i],
  op:     [/^operator$|^driver$|^pengemudi$|^crew$/i],
  note:   [/^keterangan$|^catatan$|^note$|^remark$/i],
};

function buildColumnMap(header) {
  const map = {};
  const used = new Set();
  header.forEach((raw, idx) => {
    const h = normalizeKey(raw);
    if (!h) return;
    for (const [key, rules] of Object.entries(COLUMN_RULES)) {
      if (key in map || used.has(idx)) continue;
      if (rules.some((re) => re.test(h))) { map[key] = idx; used.add(idx); return; }
    }
  });
  if (!('code' in map)) map.code = 0;
  if (!('status' in map)) {
    for (let i = 0; i < header.length; i++) if (!used.has(i)) { map.status = i; break; }
  }
  return map;
}

function findTidyHeader(grid) {
  const limit = Math.min(grid.length, 15);
  for (let i = 0; i < limit; i++) {
    const cells = grid[i].map(normalizeKey);
    const hasCode = cells.some((c) => /^kode unit$|^unit code$|^kode$|^no unit$|^nomor unit$|^unit$/.test(c));
    const hasStatus = cells.some((c) => /^status$|^kondisi$|^state$/.test(c));
    if (hasCode && hasStatus) return i;
  }
  return -1;
}

function parseTidy(grid, headerIdx) {
  const map = buildColumnMap(grid[headerIdx]);
  const units = [];
  const meta = { title: '', date: '', summary: {} };
  let latest = '';

  for (let i = headerIdx + 1; i < grid.length; i++) {
    const r = grid[i];
    const code = String(r[map.code] ?? '').trim();
    if (!code) continue;
    if (/^(total|jumlah|subtotal)/i.test(code)) continue;

    const d = String(r[map.date] ?? '').trim();
    if (d && d > latest) latest = d;

    units.push({
      code,
      site: String(r[map.site] ?? '').trim() || 'Tanpa site',
      type: String(r[map.type] ?? '').trim(),
      status: mapStatus(r[map.status]),
      statusRaw: String(r[map.status] ?? '').trim(),
      cause: String(r[map.cause] ?? '').trim() || String(r[map.note] ?? '').trim(),
      downtime: map.dt != null ? parseNum(r[map.dt]) : null,
      hm: map.hm != null ? parseNum(r[map.hm]) : null,
      operator: String(r[map.op] ?? '').trim(),
      note: String(r[map.note] ?? '').trim(),
      date: d,
    });
  }
  meta.date = latest;
  return { units, meta, dropped: [] };
}

/* ---------- pilih parser ---------- */

function rowsToUnits(rows) {
  const grid = toGrid(rows);
  const tidyIdx = findTidyHeader(grid);
  if (tidyIdx >= 0) return { ...parseTidy(grid, tidyIdx), mode: 'tidy' };
  return { ...parseLayout(grid), mode: 'layout' };
}

/* ---------- keadaan aplikasi ---------- */

const state = {
  units: [],
  meta: {},
  mode: 'layout',
  source: 'sample',
  updatedAt: null,
  filter: { site: '__all__', status: '__all__', q: '' },
  sort: { key: 'status', dir: 'asc' },
};

const STATUS_RANK = { breakdown: 0, standby: 1, running: 2 };

function visibleUnits() {
  const { site, status, q } = state.filter;
  const query = q.trim().toLowerCase();

  const list = state.units.filter((u) => {
    if (site !== '__all__' && u.site !== site) return false;
    if (status !== '__all__' && u.status !== status) return false;
    if (query) {
      const hay = `${u.code} ${u.type} ${u.cause} ${u.operator} ${u.note} ${u.site}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });

  const { key, dir } = state.sort;
  const mul = dir === 'asc' ? 1 : -1;
  list.sort((a, b) => {
    let r = 0;
    if (key === 'status') r = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    else if (key === 'code') r = a.code.localeCompare(b.code, 'id', { numeric: true });
    else if (key === 'site') r = a.site.localeCompare(b.site, 'id');
    else if (key === 'downtime') r = (a.downtime ?? -1) - (b.downtime ?? -1);
    else if (key === 'hm') r = (a.hm ?? -1) - (b.hm ?? -1);
    else if (key === 'cause') r = (a.cause || '').localeCompare(b.cause || '', 'id');
    if (r === 0) r = a.code.localeCompare(b.code, 'id', { numeric: true });
    return r * mul;
  });
  return list;
}

function countBy(list) {
  const c = {};
  STATUSES.forEach((s) => { c[s.key] = 0; });
  list.forEach((u) => { c[u.status]++; });
  return c;
}

/* ---------- render ---------- */

function render() {
  renderStatusbar();
  renderFilters();
  renderKpis();
  renderSiteTable();
  renderTable();
}

function renderStatusbar() {
  const el = $('#statusbar');
  const sample = state.source === 'sample';
  const parts = [];

  parts.push(`<span class="pill"><span class="dotmark ${sample ? 'warning' : 'good'}"></span>${sample ? 'Data contoh' : 'Google Sheets'}</span>`);
  if (state.meta.title) parts.push(`<strong>${escapeHtml(state.meta.title)}</strong>`);
  if (state.meta.date) parts.push(`<span>${escapeHtml(state.meta.date)}</span>`);

  if (state.updatedAt) {
    const ageH = (Date.now() - state.updatedAt.getTime()) / 36e5;
    parts.push(`<span>Diupdate ${escapeHtml(state.updatedAt.toLocaleString('id-ID', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    }))}</span>`);
    if (!sample && ageH > CONFIG.STALE_HOURS) {
      parts.push(`<span class="pill"><span class="dotmark warning"></span>Data usang &gt; ${CONFIG.STALE_HOURS} jam</span>`);
    }
  }

  parts.push(`<span class="pill">${state.units.length} unit</span>`);
  el.innerHTML = parts.join(' <span style="color:var(--baseline)">·</span> ');
}

function renderFilters() {
  const sites = [...new Set(state.units.map((u) => u.site))].sort((a, b) => a.localeCompare(b, 'id'));
  const sel = $('#f-site');
  sel.innerHTML = ['<option value="__all__">Semua site</option>',
    ...sites.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`)].join('');
  sel.value = sites.includes(state.filter.site) ? state.filter.site : '__all__';
  state.filter.site = sel.value;

  const st = $('#f-status');
  st.innerHTML = ['<option value="__all__">Semua status</option>',
    ...STATUSES.map((s) => `<option value="${s.key}">${s.label}</option>`)].join('');
  st.value = state.filter.status;
}

function renderKpis() {
  const list = visibleUnits();
  const total = list.length || 1;
  const c = countBy(list);
  const downtime = list.reduce((a, u) => a + (u.downtime || 0), 0);
  const avail = ((c.running + c.standby) / total) * 100;

  const cards = STATUSES.map((s) => {
    const n = c[s.key];
    return `<div class="kpi">
        <div class="label">${icon(s.icon)}<span class="sw" style="color:${TONE_VAR[s.tone]}">●</span>${s.label}</div>
        <div class="value" style="color:${TONE_VAR[s.tone]}">${n}<span class="unit">unit</span></div>
        <div class="foot">${numFmt((n / total) * 100, 0)}% dari ${list.length} unit</div>
      </div>`;
  });

  cards.push(`
    <div class="kpi">
      <div class="label">Total unit</div>
      <div class="value">${list.length}</div>
      <div class="foot">terfilter</div>
    </div>
    <div class="kpi">
      <div class="label">Availability</div>
      <div class="value">${numFmt(avail, 1)}<span class="unit">%</span></div>
      <div class="foot">running + standby</div>
    </div>`);

  if (downtime > 0) {
    cards.splice(4, 0, `
      <div class="kpi">
        <div class="label">Total downtime</div>
        <div class="value">${numFmt(downtime, 1)}<span class="unit">jam</span></div>
        <div class="foot">akumulasi terfilter</div>
      </div>`);
  }

  $('#kpis').innerHTML = cards.join('');
}

function renderSiteTable() {
  const panel = $('#panel-site');
  if (state.units.length === 0) { panel.hidden = true; return; }
  panel.hidden = false;

  const sites = [...new Set(state.units.map((u) => u.site))].sort((a, b) => a.localeCompare(b, 'id'));
  const rows = sites.map((s) => {
    const list = state.units.filter((u) => u.site === s);
    const c = countBy(list);
    const avail = ((c.running + c.standby) / (list.length || 1)) * 100;
    return `<tr>
      <td class="code">${escapeHtml(s)}</td>
      ${STATUSES.map((x) => `<td class="num">${c[x.key] || '–'}</td>`).join('')}
      <td class="num">${list.length}</td>
      <td class="num">${numFmt(avail, 1)}%</td>
    </tr>`;
  }).join('');

  const tot = countBy(state.units);
  const totAvail = ((tot.running + tot.standby) / (state.units.length || 1)) * 100;

  $('#s-body').innerHTML = rows + `<tr class="totalrow">
      <td class="code">Semua site</td>
      ${STATUSES.map((x) => `<td class="num">${tot[x.key] || '–'}</td>`).join('')}
      <td class="num">${state.units.length}</td>
      <td class="num">${numFmt(totAvail, 1)}%</td>
    </tr>`;
}

function renderTable() {
  const list = visibleUnits();
  const head = $('#t-head');
  const body = $('#t-body');

  const hasDt = CONFIG.DOWNTIME_COL === 'auto'
    ? state.units.some((u) => u.downtime) : CONFIG.DOWNTIME_COL;
  const hasHm = CONFIG.HM_COL === 'auto'
    ? state.units.some((u) => u.hm != null) : CONFIG.HM_COL;
  const hasCause = state.units.some((u) => u.cause);

  const cols = [
    { key: 'code', label: 'Unit' },
    { key: 'status', label: 'Status' },
    { key: 'site', label: 'Site' },
  ];
  if (hasCause) cols.push({ key: 'cause', label: 'Penyebab / Keterangan' });
  if (hasDt) cols.push({ key: 'downtime', label: 'Downtime (jam)', num: true });
  if (hasHm) cols.push({ key: 'hm', label: 'HM', num: true });

  head.innerHTML = '<tr>' + cols.map((c) => {
    const active = state.sort.key === c.key;
    const arrow = active ? `<span class="arrow">${state.sort.dir === 'asc' ? '▲' : '▼'}</span>` : '';
    return `<th class="${c.num ? 'num' : ''} sortable" data-sort="${c.key}" tabindex="0" role="button">${c.label} ${arrow}</th>`;
  }).join('') + '</tr>';

  if (!list.length) {
    body.innerHTML = `<tr><td colspan="${cols.length}"><div class="empty">Tidak ada unit yang cocok dengan filter ini.</div></td></tr>`;
    $('#panel-table').querySelector('.note').textContent = '0 unit';
    return;
  }

  const maxDt = Math.max(1, ...list.map((u) => u.downtime || 0));

  body.innerHTML = list.map((u) => {
    const s = STATUSES.find((x) => x.key === u.status) || STATUSES[0];
    const sub = [u.type, u.operator].filter(Boolean).join(' · ');
    const pct = Math.max(0, Math.min(100, ((u.downtime || 0) / maxDt) * 100));
    return `<tr>
      <td class="code">${escapeHtml(u.code)}${sub ? `<span class="meta">${escapeHtml(sub)}</span>` : ''}</td>
      <td><span class="badge" style="--sc:${TONE_VAR[s.tone]}">${icon(s.icon)}${s.label}</span></td>
      <td>${escapeHtml(u.site)}</td>
      ${hasCause ? `<td class="cause">${u.cause ? escapeHtml(u.cause) : '<span class="empty">–</span>'}</td>` : ''}
      ${hasDt ? `<td class="num"><div class="meter"><span>${numFmt(u.downtime, 2)}</span><span class="track"><span class="fill" style="width:${pct}%"></span></span></div></td>` : ''}
      ${hasHm ? `<td class="num">${u.hm == null ? '–' : numFmt(u.hm)}</td>` : ''}
    </tr>`;
  }).join('');

  $('#panel-table').querySelector('.note').textContent = `${list.length} unit`;
}

/* ---------- rekonsiliasi dengan ringkasan di sheet ---------- */

function reconcile() {
  const s = state.meta.summary || {};
  if (!s.totalunit) return null;
  const c = countBy(state.units);
  const diffs = [];
  const pairs = [['totalunit', state.units.length], ['running', c.running],
                 ['standby', c.standby], ['breakdown', c.breakdown]];
  for (const [key, got] of pairs) {
    const want = s[key];
    if (want == null) continue;
    if (want !== got) diffs.push(`${key} ${got} ≠ ${want}`);
  }
  return diffs.length ? diffs : null;
}

/* ---------- ambil data ---------- */

function applyRows(rows, source) {
  const { units, meta, mode } = rowsToUnits(rows);
  if (!units.length) throw new Error('Tidak ada unit yang terbaca dari spreadsheet.');
  state.units = units;
  state.meta = meta;
  state.mode = mode;
  state.source = source;
  state.updatedAt = new Date();
}

function showBanner(kind, title, detail) {
  $('#banner').innerHTML = `<div class="banner ${kind === 'error' ? 'error' : ''}">
      <div><strong>${title}</strong><br>${detail}</div></div>`;
}

function load(isRefetch) {
  const url = (CONFIG.SHEET_CSV_URL || '').trim();
  if (isRefetch) $('#content').classList.add('stale');

  const done = () => {
    $('#content').classList.remove('stale');
    render();
    const diff = reconcile();
    if (diff) {
      showBanner('info', 'Hasil baca berbeda dengan ringkasan di sheet.',
        `${escapeHtml(diff.join(' · '))}. Kemungkinan ada baris yang tidak terbaca — cek ejaan status, atau atur <code>CONFIG.SPLIT_COL</code>.`);
    }
  };

  if (!url) {
    applyRows(SAMPLE_ROWS, 'sample');
    showBanner('info', 'Masih memakai data contoh.',
      'Isi <code>CONFIG.SHEET_CSV_URL</code> di <code>assets/js/app.js</code> dengan URL CSV hasil <em>Publish to web</em>.');
    done();
    return Promise.resolve();
  }

  return fetch(url, { cache: 'no-store' })
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
    .then((txt) => {
      if (/^\s*</.test(txt) || /Sign in|accounts\.google|<html/i.test(txt.slice(0, 400))) {
        throw new Error('Respons bukan CSV — spreadsheet belum dipublish ke web.');
      }
      applyRows(parseCsv(txt), 'sheet');
      $('#banner').innerHTML = '';
    })
    .catch((err) => {
      if (!state.units.length) applyRows(SAMPLE_ROWS, 'sample');
      showBanner('error', 'Gagal memuat spreadsheet.',
        `${escapeHtml(err.message)} — menampilkan data contoh. Lihat <code>PANDUAN-SPREADSHEET.md</code>.`);
    })
    .then(done);
}

/* ---------- ikat events ---------- */

function bind() {
  $('#f-site').addEventListener('change', (e) => { state.filter.site = e.target.value; render(); });
  $('#f-status').addEventListener('change', (e) => { state.filter.status = e.target.value; render(); });

  let t = null;
  $('#f-q').addEventListener('input', (e) => {
    clearTimeout(t);
    const v = e.target.value;
    t = setTimeout(() => { state.filter.q = v; render(); }, 180);
  });

  const sortHandler = (e) => {
    const th = e.target.closest('[data-sort]');
    if (!th) return;
    const key = th.dataset.sort;
    if (state.sort.key === key) state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
    else { state.sort.key = key; state.sort.dir = 'asc'; }
    render();
  };
  $('#t-head').addEventListener('click', sortHandler);
  $('#t-head').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const th = e.target.closest('[data-sort]');
    if (th) { e.preventDefault(); th.click(); }
  });

  $('#btn-reload').addEventListener('click', () => load(true));

  $('#btn-theme').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme;
    const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const next = cur ? (cur === 'dark' ? 'light' : 'dark') : (sysDark ? 'light' : 'dark');
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('dbu-theme', next); } catch (_) {}
  });

  try {
    const saved = localStorage.getItem('dbu-theme');
    if (saved) document.documentElement.dataset.theme = saved;
  } catch (_) {}

  if (CONFIG.REFRESH_MINUTES > 0) setInterval(() => load(true), CONFIG.REFRESH_MINUTES * 60000);
}

load().then(bind);
