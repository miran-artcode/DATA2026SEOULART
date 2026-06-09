/*
 * studio-data.js — 「데이터가 춤추는 점」 (5.10.4) · 다중 열 CSV + 매핑 설계
 * -----------------------------------------------------------------------------
 * 데이터의 '어떤 열'을 점의 '어떤 특성'(크기·속도·방향·밀도·투명도·형태·색)으로
 * 매핑할지 학생이 직접 설계한다. 색은 색상환(color picker)에서 고르고, 범주(라벨)별로
 * 색·형태를 상세 지정할 수 있다. 속도·방향은 데이터의 '변화량'(특성)으로 움직인다.
 */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => (window.UI ? UI.escapeHTML(s) : String(s));

  const SAMPLES = {
    emotion: { name: '우리 반 하루 감정 온도', csv: '시간,감정온도\n9시,3\n10시,4\n11시,3\n12시,2\n13시,2\n14시,1\n15시,2\n16시,4\n17시,5' },
    classday: { name: '우리 반 하루(다중)', csv: '시간,감정온도,활동량,활동\n9시,3,200,수업\n10시,4,800,발표\n11시,3,1500,토론\n12시,2,400,점심\n13시,2,300,휴식\n14시,1,3000,체육\n15시,2,1800,실습\n16시,4,900,정리\n17시,5,300,하교' },
    temp: { name: '하루 기온(℃)', csv: '시간,기온\n0시,12\n3시,10\n6시,11\n9시,18\n12시,26\n15시,28\n18시,22\n21시,16' },
    weather: { name: '날씨 로그(다중)', csv: '시간,기온,습도,날씨\n6시,11,80,흐림\n9시,18,60,맑음\n12시,26,45,맑음\n15시,28,40,맑음\n18시,22,55,구름\n21시,16,70,비' }
  };

  const state = {
    dataset: null, dataName: '',
    mapping: {
      size: null, speed: null, direction: null, density: null, alpha: null, shape: null,
      colorMode: 'gradient', colorField: null,
      gradLow: '#2e86de', gradHigh: '#ff5a5f', solid: '#ffb454',
      catColors: {}, catShapes: {}
    },
    baseSpeed: 1, vib: 1, trail: 200
  };
  let ruleA = null, ruleB = null, abFlag = false, P = null, p5i = null;

  /* ----------------------------- CSV 파싱 ----------------------------- */
  function parseData(text) {
    text = (text || '').trim(); if (!text) return null;
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) return null;
    if (lines.length === 1 && !/[^\d.,;\s-]/.test(lines[0])) {       // 한 줄 숫자 목록
      const vals = lines[0].split(/[,\s;]+/).map(Number).filter(v => !isNaN(v));
      if (vals.length < 1) return null;
      return makeDataset([{ name: '값', type: 'num' }], vals.map(v => ({ '값': v })));
    }
    const delim = lines[0].indexOf(',') >= 0 ? ',' : /\t/.test(lines[0]) ? '\t' : /\s{2,}/.test(lines[0]) ? /\s+/ : ',';
    const cells = lines.map(l => (typeof delim === 'string' ? l.split(delim) : l.split(delim)).map(c => c.trim()));
    const firstNonNum = cells[0].some(c => c !== '' && isNaN(Number(c)));
    let header, body;
    if (firstNonNum && cells.length > 1) { header = cells[0]; body = cells.slice(1); }
    else { header = cells[0].map((_, i) => '열' + (i + 1)); body = cells; }
    const cols = header.length;
    const rows = body.filter(r => r.some(c => c !== '')).map(r => { const o = {}; for (let c = 0; c < cols; c++) o[header[c]] = r[c] != null ? r[c] : ''; return o; });
    const fields = header.map(name => {
      const someVal = rows.some(o => o[name] !== '' && o[name] != null);
      const allNum = rows.every(o => o[name] === '' || o[name] == null || !isNaN(Number(o[name])));
      return { name, type: (allNum && someVal) ? 'num' : 'cat' };
    });
    fields.forEach(f => { if (f.type === 'num') rows.forEach(o => { o[f.name] = (o[f.name] === '' || o[f.name] == null) ? null : Number(o[f.name]); }); });
    return makeDataset(fields, rows);
  }
  function makeDataset(fields, rows) {
    const stats = {};
    fields.forEach(f => {
      if (f.type === 'num') {
        let mn = Infinity, mx = -Infinity;
        rows.forEach(r => { const v = r[f.name]; if (v != null && !isNaN(v)) { if (v < mn) mn = v; if (v > mx) mx = v; } });
        if (mn === Infinity) { mn = 0; mx = 1; }
        stats[f.name] = { min: mn, max: mx, range: (mx - mn) || 1 };
      } else {
        const cats = [], seen = {};
        rows.forEach(r => { const v = String(r[f.name]); if (!seen[v]) { seen[v] = 1; cats.push(v); } });
        stats[f.name] = { cats };
      }
    });
    return { fields, rows, n: rows.length, stats };
  }
  const numFields = () => state.dataset ? state.dataset.fields.filter(f => f.type === 'num') : [];
  const catFields = () => state.dataset ? state.dataset.fields.filter(f => f.type === 'cat') : [];
  const fieldType = (name) => { const f = state.dataset.fields.find(x => x.name === name); return f ? f.type : 'num'; };
  function norm(field, i) { const st = state.dataset.stats[field]; if (!st || st.cats) return 0; const v = state.dataset.rows[i][field]; if (v == null || isNaN(v)) return 0; return Math.max(0, Math.min(1, (v - st.min) / st.range)); }
  function delta(field, i) { return i <= 0 ? 0 : norm(field, i) - norm(field, i - 1); }
  function fieldCats(field) { const st = state.dataset.stats[field]; if (st && st.cats) return st.cats; const seen = {}, cats = []; state.dataset.rows.forEach(r => { const v = String(r[field]); if (!seen[v]) { seen[v] = 1; cats.push(v); } }); return cats; }

  /* ----------------------------- 데이터 적용 ----------------------------- */
  function applyDataset(ds, name) {
    if (!ds || !ds.n) { UI.toast('데이터를 읽지 못했어요. 형식을 확인하세요.'); return; }
    state.dataset = ds; if (name != null) state.dataName = name;
    autoMapping(); populateFieldSelects(); renderFieldChips(); renderColorUI(); build();
    $('#data-info').textContent = (state.dataName || '데이터') + ' · ' + ds.n + '행 · 열 ' + ds.fields.length + '개';
  }
  function autoMapping() {
    const nums = numFields().map(f => f.name), cats = catFields().map(f => f.name), m = state.mapping;
    m.size = nums[0] || null; m.speed = nums[0] || null; m.direction = nums[0] || null;
    m.density = nums[1] || nums[0] || null; m.alpha = null; m.shape = cats[cats.length - 1] || null;
    m.colorMode = cats.length ? 'category' : 'gradient';
    m.colorField = m.colorMode === 'category' ? cats[0] : (nums[0] || null);
    m.catColors = {}; m.catShapes = {}; assignCatColors();
  }
  const PAL = ['#ff5a5f', '#ffb454', '#51d88a', '#4ec3ff', '#c08bff', '#f6e58d', '#ff8e53', '#2e86de', '#e056fd', '#00b3a4'];
  function assignCatColors() {
    if (state.mapping.colorMode !== 'category' || !state.mapping.colorField || !state.dataset) return;
    fieldCats(state.mapping.colorField).forEach((c, i) => { if (!state.mapping.catColors[c]) state.mapping.catColors[c] = PAL[i % PAL.length]; });
  }

  /* ----------------------------- 매핑 UI ----------------------------- */
  function fieldOptions(sel, kind, includeNone, selected) {
    if (!sel) return;
    const fields = kind === 'num' ? numFields() : state.dataset.fields;
    let html = includeNone ? '<option value="">— 없음 —</option>' : '';
    fields.forEach(f => { html += '<option value="' + esc(f.name) + '"' + (f.name === selected ? ' selected' : '') + '>' + esc(f.name) + (f.type === 'cat' ? '(범주)' : '') + '</option>'; });
    sel.innerHTML = html;
  }
  function populateFieldSelects() {
    if (!state.dataset) return;
    fieldOptions($('#map-size'), 'num', true, state.mapping.size);
    fieldOptions($('#map-speed'), 'num', true, state.mapping.speed);
    fieldOptions($('#map-dir'), 'num', true, state.mapping.direction);
    fieldOptions($('#map-density'), 'num', true, state.mapping.density);
    fieldOptions($('#map-alpha'), 'num', true, state.mapping.alpha);
    fieldOptions($('#map-shape'), 'any', true, state.mapping.shape);
    fieldOptions($('#map-colorfield'), state.mapping.colorMode === 'category' ? 'any' : 'num', false, state.mapping.colorField);
    $('#map-colormode').value = state.mapping.colorMode;
    $('#map-gradlow').value = state.mapping.gradLow; $('#map-gradhigh').value = state.mapping.gradHigh; $('#map-solid').value = state.mapping.solid;
  }
  function renderFieldChips() {
    const host = $('#field-list'); if (!host) return;
    host.innerHTML = state.dataset.fields.map(f => '<span class="chip ' + f.type + '">' + esc(f.name) + ' · ' + (f.type === 'num' ? '수치' : '범주') + '</span>').join('');
  }
  function renderColorUI() {
    const mode = state.mapping.colorMode;
    $('#color-field-row').style.display = mode === 'solid' ? 'none' : 'flex';
    $('#color-grad').style.display = mode === 'gradient' ? 'flex' : 'none';
    $('#color-solid').style.display = mode === 'solid' ? 'block' : 'none';
    const host = $('#label-config'); host.innerHTML = '';
    if (mode === 'category' && state.mapping.colorField) {
      assignCatColors();
      host.innerHTML += '<div class="muted" style="font-size:11.5px;margin:8px 0 4px">라벨별 색 (색상환에서 선택)</div>' +
        fieldCats(state.mapping.colorField).map(c => '<div class="label-item"><input type="color" data-catcolor="' + esc(c) + '" value="' + (state.mapping.catColors[c] || '#888888') + '"><span>' + esc(c) + '</span></div>').join('');
    }
    if (state.mapping.shape && fieldType(state.mapping.shape) === 'cat') {
      const cats = fieldCats(state.mapping.shape), names = { circle: '●원', tri: '▲삼각', sq: '■사각', diamond: '◆마름모' }, order = ['circle', 'tri', 'sq', 'diamond'];
      cats.forEach((c, i) => { if (!state.mapping.catShapes[c]) state.mapping.catShapes[c] = order[i % 4]; });
      host.innerHTML += '<div class="muted" style="font-size:11.5px;margin:10px 0 4px">라벨별 형태</div>' +
        cats.map(c => '<div class="label-item"><select data-catshape="' + esc(c) + '">' + order.map(s => '<option value="' + s + '"' + (s === state.mapping.catShapes[c] ? ' selected' : '') + '>' + names[s] + '</option>').join('') + '</select><span>' + esc(c) + '</span></div>').join('');
    }
    host.querySelectorAll('[data-catcolor]').forEach(inp => inp.addEventListener('input', e => { state.mapping.catColors[inp.dataset.catcolor] = e.target.value; }));
    host.querySelectorAll('[data-catshape]').forEach(sel => sel.addEventListener('change', e => { state.mapping.catShapes[sel.dataset.catshape] = e.target.value; }));
  }

  /* ----------------------------- 입자 생성 ----------------------------- */
  function build() {
    if (!p5i || !state.dataset) return;
    const W = p5i.width, H = p5i.height, n = state.dataset.n, marg = 50, arr = [];
    for (let i = 0; i < n; i++) {
      const hx = marg + (n === 1 ? 0.5 : i / (n - 1)) * (W - marg * 2);
      const dv = state.mapping.density ? norm(state.mapping.density, i) : 0.5;
      const count = state.mapping.density ? Math.round(5 + dv * 45) : 16;
      const band = 30 + (state.mapping.size ? norm(state.mapping.size, i) : 0.5) * 90;
      for (let k = 0; k < count; k++) {
        arr.push({ ri: i, hx: hx + (Math.random() - 0.5) * 16, hy: H / 2 + (Math.random() - 0.5) * band, px: hx, py: H / 2, vx: 0, vy: 0 });
      }
    }
    P = arr;
  }

  /* ----------------------------- 색/형태 ----------------------------- */
  function hexToRgb(h) { h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function lerpColor(a, b, t) { const A = hexToRgb(a), B = hexToRgb(b); return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ',' + Math.round(A[1] + (B[1] - A[1]) * t) + ',' + Math.round(A[2] + (B[2] - A[2]) * t) + ')'; }
  function colorAt(i) {
    const m = state.mapping;
    if (m.colorMode === 'solid') return m.solid;
    if (m.colorMode === 'category') { if (!m.colorField) return m.solid; return m.catColors[String(state.dataset.rows[i][m.colorField])] || '#888'; }
    return lerpColor(m.gradLow, m.gradHigh, m.colorField ? norm(m.colorField, i) : 0.5);
  }
  function shapeAt(i) {
    const f = state.mapping.shape; if (!f) return 'circle';
    if (fieldType(f) === 'cat') return state.mapping.catShapes[String(state.dataset.rows[i][f])] || 'circle';
    const v = norm(f, i); return v < 0.34 ? 'tri' : v < 0.67 ? 'circle' : 'sq';
  }
  function drawShape(ctx, x, y, r, shape) {
    ctx.beginPath();
    if (shape === 'sq') ctx.rect(x - r, y - r, r * 2, r * 2);
    else if (shape === 'tri') { ctx.moveTo(x, y - r * 1.25); ctx.lineTo(x + r * 1.1, y + r * 0.9); ctx.lineTo(x - r * 1.1, y + r * 0.9); ctx.closePath(); }
    else if (shape === 'diamond') { ctx.moveTo(x, y - r * 1.2); ctx.lineTo(x + r * 1.1, y); ctx.lineTo(x, y + r * 1.2); ctx.lineTo(x - r * 1.1, y); ctx.closePath(); }
    else ctx.arc(x, y, r, 0, 6.283);
    ctx.fill();
  }

  /* ----------------------------- p5 스케치 ----------------------------- */
  const sketch = p => {
    p.setup = () => {
      const st = $('#dstage'); const c = p.createCanvas(st.clientWidth, st.clientHeight); c.parent(st); p.pixelDensity(1);
      applyDataset(parseData(SAMPLES.emotion.csv), SAMPLES.emotion.name);
      $('#in-dataname').value = state.dataName; $('#ta-data').value = SAMPLES.emotion.csv;
    };
    p.windowResized = () => { const st = $('#dstage'); p.resizeCanvas(st.clientWidth, st.clientHeight); build(); };
    p.draw = () => {
      const ctx = p.drawingContext;
      ctx.fillStyle = state.trail >= 255 ? 'rgb(7,8,13)' : 'rgba(7,8,13,' + (state.trail / 255) + ')';
      ctx.fillRect(0, 0, p.width, p.height);
      if (!P || !state.dataset) return;
      const m = state.mapping, mAct = p.mouseX > 0 && p.mouseY > 0 && p.mouseX < p.width && p.mouseY < p.height;
      for (const o of P) {
        const i = o.ri;
        const sv = m.size ? norm(m.size, i) : 0.5;
        const dv = m.speed ? Math.abs(delta(m.speed, i)) : 0.25;
        const speed = state.baseSpeed * (0.35 + dv * 1.4);
        let ax = (o.hx - o.px) * 0.06, ay = (o.hy - o.py) * 0.03;
        if (m.direction) ay += -Math.sign(delta(m.direction, i)) * speed * 0.55;
        ax += (Math.random() - 0.5) * state.vib * speed; ay += (Math.random() - 0.5) * state.vib * speed;
        if (mAct) { const dx = o.px - p.mouseX, dy = o.py - p.mouseY, d2 = dx * dx + dy * dy; if (d2 < 9000) { const d = Math.sqrt(d2) + .1, f = (1 - d / 95) * 4; ax += dx / d * f; ay += dy / d * f; } }
        o.vx = (o.vx + ax) * 0.9; o.vy = (o.vy + ay) * 0.9; o.px += o.vx; o.py += o.vy;
        const r = 1.5 + sv * 7 * (m.size ? 1 : 0.45);
        ctx.globalAlpha = m.alpha ? (0.18 + norm(m.alpha, i) * 0.82) : 1;
        ctx.fillStyle = colorAt(i);
        drawShape(ctx, o.px, o.py, r, shapeAt(i));
      }
      ctx.globalAlpha = 1;
    };
  };

  /* ----------------------------- 규칙 A/B ----------------------------- */
  function snapRule() { return JSON.parse(JSON.stringify({ mapping: state.mapping, baseSpeed: state.baseSpeed, vib: state.vib, trail: state.trail })); }
  function applyRule(r) { if (!r) return; state.mapping = JSON.parse(JSON.stringify(r.mapping)); state.baseSpeed = r.baseSpeed; state.vib = r.vib; state.trail = r.trail; syncMotion(); populateFieldSelects(); renderColorUI(); build(); }
  function syncMotion() { $('#r-speed').value = state.baseSpeed; $('#o-speed').textContent = state.baseSpeed; $('#r-vib').value = state.vib; $('#o-vib').textContent = state.vib; $('#r-trail').value = state.trail; $('#o-trail').textContent = state.trail; }
  const MLBL = { size: '크기', speed: '속도', direction: '방향', density: '밀도', alpha: '투명도', shape: '형태' };
  function describeRule(r) {
    const m = r.mapping, parts = [];
    Object.keys(MLBL).forEach(k => { if (m[k]) parts.push(MLBL[k] + '←' + m[k]); });
    parts.push('색:' + ({ gradient: '그라데이션', category: '범주별', solid: '단색' }[m.colorMode] || m.colorMode));
    return parts.join(' · ') || '매핑 없음';
  }
  function diffRules(a, b) {
    const d = [];
    Object.keys(MLBL).forEach(k => { if ((a.mapping[k] || '') !== (b.mapping[k] || '')) d.push(MLBL[k]); });
    if (a.mapping.colorMode !== b.mapping.colorMode || a.mapping.colorField !== b.mapping.colorField) d.push('색');
    if (a.baseSpeed !== b.baseSpeed) d.push('속도'); if (a.vib !== b.vib) d.push('진동');
    return d.join(', ');
  }
  function renderAB() {
    const el = $('#ab-summary'); if (!el) return;
    if (!ruleA && !ruleB) { el.innerHTML = ''; return; }
    const s = [];
    if (ruleA) s.push('<b style="color:var(--good)">A</b> = ' + esc(describeRule(ruleA)));
    if (ruleB) s.push('<b style="color:var(--accent2)">B</b> = ' + esc(describeRule(ruleB)));
    if (ruleA && ruleB) s.push('<b style="color:var(--accent)">차이</b>: ' + (esc(diffRules(ruleA, ruleB)) || '없음') + ' — ‘A/B 전환’으로 비교해 보세요.');
    el.innerHTML = s.join('<br>');
  }

  /* ----------------------------- 코치 ----------------------------- */
  function rulesText() { return describeRule({ mapping: state.mapping }); }
  function mdToHtml(t) { return esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/_(.+?)_/g, '<i>$1</i>').replace(/\n/g, '<br>'); }
  async function coach() {
    UI.modal('🧭 감상 코치', '<div class="spinner"></div> 질문을 준비하는 중…', '답이 아니라 질문이에요');
    const res = await Coach.ask({ kind: 'data', intent: $('#in-intent').value, dataName: $('#in-dataname').value || state.dataName, rules: rulesText() });
    const note = res.source.indexOf('api') === 0 ? '실제 모델' : '오프라인 코치';
    UI.modal('🧭 감상 코치 <span class="badge">' + note + '</span>', '<div class="lvl-b">' + mdToHtml(res.text) + '</div>', '답이 아니라 질문이에요');
  }

  /* ----------------------------- 저장/전시 ----------------------------- */
  function thumb() {
    const w = 360, h = Math.round(w * p5i.height / p5i.width);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(p5i.canvas, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.6);
  }
  function settings() {
    const v = id => { const el = $('#' + id); return el ? el.value.trim() : ''; };
    return { mapping: state.mapping, baseSpeed: state.baseSpeed, vib: state.vib, trail: state.trail,
      dataName: $('#in-dataname').value || state.dataName,
      record: { sense: v('rec-sense'), count: v('rec-count'), omit: v('rec-omit'), scale: v('rec-scale'), miss: v('rec-miss') },
      fields: state.dataset ? state.dataset.fields : [], rows: state.dataset ? state.dataset.rows : [] };
  }
  function requireUser() { const u = Auth.current(); if (!u) { UI.toast('로그인이 필요합니다.'); setTimeout(() => location.href = 'index.html?next=studio-data.html', 900); return null; } return u; }
  async function saveNote() {
    const u = requireUser(); if (!u) return;
    await Store.saveNote({ userId: u.userId, by: u.display, kind: 'data', title: ($('#in-dataname').value || state.dataName), intent: $('#in-intent').value, evidence: $('#in-evidence').value, settings: settings() });
    UI.toast('작업노트에 저장했습니다.');
  }
  async function exhibit() {
    const u = requireUser(); if (!u) return;
    const intent = $('#in-intent').value.trim(), evidence = $('#in-evidence').value.trim();
    if (!intent || !evidence) { UI.toast('전시 전에 ‘의도 한 문장 + 근거 1개 이상’을 채워 주세요.'); return; }
    await Store.saveWork({ userId: u.userId, by: u.display, klass: u.klass, kind: 'data', title: ($('#in-dataname').value || state.dataName), intent, evidence, dataName: $('#in-dataname').value || state.dataName, settings: settings(), thumb: thumb(), exhibited: true });
    UI.toast('🎉 갤러리에 전시했습니다!');
  }
  function saveImage() { const a = document.createElement('a'); a.download = 'data_art_' + Date.now() + '.png'; a.href = p5i.canvas.toDataURL('image/png'); a.click(); UI.toast('이미지를 저장했습니다.'); }

  function downloadTemplate() {
    const csv = '시간,감정온도,활동량,활동\n9시,3,200,수업\n10시,4,800,발표\n11시,3,1500,토론\n12시,2,400,점심\n13시,2,300,휴식\n14시,1,3000,체육\n15시,2,1800,실습\n16시,4,900,정리\n17시,5,300,하교\n';
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.download = 'data_template.csv'; a.href = URL.createObjectURL(blob); a.click();
    UI.toast('CSV 양식을 받았어요. 열을 채워 ‘CSV 열기’로 올리면 자동 인식됩니다.');
  }

  /* ----------------------------- 이벤트 ----------------------------- */
  function rng(id, out, key) { const el = $('#' + id); el.addEventListener('input', () => { state[key] = +el.value; $('#' + out).textContent = el.value; }); }

  document.addEventListener('DOMContentLoaded', () => {
    UI.mountIdeaBar('idea', 'data');
    p5i = new p5(sketch);

    $('#sel-sample').addEventListener('change', e => { const s = SAMPLES[e.target.value]; if (!s) return; $('#ta-data').value = s.csv; $('#in-dataname').value = s.name; applyDataset(parseData(s.csv), s.name); });
    $('#btn-apply-data').addEventListener('click', () => { const ds = parseData($('#ta-data').value); if (!ds) { UI.toast('데이터 형식을 확인하세요.'); return; } applyDataset(ds, $('#in-dataname').value || '내 데이터'); UI.toast('데이터를 적용했습니다.'); });
    $('#btn-upload-csv').addEventListener('click', () => $('#csv').click());
    $('#csv').addEventListener('change', e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { $('#ta-data').value = r.result; if (!$('#in-dataname').value) $('#in-dataname').value = f.name.replace(/\.[^.]+$/, ''); applyDataset(parseData(r.result), $('#in-dataname').value); }; r.readAsText(f); });
    $('#btn-template').addEventListener('click', downloadTemplate);

    // 매핑 선택
    document.querySelectorAll('[data-map]').forEach(sel => sel.addEventListener('change', () => {
      const prop = sel.dataset.map; state.mapping[prop] = sel.value || null;
      if (prop === 'shape') renderColorUI();
      if (prop === 'density' || prop === 'size') build();
    }));
    $('#map-colormode').addEventListener('change', e => { state.mapping.colorMode = e.target.value; if (state.dataset) { fieldOptions($('#map-colorfield'), state.mapping.colorMode === 'category' ? 'any' : 'num', false, state.mapping.colorField); state.mapping.colorField = $('#map-colorfield').value || state.mapping.colorField; assignCatColors(); renderColorUI(); } });
    $('#map-colorfield').addEventListener('change', e => { state.mapping.colorField = e.target.value || null; assignCatColors(); renderColorUI(); });
    $('#map-gradlow').addEventListener('input', e => state.mapping.gradLow = e.target.value);
    $('#map-gradhigh').addEventListener('input', e => state.mapping.gradHigh = e.target.value);
    $('#map-solid').addEventListener('input', e => state.mapping.solid = e.target.value);

    rng('r-speed', 'o-speed', 'baseSpeed'); rng('r-vib', 'o-vib', 'vib'); rng('r-trail', 'o-trail', 'trail');

    $('#btn-ruleA').addEventListener('click', () => { ruleA = snapRule(); renderAB(); UI.toast('규칙 A 저장됨 — 매핑을 바꿔 규칙 B도 저장해 비교하세요.'); });
    $('#btn-ruleB').addEventListener('click', () => { ruleB = snapRule(); renderAB(); UI.toast('규칙 B 저장됨 — ‘A/B 전환’으로 비교하세요.'); });
    $('#btn-ab').addEventListener('click', () => { if (!ruleA || !ruleB) { UI.toast('먼저 규칙 A·B를 저장하세요.'); return; } abFlag = !abFlag; applyRule(abFlag ? ruleB : ruleA); renderAB(); UI.toast('적용: 규칙 ' + (abFlag ? 'B' : 'A')); });

    $('#btn-coach').addEventListener('click', coach);
    $('#btn-img').addEventListener('click', saveImage);
    $('#btn-note').addEventListener('click', saveNote);
    $('#btn-exhibit').addEventListener('click', exhibit);
  });
})();
