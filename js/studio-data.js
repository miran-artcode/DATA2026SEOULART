/*
 * studio-data.js — 「데이터가 춤추는 점」 · 다중 열 CSV + 매핑 설계
 * -----------------------------------------------------------------------------
 * 데이터의 '어떤 열'을 점의 '어떤 특성'(크기·속도·방향·밀도·투명도·형태·색)으로
 * 매핑할지 학생이 직접 설계한다. 색은 색상환(color picker)에서 고르고, 범주(라벨)별로
 * 색·형태를 상세 지정할 수 있다. 속도·방향은 데이터의 '변화량'(특성)으로 움직인다.
 */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => (window.UI ? UI.escapeHTML(s) : String(s));
  // 캔버스 배경 팔레트(작품의 '공기'). 색 스튜디오와 동일한 6종.
  const BGS = { night: [7, 8, 13], black: [0, 0, 0], ink: [18, 10, 26], slate: [22, 26, 34], paper: [244, 240, 230], white: [248, 249, 252] };
  const bgRGB = () => { const c = BGS[state.bg] || BGS.night; return c[0] + ',' + c[1] + ',' + c[2]; };

  // 예시 데이터 — 뻔하지 않지만 교육적인 '진짜' 공개 데이터(수천~수만 행). data/ 폴더에 CSV·엑셀로 번들.
  // 고르면 추천 매핑이 함께 적용되고, 전체 데이터는 엑셀/CSV로 바로 받거나 원본(캐글)으로 연결된다.
  // 스튜디오는 부드러운 작품을 위해 균등 표본 일부만 그리고, '받은 파일'엔 더 많은 행이 들어 있다.
  const SAMPLES = {
    spotify: { name: '음악 감정 지도(Spotify)', file: 'spotify', bundleRows: 5000, fullRows: 32833, source: 'https://www.kaggle.com/datasets/maharshipandya/-spotify-tracks-dataset',
      map: { size: '에너지', colorMode: 'gradient', colorField: '긍정도', gradLow: '#2740c8', gradHigh: '#ffd23c', layout: 'flowField', motionStyle: 'wave', vib: 0.8 },
      issue: '🎵 음악 감정 — 긍정도(valence)와 에너지는 함께 가지 않아요. 색=긍정도(파랑↔노랑), 크기=에너지. 수천 곡의 ‘감정 지도’. (Spotify 오디오 특징)' },
    pokemon: { name: '강함의 모양(Pokémon)', file: 'pokemon', bundleRows: 1215, fullRows: 1215, source: 'https://www.kaggle.com/datasets/abcsds/pokemon',
      map: { size: '총합', colorMode: 'category', colorField: '타입', layout: 'flowField', motionStyle: 'orbit', vib: 0.6 },
      issue: '⚡ 강함의 모양 — 타입=색, 총합=크기. 전국도감 1,215마리의 ‘강함의 별자리’. 어떤 타입이 센가? 분포는 공평한가?' },
    ufo: { name: '목격의 사회학(UFO)', file: 'ufo', bundleRows: 5000, fullRows: 97714, source: 'https://www.kaggle.com/datasets/mysarahmadbhat/ufo-sightings',
      map: { size: '지속초', shape: '모양', colorMode: 'category', colorField: '모양', layout: 'flowField', motionStyle: 'wave', vib: 0.7 },
      issue: '👽 목격의 사회학 — 모양=형태·색, 지속시간=크기. 목격은 영화·미디어와 함께 출렁여요 — 데이터는 ‘외계인’이 아니라 ‘사회’를 말해요(미디어 리터러시). (NUFORC)' },
    meteorite: { name: '하늘에서 온 것들(운석)', file: 'meteorites', bundleRows: 5000, fullRows: 45716, source: 'https://www.kaggle.com/datasets/nasa/meteorite-landings',
      map: { size: '질량g', colorMode: 'category', colorField: '낙하', layout: 'flowField', motionStyle: 'burst', vib: 0.5 },
      issue: '🌑 하늘에서 온 것들 — 질량=크기(몇 g~수십 톤!). 거대 운석 몇 개가 화면을 지배해요 — 왜 로그 스케일이 필요할까? 색=목격/발견(관측 편향). (NASA)' },
    earthquake: { name: '떨림의 데이터(지진)', file: 'earthquakes', bundleRows: 8265, fullRows: null, source: 'https://www.kaggle.com/datasets/usgs/earthquake-database',
      map: { size: '규모', colorMode: 'gradient', colorField: '깊이km', gradLow: '#2740c8', gradHigh: '#ff5a3c', layout: 'flowField', motionStyle: 'vibrate', vib: 1.8 },
      issue: '🌋 떨림의 데이터 — 규모=크기·떨림, 깊이=색. 1965~2024년 규모 6 이상 지진 8,265건. 지구는 쉬지 않고 떨려요(불의 고리·로그 규모). (USGS)' },
    chocolate: { name: '맛을 숫자로(초콜릿)', file: 'chocolate', bundleRows: 2530, fullRows: 2530, source: 'https://www.kaggle.com/datasets/rtatman/chocolate-bar-ratings',
      map: { size: '평점', colorMode: 'category', colorField: '원산지', layout: 'flowField', motionStyle: 'orbit', vib: 0.5 },
      issue: '🍫 맛을 숫자로 — 평점=크기, 원산지=색. 코코아%가 높다고 평점이 높진 않아요. 맛을 숫자로 옮길 때 잃는 것은?(데이터 휴머니즘) 2,530개 바.' },
    student: { name: '잠과 화면의 줄다리기(학생)', map: { size: 'SNS시간', speed: '스트레스', colorMode: 'gradient', colorField: '수면시간', gradLow: '#ff5a3c', gradHigh: '#2740c8', layout: 'flowField', motionStyle: 'vibrate', vib: 1.6 },
      issue: '😴 잠과 화면의 줄다리기 — 우리 반 친구들의 하루를 직접 입력해 만들어요(데이터 휴머니즘). SNS=크기, 수면=색(빨강=부족), 스트레스=떨림.',
      csv: '학생,수면시간,공부시간,SNS시간,스트레스,성적\nA,7,3,2,3,82\nB,5,4,5,7,75\nC,8,2,1,2,70\nD,4,5,6,9,68\nE,6,3,4,6,80\nF,7,4,3,4,88\nG,5,2,7,8,60\nH,6,5,2,5,90\nI,4,1,8,9,55\nJ,8,3,2,3,84\nK,5,4,5,7,72\nL,6,2,6,8,64' },
    emotion: { name: '(개인) 우리 반 하루 감정', issue: '🙂 내 삶의 데이터 — 숫자로는 평온해 보여도 사실은? (데이터 휴머니즘)', csv: '시간,감정온도,활동\n9시,3,수업\n10시,4,발표\n11시,3,토론\n12시,2,점심\n13시,2,휴식\n14시,1,체육\n15시,2,실습\n16시,4,정리\n17시,5,하교' }
  };
  const STUDIO_MAX = 1800;   // 부드러운 작품을 위한 렌더용 표본 상한(받은 파일엔 전체가 들어 있음)

  const state = {
    dataset: null, dataName: '',
    mapping: {
      size: null, speed: null, direction: null, density: null, alpha: null, shape: null,
      colorMode: 'gradient', colorField: null,
      gradLow: '#182F49', gradHigh: '#E6F5A6', solid: '#6E84B8',
      catColors: {}, catShapes: {}
    },
    baseSpeed: 1, vib: 1, trail: 200, layout: 'timeline', motionStyle: 'vibrate',
    pointScale: 1, cohesion: 1, bg: 'night'
  };
  let ruleA = null, ruleB = null, abFlag = false, P = null, p5i = null;

  /* ----------------------------- CSV 파싱 ----------------------------- */
  // 따옴표 인식 분할 — "값, 쉼표 포함"·""(이스케이프)을 올바로 처리(실제 CSV 필수).
  function splitLine(line, delim) {
    if (delim !== ',' && delim !== '\t') return line.split(delim);
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += ch;
      } else if (ch === '"') { q = true; }
      else if (ch === delim) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  }
  function parseData(text) {
    text = (text || '').replace(/^﻿/, '').trim(); if (!text) return null;
    const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
    if (!lines.length) return null;
    if (lines.length === 1 && !/[^\d.,;\s-]/.test(lines[0])) {       // 한 줄 숫자 목록
      const vals = lines[0].split(/[,\s;]+/).map(Number).filter(v => !isNaN(v));
      if (vals.length < 1) return null;
      return makeDataset([{ name: '값', type: 'num' }], vals.map(v => ({ '값': v })));
    }
    const head = lines[0];
    const delim = head.indexOf(',') >= 0 ? ',' : /\t/.test(head) ? '\t' : /\s{2,}/.test(head) ? /\s+/ : ',';
    const cells = lines.map(l => splitLine(l, delim).map(c => c.trim()));
    return cellsToDataset(cells);
  }
  // 2차원 셀 배열(CSV·엑셀 공용) → dataset. 머리글 자동 인식 + 빈/중복 머리글 보정.
  function cellsToDataset(cells) {
    cells = (cells || []).map(r => (r || []).map(c => (c == null ? '' : String(c)).trim())).filter(r => r.some(c => c !== ''));
    if (!cells.length) return null;
    const firstNonNum = cells[0].some(c => c !== '' && isNaN(Number(c)));
    let header, body;
    if (firstNonNum && cells.length > 1) { header = cells[0].slice(); body = cells.slice(1); }
    else { header = cells[0].map((_, i) => '열' + (i + 1)); body = cells; }
    const seen = {};
    header = header.map((h, i) => { let n = h || ('열' + (i + 1)); while (seen[n]) n = n + '·' + (i + 1); seen[n] = 1; return n; });
    const cols = header.length;
    const rows = body.filter(r => r.some(c => c !== '')).map(r => { const o = {}; for (let c = 0; c < cols; c++) o[header[c]] = r[c] != null ? r[c] : ''; return o; });
    // 실데이터 결측 마커(NA·N/A·null·NaN·-·.)를 빈 값으로 취급해 숫자 열을 올바로 인식.
    const BLANK = v => { const s = String(v == null ? '' : v).trim(); return s === '' || /^(na|n\/a|nan|null|none|nil|-|\.|#n\/a)$/i.test(s); };
    const fields = header.map(name => {
      const someVal = rows.some(o => !BLANK(o[name]));
      const allNum = rows.every(o => BLANK(o[name]) || !isNaN(Number(o[name])));
      return { name, type: (allNum && someVal) ? 'num' : 'cat' };
    });
    fields.forEach(f => { if (f.type === 'num') rows.forEach(o => { o[f.name] = BLANK(o[f.name]) ? null : Number(o[f.name]); }); });
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
    ds = capForStudio(ds);                                          // 너무 많으면 렌더용 균등 표본으로(원본 행수는 _fullN)
    state.dataset = ds; if (name != null) state.dataName = name;
    const dd = $('#dataset-download'); if (dd) dd.innerHTML = '';    // loadSample이 샘플일 때 다시 채움
    autoMapping(); populateFieldSelects(); renderFieldChips(); renderColorUI(); build(); renderAnalysis();
    const full = ds._fullN || ds.n;
    $('#data-info').textContent = (state.dataName || '데이터') + ' · '
      + (full > ds.n ? '원본 ' + full.toLocaleString() + '행 중 ' + ds.n.toLocaleString() + '행' : full.toLocaleString() + '행')
      + ' · 열 ' + ds.fields.length + '개';
  }
  function autoMapping() {
    const nums = numFields().map(f => f.name), cats = catFields().map(f => f.name), m = state.mapping;
    m.size = nums[0] || null; m.speed = nums[0] || null; m.direction = nums[0] || null;
    m.density = nums[1] || nums[0] || null; m.alpha = null; m.shape = cats[cats.length - 1] || null;
    m.colorMode = cats.length ? 'category' : 'gradient';
    m.colorField = m.colorMode === 'category' ? cats[0] : (nums[0] || null);
    m.catColors = {}; m.catShapes = {}; assignCatColors();
  }
  const PAL = ['#182F49', '#3A4F7A', '#6E84B8', '#8FC0B5', '#E6F5A6', '#93A4E8', '#2FB6A8', '#CFE0D6', '#0E0A2E', '#5B4BD6'];
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
  // 배치(레이아웃): 점이 '어디에서' 살지 — 시간축/원형/격자/값 산포
  function homeOf(i, n, W, H, marg, sizeNorm) {
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.42;
    if (state.layout === 'radial') {
      const a = (i / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2, rr = R * (0.45 + sizeNorm * 0.5);
      return { hx: cx + Math.cos(a) * rr, hy: cy + Math.sin(a) * rr, band: 14 + sizeNorm * 30 };
    }
    if (state.layout === 'grid') {
      const cols = Math.ceil(Math.sqrt(n)), rowsN = Math.ceil(n / cols), gx = i % cols, gy = (i / cols) | 0;
      return { hx: marg + (cols === 1 ? 0.5 : gx / (cols - 1)) * (W - marg * 2), hy: marg + (rowsN === 1 ? 0.5 : gy / (rowsN - 1)) * (H - marg * 2), band: 12 + sizeNorm * 24 };
    }
    if (state.layout === 'flowField') {
      return { hx: marg + (n === 1 ? 0.5 : i / (n - 1)) * (W - marg * 2), hy: H - marg - sizeNorm * (H - marg * 2), band: 14 + sizeNorm * 24 };
    }
    return { hx: marg + (n === 1 ? 0.5 : i / (n - 1)) * (W - marg * 2), hy: H / 2, band: 30 + sizeNorm * 90 }; // timeline
  }
  function build() {
    if (!p5i || !state.dataset) return;
    const W = p5i.width, H = p5i.height, n = state.dataset.n, marg = 50, arr = [];
    const big = n > 250;   // 빅데이터: 1점=1행(부드럽고 정직한 점구름). 작은 데이터: 풍성하게.
    for (let i = 0; i < n; i++) {
      const sizeNorm = state.mapping.size ? norm(state.mapping.size, i) : 0.5;
      const dv = state.mapping.density ? norm(state.mapping.density, i) : 0.5;
      const count = big ? 1 : (state.mapping.density ? Math.round(5 + dv * 45) : 16);
      const hm = homeOf(i, n, W, H, marg, sizeNorm);
      for (let k = 0; k < count; k++) {
        arr.push({ ri: i, hx: hm.hx + (Math.random() - 0.5) * 16, hy: hm.hy + (Math.random() - 0.5) * hm.band, px: hm.hx, py: hm.hy, vx: 0, vy: 0, ph: Math.random() * 6.28 });
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

  /* ----------------------------- 데이터 분석 · 매핑 제안 ----------------------------- */
  const fmtNum = v => (v == null || isNaN(v)) ? '–' : (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : (Math.round(v * 100) / 100));
  function seriesOf(name) { return state.dataset.rows.map(r => r[name]); }
  function numStats(name) {
    const vals = seriesOf(name).filter(v => v != null && !isNaN(v)).map(Number);
    const n = vals.length; if (!n) return null;
    const mean = vals.reduce((a, b) => a + b, 0) / n;
    const sorted = vals.slice().sort((a, b) => a - b);
    const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
    const min = sorted[0], max = sorted[n - 1];
    const std = Math.sqrt(vals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n);
    const first = vals[0], last = vals[n - 1], slope = n > 1 ? last - first : 0;
    const maxZ = std > 0 ? Math.max.apply(null, vals.map(v => Math.abs((v - mean) / std))) : 0;
    const cv = mean !== 0 ? std / Math.abs(mean) : 0;
    const ratio = median > 0 ? max / median : (min !== 0 ? Math.abs(max / min) : 0);
    return { n, mean, median, min, max, std, first, last, slope, maxZ, cv, ratio, vals, missing: state.dataset.rows.length - n };
  }
  function catStatsOf(name) {
    const counts = {}, order = [];
    seriesOf(name).forEach(v => { const s = String(v == null ? '' : v); if (s === '') return; if (counts[s] == null) { counts[s] = 0; order.push(s); } counts[s]++; });
    const total = order.reduce((a, c) => a + counts[c], 0);
    const top = order.slice().sort((a, b) => counts[b] - counts[a]);
    return { counts, cats: order, total, top, dominantShare: total ? counts[top[0]] / total : 0 };
  }
  // 불평등 신호는 '음수가 없고 평균>0'일 때만(평균이 0 근처면 변동계수가 왜곡되므로 추세로 판단)
  const ineqOK = s => s.min >= 0 && s.mean > 0;
  function numRead(s) {
    const p = [];
    if (s.n > 2 && Math.abs(s.slope) > s.std * 0.6) p.push(s.slope > 0 ? '값이 갈수록 커져요(상승)' : '값이 갈수록 작아져요(하락)');
    if (ineqOK(s) && s.cv > 0.6) p.push('편차가 매우 커요 — 쏠림·불평등');
    else if (s.cv < 0.15) p.push('대체로 고른 편');
    if (s.maxZ > 2.2) p.push('평균에서 크게 벗어난 값(이상치)');
    return p.length ? p.join(' · ') : '완만한 분포';
  }
  function detectProblem() {
    let best = null;
    numFields().forEach(f => {
      const s = numStats(f.name); if (!s) return;
      const ineq = ineqOK(s) ? Math.min(1, s.cv) : 0;
      const out = Math.min(1, Math.max(0, (s.maxZ - 2) / 2));
      const trend = s.std > 0 ? Math.min(1, Math.abs(s.slope) / (s.std * 3)) : 0;
      const score = Math.max(ineq, out, trend);
      const kind = (ineq >= out && ineq >= trend) ? 'inequality' : (trend >= out ? 'trend' : 'outlier');
      if (!best || score > best.score) best = { name: f.name, score, kind, s };
    });
    return best;
  }
  function diagText(pr) {
    const s = pr.s, nm = pr.name;
    if (pr.kind === 'inequality') return '‘' + nm + '’의 최댓값 ' + fmtNum(s.max) + '이(가) 중앙값 ' + fmtNum(s.median) + '의 약 ' + (s.ratio).toFixed(1) + '배 — 쏠림·불평등이 큽니다.';
    if (pr.kind === 'trend') return '‘' + nm + '’이(가) ' + (s.slope > 0 ? '꾸준히 상승' : '꾸준히 하락') + '(' + fmtNum(s.first) + '→' + fmtNum(s.last) + ') — 흐름이 만든 변화예요.';
    return '‘' + nm + '’에 평균에서 크게 벗어난 값(이상치)이 있어요 — 그 점이 곧 메시지일 수 있어요.';
  }
  function spark(vals) {
    const w = 132, h = 26, n = vals.length; if (n < 2) return '';
    const mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals), rg = (mx - mn) || 1;
    const pts = vals.map((v, i) => (i / (n - 1) * w).toFixed(1) + ',' + (h - 2 - ((v - mn) / rg) * (h - 4)).toFixed(1)).join(' ');
    return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none"><polyline points="' + pts + '" fill="none" stroke="var(--accent2)" stroke-width="1.5"/></svg>';
  }
  function datasetToCSV(ds) {
    const cols = ds.fields.map(f => f.name);
    return cols.join(',') + '\n' + ds.rows.map(r => cols.map(c => (r[c] == null ? '' : r[c])).join(',')).join('\n');
  }
  // 제안 적용: 한 열을 점의 한 특성으로(바로 작품에 반영)
  function applyMap(prop, field, mode) {
    if (prop === 'color') {
      state.mapping.colorMode = mode; state.mapping.colorField = field;
      if (mode === 'category') assignCatColors();
      const cm = $('#map-colormode'); if (cm) cm.value = mode;
    } else { state.mapping[prop] = field; }
    populateFieldSelects(); renderColorUI(); build();
    UI.toast('적용: ‘' + field + '’ → ' + ({ size: '크기', speed: '속도', color: '색', shape: '형태' }[prop] || prop));
  }
  // 문제 강조: 가장 강한 ‘문제 신호’ 열을 크기·색·배치·움직임으로 한 번에 드러낸다.
  function applyProblemPreset() {
    const pr = detectProblem();
    if (!pr) { UI.toast('수치 열이 없어 문제 강조를 못 해요.'); return; }
    const m = state.mapping;
    m.size = pr.name; m.speed = pr.name; m.direction = pr.kind === 'trend' ? pr.name : null;
    m.colorMode = 'gradient'; m.colorField = pr.name; m.gradLow = '#2740c8'; m.gradHigh = '#ff5a3c';
    state.layout = 'flowField'; state.motionStyle = 'vibrate'; state.vib = 1.8; state.cohesion = 0.9; state.baseSpeed = 1.2;
    syncMotion(); populateFieldSelects(); renderColorUI(); build();
    const diag = $('#analysis-diag');
    if (diag) diag.innerHTML = '<b>⚠ 문제 신호</b> · ' + esc(diagText(pr)) +
      '<br><span class="muted" style="font-size:11px">→ 큰 값일수록 크고 뜨겁게, 세로로 벌어지게, 변화는 떨림으로 — 데이터의 문제점을 작품으로 드러냈어요.</span>';
    UI.toast('문제 강조 적용 — ‘' + pr.name + '’의 ' + ({ inequality: '불평등', trend: '추세', outlier: '이상치' }[pr.kind]) + '을 시각화합니다.');
  }
  // 샘플의 '추천 매핑'을 적용(autoMapping을 덮어써 의미 있는 첫 작품을 보여준다)
  function applyRecommended(map) {
    if (!map) return; const m = state.mapping;
    ['size', 'speed', 'direction', 'density', 'alpha', 'shape'].forEach(k => { if (map[k] !== undefined) m[k] = map[k]; });
    if (map.colorMode) { m.colorMode = map.colorMode; if (map.colorField) m.colorField = map.colorField; if (m.colorMode === 'category') assignCatColors(); }
    if (map.gradLow) m.gradLow = map.gradLow; if (map.gradHigh) m.gradHigh = map.gradHigh;
    if (map.layout) state.layout = map.layout;
    if (map.motionStyle) state.motionStyle = map.motionStyle;
    if (map.vib != null) state.vib = map.vib;
    syncMotion(); populateFieldSelects(); renderColorUI(); build();
  }
  // 렌더 안정화: 행이 너무 많으면 범위를 보존하는 균등 표본으로 줄인다(_fullN에 원본 행수 보관).
  function capForStudio(ds) {
    if (!ds) return ds;
    if (ds.n <= STUDIO_MAX) { ds._fullN = ds.n; return ds; }
    const step = ds.n / STUDIO_MAX, rows = [];
    for (let i = 0; i < STUDIO_MAX; i++) rows.push(ds.rows[Math.floor(i * step)]);
    const capped = makeDataset(ds.fields, rows);
    capped._fullN = ds.n;
    return capped;
  }
  // 전체 데이터 다운로드(엑셀·CSV) + 원본 링크
  function renderDownload(s, shownN) {
    const el = $('#dataset-download'); if (!el) return;
    if (!s || !s.file) { el.innerHTML = ''; return; }
    const fmt = n => n ? n.toLocaleString() : '';
    el.innerHTML = '📥 <b>전체 데이터 받기</b> — '
      + '<a class="dl" href="data/' + s.file + '.xlsx" download>엑셀(.xlsx)</a> · '
      + '<a class="dl" href="data/' + s.file + '.csv" download>CSV</a>'
      + (s.source ? ' · <a class="dl" href="' + s.source + '" target="_blank" rel="noopener">원본(캐글' + (s.fullRows ? ' ' + fmt(s.fullRows) + '행' : '') + ')</a>' : '')
      + '<br><span class="muted" style="font-size:10.5px">받은 파일엔 <b>' + fmt(s.bundleRows) + '행</b>이 들어 있어요'
      + (shownN && s.bundleRows && shownN < s.bundleRows ? ' · 스튜디오는 그중 ' + fmt(shownN) + '행을 그려요(부드러운 작품)' : '') + '.</span>';
  }
  async function loadSample(key) {
    const s = SAMPLES[key]; if (!s) return;
    $('#in-dataname').value = s.name;
    const di = $('#data-issue');
    if (s.file) {
      $('#ta-data').value = '(' + s.name + ' · 원본 데이터에서 불러오는 중…)';
      if (di) di.textContent = '데이터 불러오는 중…';
      let csv;
      try { const r = await fetch('data/' + s.file + '.csv'); if (!r.ok) throw new Error(r.status); csv = await r.text(); }
      catch (e) { if (di) di.textContent = '데이터를 불러오지 못했어요(' + e.message + ').'; UI.toast('데이터 로드 실패'); return; }
      $('#ta-data').value = '(' + s.name + ' · 원본 데이터에서 불러옴 — 아래에서 전체 받기)';
      applyDataset(parseData(csv), s.name);
    } else {
      $('#ta-data').value = s.csv;
      applyDataset(parseData(s.csv), s.name);
    }
    if (s.map) applyRecommended(s.map);
    if (di) di.textContent = s.issue || '';
    renderDownload(s, state.dataset ? state.dataset.n : 0);
  }
  function renderAnalysis() {
    const host = $('#analysis-host'); if (!host || !state.dataset) return;
    const ds = state.dataset, cols = ds.fields.map(f => f.name);
    let html = '<div class="dprev"><table><thead><tr>' + cols.map(c => '<th>' + esc(c) + '</th>').join('') + '</tr></thead><tbody>';
    ds.rows.slice(0, 5).forEach(r => { html += '<tr>' + cols.map(c => '<td>' + esc(r[c] == null ? '' : r[c]) + '</td>').join('') + '</tr>'; });
    html += '</tbody></table></div><p class="muted" style="font-size:11px;margin:4px 0 8px">총 ' + ds.n + '행 · 열 ' + ds.fields.length + '개 (앞 5행)</p>';
    html += '<div id="analysis-diag" class="adiag"></div>';
    html += '<button id="btn-problem" class="btn wide accent2" style="margin:2px 0 12px">⚠ 문제 강조 — 데이터의 문제점을 작품으로</button>';
    ds.fields.forEach(f => {
      if (f.type === 'num') {
        const s = numStats(f.name); if (!s) return;
        let sig = '';
        if (ineqOK(s) && s.cv > 0.6) sig = '<span class="psig ineq">불평등</span>';
        else if (s.maxZ > 2.2) sig = '<span class="psig out">이상치</span>';
        else if (s.n > 2 && Math.abs(s.slope) > s.std * 0.8) sig = '<span class="psig tr">' + (s.slope > 0 ? '상승' : '하락') + '</span>';
        html += '<div class="acard"><div class="ahead"><b>' + esc(f.name) + '</b><span class="tnum">수치</span>' + sig + '</div>'
          + '<div class="aspark">' + spark(s.vals) + '</div>'
          + '<div class="astat">최소 ' + fmtNum(s.min) + ' · 평균 ' + fmtNum(s.mean) + ' · 최대 ' + fmtNum(s.max) + (s.missing ? ' · 빈칸 ' + s.missing : '') + '</div>'
          + '<div class="aread">' + esc(numRead(s)) + '</div>'
          + '<div class="asug"><button class="btn xs" data-sug="size" data-f="' + esc(f.name) + '">📏 크기</button>'
          + '<button class="btn xs" data-sug="color" data-f="' + esc(f.name) + '">🎨 색</button>'
          + '<button class="btn xs" data-sug="speed" data-f="' + esc(f.name) + '">⚡ 속도</button></div></div>';
      } else {
        const s = catStatsOf(f.name);
        const chips = s.top.slice(0, 6).map(c => '<span class="cchip">' + esc(c) + '·' + s.counts[c] + '</span>').join('');
        html += '<div class="acard"><div class="ahead"><b>' + esc(f.name) + '</b><span class="tcat">범주</span></div>'
          + '<div class="astat">' + s.cats.length + '종 · ' + chips + '</div>'
          + '<div class="asug"><button class="btn xs" data-sug="catcolor" data-f="' + esc(f.name) + '">🎨 범주색</button>'
          + '<button class="btn xs" data-sug="shape" data-f="' + esc(f.name) + '">▲ 형태</button></div></div>';
      }
    });
    host.innerHTML = html;
    host.querySelectorAll('[data-sug]').forEach(btn => btn.addEventListener('click', () => {
      const f = btn.dataset.f, k = btn.dataset.sug;
      if (k === 'size') applyMap('size', f);
      else if (k === 'speed') applyMap('speed', f);
      else if (k === 'color') applyMap('color', f, 'gradient');
      else if (k === 'catcolor') applyMap('color', f, 'category');
      else if (k === 'shape') applyMap('shape', f);
    }));
    const bp = $('#btn-problem'); if (bp) bp.addEventListener('click', applyProblemPreset);
  }

  /* ----------------------------- 다른 스튜디오에서 온 데이터 ----------------------------- */
  // 소리·사진·객체감지 스튜디오에서 보낸 데이터를 (있으면) 우선 로드한다.
  // p5 setup 타이밍과 무관하게 결정적으로 동작하도록 setup 안에서 '먼저' 호출한다.
  function loadIncoming() {
    let inc; try { inc = localStorage.getItem('dn_data_incoming'); } catch (e) { return false; }
    if (!inc) return false;
    let d; try { d = JSON.parse(inc); } catch (e) { try { localStorage.removeItem('dn_data_incoming'); } catch (_) {} return false; }
    try { localStorage.removeItem('dn_data_incoming'); } catch (e) {}
    const ds = parseData(d.csv); if (!ds || !ds.n) return false;
    const ta = $('#ta-data'); if (ta) ta.value = d.csv;
    const nm = $('#in-dataname'); if (nm) nm.value = d.name || '가져온 데이터';
    const it = $('#in-intent'); if (it && d.intent) it.value = d.intent;
    const ro = $('#rec-omit'); if (ro && d.omit) ro.value = d.omit;
    const ss = $('#sel-sample'); if (ss) ss.value = '';           // 샘플 드롭다운이 오해를 주지 않게
    applyDataset(ds, d.name || '가져온 데이터');
    const di = $('#data-issue'); if (di) di.textContent = d.issue || '🔗 다른 스튜디오에서 온 데이터예요 — 어떤 열을 점의 무엇으로 바꿀지 설계해 보세요.';
    if (window.UI) UI.toast('다른 스튜디오에서 온 데이터를 불러왔어요.');
    return true;
  }

  /* ----------------------------- p5 스케치 ----------------------------- */
  const sketch = p => {
    p.setup = () => {
      const st = $('#dstage'); const c = p.createCanvas(st.clientWidth, st.clientHeight); c.parent(st); p.pixelDensity(1);
      // 보낸 데이터가 있으면 그것을, 없으면 기본 샘플(기후위기)을 로드
      if (!loadIncoming()) {
        const ss = $('#sel-sample'); if (ss) ss.value = 'spotify';
        loadSample('spotify');
      }
    };
    p.windowResized = () => { const st = $('#dstage'); p.resizeCanvas(st.clientWidth, st.clientHeight); build(); };
    p.draw = () => {
      const ctx = p.drawingContext, bg = bgRGB();
      ctx.fillStyle = state.trail >= 255 ? 'rgb(' + bg + ')' : 'rgba(' + bg + ',' + (state.trail / 255) + ')';
      ctx.fillRect(0, 0, p.width, p.height);
      if (!P || !state.dataset) return;
      const m = state.mapping, mAct = p.mouseX > 0 && p.mouseY > 0 && p.mouseX < p.width && p.mouseY < p.height;
      const style = state.motionStyle, t = p.frameCount * 0.05, coh = state.cohesion;
      for (const o of P) {
        const i = o.ri;
        const sv = m.size ? norm(m.size, i) : 0.5;
        const dv = m.speed ? Math.abs(delta(m.speed, i)) : 0.25;
        const speed = state.baseSpeed * (0.35 + dv * 1.4);
        const dir = m.direction ? -Math.sign(delta(m.direction, i)) : 0;
        // 움직임 방식: 어떤 ‘식’으로 움직일지
        let ax, ay;
        if (style === 'orbit') {                         // home 주위를 도는 궤도
          ax = (o.hx - o.px) * 0.06 * coh; ay = (o.hy - o.py) * 0.06 * coh;
          const dx = o.px - o.hx, dy = o.py - o.hy;
          ax += -dy * 0.05 * (0.5 + speed); ay += dx * 0.05 * (0.5 + speed);
          ax += (Math.random() - 0.5) * state.vib * speed * 0.5; ay += (Math.random() - 0.5) * state.vib * speed * 0.5;
        } else if (style === 'wave') {                   // 시간에 따라 출렁이는 파동
          ax = (o.hx - o.px) * 0.06 * coh; ay = (o.hy - o.py) * 0.05 * coh;
          ay += Math.sin(t + o.ph + i * 0.25) * speed * 1.3;
          ax += (Math.random() - 0.5) * state.vib * speed * 0.4;
        } else if (style === 'burst') {                  // 방향대로 분출(약한 복귀)
          ax = (o.hx - o.px) * 0.02 * coh; ay = (o.hy - o.py) * 0.02 * coh;
          ay += dir * speed * 0.9; ax += (Math.random() - 0.5) * state.vib * speed; ay += (Math.random() - 0.5) * state.vib * speed;
        } else {                                         // vibrate(기본): 제자리 진동 + 방향 드리프트
          ax = (o.hx - o.px) * 0.06 * coh; ay = (o.hy - o.py) * 0.03 * coh;
          ay += dir * speed * 0.55;
          ax += (Math.random() - 0.5) * state.vib * speed; ay += (Math.random() - 0.5) * state.vib * speed;
        }
        if (mAct) { const dx = o.px - p.mouseX, dy = o.py - p.mouseY, d2 = dx * dx + dy * dy; if (d2 < 9000) { const d = Math.sqrt(d2) + .1, f = (1 - d / 95) * 4; ax += dx / d * f; ay += dy / d * f; } }
        o.vx = (o.vx + ax) * 0.9; o.vy = (o.vy + ay) * 0.9; o.px += o.vx; o.py += o.vy;
        const r = (1.5 + sv * 7 * (m.size ? 1 : 0.45)) * state.pointScale;
        ctx.globalAlpha = m.alpha ? (0.18 + norm(m.alpha, i) * 0.82) : 1;
        ctx.fillStyle = colorAt(i);
        drawShape(ctx, o.px, o.py, r, shapeAt(i));
      }
      ctx.globalAlpha = 1;
    };
  };

  /* ----------------------------- 규칙 A/B ----------------------------- */
  function snapRule() { return JSON.parse(JSON.stringify({ mapping: state.mapping, baseSpeed: state.baseSpeed, vib: state.vib, trail: state.trail, layout: state.layout, motionStyle: state.motionStyle, pointScale: state.pointScale, cohesion: state.cohesion, bg: state.bg })); }
  function applyRule(r) { if (!r) return; state.mapping = JSON.parse(JSON.stringify(r.mapping)); state.baseSpeed = r.baseSpeed; state.vib = r.vib; state.trail = r.trail; state.layout = r.layout || 'timeline'; state.motionStyle = r.motionStyle || 'vibrate'; state.pointScale = r.pointScale != null ? r.pointScale : 1; state.cohesion = r.cohesion != null ? r.cohesion : 1; state.bg = r.bg || 'night'; syncMotion(); populateFieldSelects(); renderColorUI(); build(); }
  function syncMotion() { $('#r-speed').value = state.baseSpeed; $('#o-speed').textContent = state.baseSpeed; $('#r-vib').value = state.vib; $('#o-vib').textContent = state.vib; $('#r-trail').value = state.trail; $('#o-trail').textContent = state.trail; const sl = $('#sel-layout'); if (sl) sl.value = state.layout; const sm = $('#sel-motionstyle'); if (sm) sm.value = state.motionStyle; const ps = $('#r-pscale'); if (ps) { ps.value = state.pointScale; $('#o-pscale').textContent = state.pointScale; } const co = $('#r-coh'); if (co) { co.value = state.cohesion; $('#o-coh').textContent = state.cohesion; } const sb = $('#sel-data-bg'); if (sb) sb.value = state.bg; }
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
    // 생성된 시각화를 더 선명하게(데이터셋이 큰 문서도 1MB 안에 들어오도록 예산은 보수적으로).
    if (window.ImgUtil) return ImgUtil.encode(p5i.canvas, { maxDim: 820, budget: 260000, quality: 0.82 });
    const w = 360, h = Math.round(w * p5i.height / p5i.width);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(p5i.canvas, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.6);
  }
  function settings() {
    const v = id => { const el = $('#' + id); return el ? el.value.trim() : ''; };
    return { mapping: state.mapping, baseSpeed: state.baseSpeed, vib: state.vib, trail: state.trail, layout: state.layout, motionStyle: state.motionStyle, pointScale: state.pointScale, cohesion: state.cohesion, bg: state.bg,
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

    // 요소별 안내(마우스 오버) — 학생이 무엇을 할지/왜 흥미로운지
    (function () {
      const tips = [
        '먼저 데이터를 골라요 — 사회문제 샘플 또는 직접 입력/CSV·엑셀. 작성 양식도 받을 수 있어요.',
        '올린 데이터를 자동 분석해요 — 열별 분포를 보고 한 번에 매핑하거나 ‘문제 강조’로 문제점을 드러내요.',
        '어떤 열을 점의 어떤 특성(크기·속도·방향·밀도·색·형태)으로 바꿀지 직접 설계해요.',
        '기본 속도·진동·잔상으로 움직임의 결을 정해요.',
        '‘객관적 데이터’ 뒤의 내 선택을 적어요 — 무엇을 셌고 무엇을 일부러 뺐는지.',
        '저장·전시 전에 의도 한 문장 + 근거 1개를 채워요(근거가 먼저).',
        '코치에게 질문받고, 이미지·작업노트·전시로 내보내요.'
      ];
      document.querySelectorAll('.dpanel > details > summary').forEach((s, i) => { if (tips[i]) s.title = tips[i]; });
      const tip = (sel, t) => { const el = $(sel); if (el) el.title = t; };
      tip('#r-speed', '전체 속도 — 작으면 잔잔, 크면 활발해요.');
      tip('#r-vib', '떨림 — 0이면 고요, 크면 들썩여요.');
      tip('#r-trail', '낮출수록 자취(궤적)가 남아 ‘흐름’이 보여요.');
      tip('#map-colormode', '수치는 그라데이션, 범주는 라벨별 색 — 색상환에서 직접 골라요.');
      tip('#sel-sample', '사회문제와 연결된 예시 — 의미 있는 시각화로.');
    })();

    $('#sel-sample').addEventListener('change', e => loadSample(e.target.value));
    $('#btn-apply-data').addEventListener('click', () => { const ds = parseData($('#ta-data').value); if (!ds) { UI.toast('데이터 형식을 확인하세요.'); return; } applyDataset(ds, $('#in-dataname').value || '내 데이터'); UI.toast('데이터를 적용했습니다.'); });
    $('#btn-upload-csv').addEventListener('click', () => $('#csv').click());
    $('#csv').addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      const base = f.name.replace(/\.[^.]+$/, '');
      if (/\.xlsx$/i.test(f.name) || (f.type && /sheet|excel/i.test(f.type))) {
        try {
          if (typeof XlsxReader === 'undefined') { UI.toast('엑셀 리더를 불러오지 못했어요. CSV로 올려 주세요.'); e.target.value = ''; return; }
          const { grid } = await XlsxReader.read(await f.arrayBuffer());
          const ds = cellsToDataset(grid);
          if (!ds || !ds.n) { UI.toast('엑셀에서 표를 읽지 못했어요(첫 시트에 표가 있나요?).'); e.target.value = ''; return; }
          $('#in-dataname').value = base;
          $('#ta-data').value = datasetToCSV(ds);
          applyDataset(ds, $('#in-dataname').value);
          UI.toast('엑셀을 분석했어요 · ' + ds.n + '행 · 열 ' + ds.fields.length + '개');
        } catch (err) { UI.toast('엑셀 읽기 실패: ' + (err && err.message ? err.message : err)); }
      } else {
        const r = new FileReader();
        r.onload = () => { $('#ta-data').value = r.result; $('#in-dataname').value = base; applyDataset(parseData(r.result), $('#in-dataname').value); };
        r.readAsText(f);
      }
      e.target.value = '';
    });
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
    rng('r-pscale', 'o-pscale', 'pointScale'); rng('r-coh', 'o-coh', 'cohesion');
    $('#sel-layout').addEventListener('change', e => { state.layout = e.target.value; build(); });
    $('#sel-motionstyle').addEventListener('change', e => { state.motionStyle = e.target.value; });
    $('#sel-data-bg').addEventListener('change', e => { state.bg = e.target.value; });

    $('#btn-ruleA').addEventListener('click', () => { ruleA = snapRule(); renderAB(); UI.toast('규칙 A 저장됨 — 매핑을 바꿔 규칙 B도 저장해 비교하세요.'); });
    $('#btn-ruleB').addEventListener('click', () => { ruleB = snapRule(); renderAB(); UI.toast('규칙 B 저장됨 — ‘A/B 전환’으로 비교하세요.'); });
    $('#btn-ab').addEventListener('click', () => { if (!ruleA || !ruleB) { UI.toast('먼저 규칙 A·B를 저장하세요.'); return; } abFlag = !abFlag; applyRule(abFlag ? ruleB : ruleA); renderAB(); UI.toast('적용: 규칙 ' + (abFlag ? 'B' : 'A')); });

    $('#btn-coach').addEventListener('click', coach);
    $('#btn-img').addEventListener('click', saveImage);
    $('#btn-note').addEventListener('click', saveNote);
    $('#btn-exhibit').addEventListener('click', exhibit);
    // (보낸 데이터 수신은 p5 setup의 loadIncoming()에서 결정적으로 처리)
  });
})();
