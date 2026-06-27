/*
 * society.js — 「사회 분석 · 비평 렌즈」
 * -----------------------------------------------------------------------------
 * ① 세계 데이터(실제 빅데이터·OWID): SDG 지표를 국가별로 읽고(추세·격차·기준선),
 *    실데이터를 데이터 점 스튜디오로 보내 작품으로.
 * ② 우리 이야기(직접 편집): 주체·관점·7비평렌즈·쟁점을 학생이 채워 자기 동네를 분석.
 *    관계망은 드래그·클릭으로 인터랙티브.
 */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => (window.UI ? UI.escapeHTML(s) : String(s));
  const LENS = ['공감', '대립', '형평', '참여', '책임', '연대', '지속가능'];
  const LENS_DESC = { 공감: '다른 입장을 헤아리는 정도', 대립: '갈등·반대의 팽팽함', 형평: '공정·기회의 균형', 참여: '시민이 목소리 내는 정도', 책임: '주체가 책임지는 정도', 연대: '함께 묶이는 힘', 지속가능: '미래까지 가는 힘' };

  // 로컬(직접 편집) 시나리오 — 교실·동네 단위
  const LOCAL = {
    village: { sdg: 'SDG 11 · 지속가능한 도시', title: '우리 동네', tag: '관점·관계·맥락 — 우리가 사는 세계를 데이터로 비평합니다.',
      subjects: ['이웃', '학교', '상점', '청소년', '노인', '환경', '시청'],
      ties: [['청소년', '학교', '공감', .7], ['노인', '환경', '공감', .6], ['이웃', '환경', '공감', .6], ['학교', '시청', '공감', .5], ['상점', '시청', '대립', .5], ['청소년', '노인', '대립', .4], ['상점', '이웃', '대립', .45]],
      perspectives: [['주민 생활', 31], ['환경·녹지', 22], ['청소년', 17], ['상권·경제', 12], ['행정', 10], ['노인 복지', 8]],
      lenses: { 공감: .70, 대립: .50, 형평: .62, 참여: .55, 책임: .80, 연대: .58, 지속가능: .66 },
      issues: [['놀이터 이전', 55], ['야간 소음 규제', 30], ['벽화 사업', 70]] },
    climate: { sdg: 'SDG 13 · 기후행동', title: '우리 학교의 탄소', tag: '편리함과 지구 사이 — 학교 일상을 기후의 눈으로.',
      subjects: ['학생', '급식실', '교실', '통학', '매점', '선생님', '지구'],
      ties: [['급식실', '지구', '대립', .6], ['통학', '지구', '대립', .55], ['학생', '선생님', '공감', .5], ['교실', '지구', '대립', .45], ['학생', '지구', '공감', .5], ['매점', '학생', '공감', .4], ['선생님', '지구', '공감', .5]],
      perspectives: [['에너지·냉난방', 28], ['급식·잔반', 24], ['통학·이동', 18], ['소비·매점', 14], ['인식·교육', 10], ['기타', 6]],
      lenses: { 공감: .55, 대립: .62, 형평: .50, 참여: .60, 책임: .78, 연대: .52, 지속가능: .84 },
      issues: [['일회용품 금지', 62], ['교실 적정온도', 45], ['채식 급식의 날', 58]] },
    digital: { sdg: 'SDG 16 · 디지털 시민', title: '스마트폰과 우리', tag: '연결과 외로움 사이 — 화면 너머의 관계.',
      subjects: ['나', '친구', 'SNS', '게임', '부모', '학교', '잠'],
      ties: [['SNS', '잠', '대립', .6], ['게임', '잠', '대립', .55], ['나', '친구', '공감', .6], ['SNS', '친구', '공감', .45], ['부모', '나', '대립', .5], ['학교', '나', '공감', .4], ['SNS', '나', '대립', .4]],
      perspectives: [['관계·소속', 27], ['수면·건강', 23], ['집중·학습', 18], ['비교·불안', 15], ['표현·창작', 11], ['기타', 6]],
      lenses: { 공감: .58, 대립: .54, 형평: .52, 참여: .56, 책임: .60, 연대: .62, 지속가능: .55 },
      issues: [['수업 중 폰 보관', 50], ['SNS 시간 합의', 56], ['디지털 디톡스 날', 62]] },
    custom: { sdg: '직접 분석 · 내가 정함', title: '내 동네·우리 반', tag: '주체·관점·렌즈·쟁점을 직접 채워 나만의 사회 분석을.',
      subjects: ['나', '친구', '선생님', '가족', '동네', '학교', '미래'],
      ties: [['나', '친구', '공감', .6], ['나', '가족', '공감', .6], ['학교', '미래', '공감', .5], ['동네', '학교', '공감', .4], ['친구', '미래', '대립', .4]],
      perspectives: [['관점 1', 30], ['관점 2', 25], ['관점 3', 20], ['관점 4', 15], ['관점 5', 10]],
      lenses: { 공감: .50, 대립: .50, 형평: .50, 참여: .50, 책임: .50, 연대: .50, 지속가능: .50 },
      issues: [['쟁점 1', 50], ['쟁점 2', 50], ['쟁점 3', 50]], editable: true }
  };
  const PALETTE = ['#182F49', '#8FC0B5', '#E6F5A6', '#3A4F7A', '#6E84B8', '#CFE0D6', '#2FB6A8', '#93A4E8'];

  let SDG = null, current = 'co2', type = 'sdg';
  const snapCache = {};
  let netPos = null, netHi = null;   // 관계망 위치·하이라이트

  const fmt = n => {
    if (n == null || n === '' || isNaN(n)) return '–';
    const a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (a >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e4) return Math.round(n).toLocaleString();
    return (Math.round(n * 100) / 100);
  };
  const stat = (v, l) => '<div class="st"><b>' + v + '</b><span>' + l + '</span></div>';
  function setHead(sdg, title, tag) { $('#soc-sdg').textContent = sdg; $('#soc-title').textContent = title; $('#soc-tag').textContent = tag; }
  function show(mode) { $('#mode-sdg').style.display = mode === 'sdg' ? '' : 'none'; $('#mode-local').style.display = mode === 'local' ? '' : 'none'; }
  function sparkSVG(arr, w, h) {
    w = w || 300; h = h || 40; const n = arr.length; if (n < 2) return '';
    const mn = Math.min.apply(null, arr), mx = Math.max.apply(null, arr), rg = (mx - mn) || 1;
    const pts = arr.map((v, i) => (i / (n - 1) * w).toFixed(1) + ',' + (h - 3 - (v - mn) / rg * (h - 6)).toFixed(1)).join(' ');
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '" preserveAspectRatio="none"><polyline points="' + pts + '" fill="none" stroke="#3A4F7A" stroke-width="2"/></svg>';
  }

  /* ============ ① 세계 데이터(실제) ============ */
  async function loadSnap(key) {
    if (snapCache[key]) return snapCache[key];
    const txt = await (await fetch('data/' + SDG[key].file + '.csv')).text();
    const lines = txt.replace(/^﻿/, '').trim().split(/\r?\n/);
    const rows = lines.slice(1).map(l => l.split(','));
    const vals = rows.map(r => +r[4]).filter(v => !isNaN(v));
    snapCache[key] = { rows, vals, csv: txt };
    return snapCache[key];
  }
  async function renderSDG(key) {
    const d = SDG[key];
    setHead(d.sdg + ' · ' + d.title, '세계 데이터 · ' + d.label, '실제 데이터로 세계를 읽어요 — ' + d.rows + '개국 (' + d.latestYear + ').');
    show('sdg');
    const chg = d.changePct == null ? '–' : ((d.changePct > 0 ? '+' : '') + d.changePct + '%');
    const dirWord = d.dir === 'good' ? '높을수록 좋음' : '높을수록 심각';
    $('#sdg-indicators').innerHTML =
      stat(fmt(d.globalNow) + (d.unit || ''), '세계 최근(' + d.latestYear + ')') +
      stat(chg, '변화 ' + d.yearThen + '→' + d.latestYear) +
      stat(d.gap ? d.gap + '배' : '–', '최고/중앙 격차') +
      stat(d.rows + '국', '데이터 범위');
    $('#sdg-trend').innerHTML = '<div class="lbl">🌍 전세계 추세 ' + d.yearThen + '–' + d.latestYear + ' <span class="muted">· ' + dirWord + '</span></div>' + sparkSVG(d.trend, 320, 44);
    const mx = Math.abs(d.top5[0][1]) || 1;
    const bars = arr => arr.map(([n, v]) => '<div class="bar-row"><span class="bl" style="flex-basis:140px">' + esc(n) + '</span><span class="bt"><span class="bf" style="width:' + Math.max(2, Math.round(Math.abs(v) / mx * 100)) + '%"></span></span><b class="bv">' + fmt(v) + '</b></div>').join('');
    $('#sdg-top').innerHTML = '<div class="lbl">🔺 가장 높은 5개국</div>' + bars(d.top5);
    $('#sdg-bottom').innerHTML = '<div class="lbl">🔻 가장 낮은 5개국</div>' + bars(d.bottom5);
    const snap = await loadSnap(key);
    const mn = Math.min.apply(null, snap.vals), mxv = Math.max.apply(null, snap.vals);
    const thr = $('#sdg-thr');
    thr.min = mn; thr.max = mxv; thr.step = ((mxv - mn) / 100) || 1; thr.value = (mn + mxv) / 2;
    renderThr(key);
    $('#sdg-source').innerHTML = '📥 <b>실제 데이터 받기</b> — <a class="dl" href="data/' + d.file + '.xlsx" download>엑셀</a> · <a class="dl" href="data/' + d.file + '.csv" download>CSV</a> · <a class="dl" href="' + d.source + '" target="_blank" rel="noopener">원본 전체(OWID)</a><br><span class="muted" style="font-size:10.5px">' + d.rows + '개국 · 색=대륙, 크기=값으로 매핑하면 ‘세계 격차’가 작품이 돼요.</span>';
  }
  function renderThr(key) {
    const d = SDG[key], snap = snapCache[key]; if (!snap) return;
    const t = +$('#sdg-thr').value;
    $('#sdg-thr-o').textContent = fmt(t) + (d.unit || '');
    const above = snap.vals.filter(v => v >= t).length;
    const word = d.dir === 'good' ? '기준 이상(양호)' : '기준 이상(심각)';
    $('#sdg-thr-status').innerHTML = '기준선을 움직여 보세요 — 현재 <b>' + above + ' / ' + snap.vals.length + '</b>개국이 ‘' + word + '’. 어디에 선을 그을지가 곧 ‘문제’의 정의예요.';
  }

  /* ============ ② 우리 이야기(편집·관계망) ============ */
  function L() { return LOCAL[current]; }
  function renderLocalHead() { const s = L(); setHead(s.sdg, '사회 분석 · 〈' + s.title + '〉', s.tag); }
  function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }
  function buildNetPos() {
    const s = L(), W = 360, H = 250, cx = W / 2, cy = H / 2, R = 92, n = s.subjects.length;
    netPos = {};
    s.subjects.forEach((sub, i) => { const a = -Math.PI / 2 + i / n * Math.PI * 2; netPos[sub] = [cx + Math.cos(a) * R, cy + Math.sin(a) * R]; });
  }
  function drawNetwork() {
    const s = L(), W = 360, H = 250;
    let edges = '', nodes = '';
    s.ties.forEach(([a, b, t, w]) => {
      if (!netPos[a] || !netPos[b]) return;
      const dim = netHi && netHi !== a && netHi !== b;
      const col = t === '공감' ? '#2FB6A8' : '#d0566a';
      edges += '<line x1="' + netPos[a][0] + '" y1="' + netPos[a][1] + '" x2="' + netPos[b][0] + '" y2="' + netPos[b][1] + '" stroke="' + col + '" stroke-width="' + (1 + w * 4).toFixed(1) + '" stroke-opacity="' + (dim ? .12 : .55) + '"/>';
    });
    s.subjects.forEach(sub => {
      const [x, y] = netPos[sub], on = !netHi || netHi === sub;
      nodes += '<circle class="node" data-sub="' + esc(sub) + '" cx="' + x + '" cy="' + y + '" r="8" fill="' + (netHi === sub ? '#2F6BE0' : '#3A4F7A') + '" opacity="' + (on ? 1 : .35) + '" style="cursor:grab"/>'
        + '<text x="' + x + '" y="' + (y < 125 ? y - 12 : y + 19) + '" text-anchor="middle" font-size="11.5" font-weight="600" fill="#0E1523" opacity="' + (on ? 1 : .35) + '" style="pointer-events:none">' + esc(sub) + '</text>';
    });
    $('#soc-network').innerHTML = '<svg id="net-svg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="max-width:420px;display:block;margin:0 auto;touch-action:none">' + edges + nodes + '</svg>'
      + '<div class="net-legend"><span><i style="background:#2FB6A8"></i>공감</span><span><i style="background:#d0566a"></i>대립</span><span class="muted">점을 끌거나 눌러 보세요</span></div>';
    wireNetwork();
  }
  function wireNetwork() {
    const svg = $('#net-svg'); if (!svg) return;
    let drag = null, moved = false;
    const pt = e => { const r = svg.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 360, (e.clientY - r.top) / r.height * 250]; };
    svg.addEventListener('pointerdown', e => {
      const c = e.target.closest('.node'); if (!c) return;
      drag = c.dataset.sub; moved = false; svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener('pointermove', e => {
      if (!drag) return; moved = true; netPos[drag] = pt(e); drawNetwork();
    });
    svg.addEventListener('pointerup', e => {
      if (drag && !moved) { netHi = (netHi === drag ? null : drag); drawNetwork(); }
      drag = null;
    });
  }
  function renderStats() {
    const s = L();
    const emp = avg(s.ties.filter(t => t[2] === '공감').map(t => t[3]));
    const con = avg(s.ties.filter(t => t[2] === '대립').map(t => t[3]));
    $('#soc-stats').innerHTML = stat(s.subjects.length, '주체 수') + stat(s.perspectives.length, '관점 수') + stat(emp.toFixed(2), '공감도') + stat(con.toFixed(2), '대립도');
  }
  function renderPersp() {
    const s = L();
    $('#soc-persp').innerHTML = s.perspectives.map(([name, pct], i) => {
      const col = PALETTE[i % PALETTE.length];
      return '<div class="bar-row"><span class="bl"><i style="background:' + col + '"></i>' + esc(name) + '</span><span class="bt"><span class="bf" style="width:' + pct + '%;background:' + col + '"></span></span><b class="bv">' + pct + '%</b></div>';
    }).join('');
  }
  function renderLenses() {
    const s = L();
    $('#soc-lenses').innerHTML = LENS.map(k => {
      const v = s.lenses[k], pct = Math.round(v * 100);
      return '<div class="bar-row" title="' + esc(LENS_DESC[k]) + '"><span class="bl">' + k + '</span><span class="bt"><span class="bf" style="width:' + pct + '%"></span></span><b class="bv">' + v.toFixed(2) + '</b></div>';
    }).join('');
  }
  function renderIssues() {
    const s = L(), conf = +$('#soc-conf').value;
    $('#soc-issues').innerHTML = s.issues.map(([name, pct]) => {
      const clear = Math.max(pct, 100 - pct) >= conf;
      return '<div class="issue"><div class="ih"><b>' + esc(name) + '</b><span class="tag ' + (clear ? 'on' : 'mid') + '">' + (clear ? '뚜렷' : '팽팽') + '</span></div><div class="ibar"><span class="ifill" style="width:' + pct + '%"></span><span class="ipct">찬성 ' + pct + '%</span></div></div>';
    }).join('');
  }
  function renderAdopt() {
    const s = L(), thr = +$('#soc-thr').value;
    $('#soc-thr-lo').textContent = thr;
    let adopted = 0, rows = '';
    LENS.forEach(k => { const v = s.lenses[k], ok = Math.round(v * 100) >= thr; if (ok) adopted++; rows += '<tr><td>' + k + '</td><td style="text-align:right">' + v.toFixed(2) + '</td><td><span class="tag ' + (ok ? 'on' : 'off') + '">' + (ok ? '채택' : '보류') + '</span></td></tr>'; });
    $('#soc-adopt-status').innerHTML = '슬라이더를 움직여 보세요. 임계값 이상만 ‘채택’됩니다. 현재 <b>' + adopted + '/7</b>개 렌즈가 채택되었어요.';
    $('#soc-adopt-table').innerHTML = '<table class="data"><thead><tr><th>렌즈</th><th style="text-align:right">값</th><th>상태</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }
  function renderEdit() {
    const s = L(), box = $('#soc-edit');
    if (!s.editable) { box.style.display = 'none'; return; }
    box.style.display = '';
    $('#soc-subjects').value = s.subjects.join(', ');
    $('#edit-lenses').innerHTML = LENS.map(k =>
      '<label class="elens">' + k + ' <output>' + s.lenses[k].toFixed(2) + '</output>'
      + '<input type="range" min="0" max="1" step="0.02" value="' + s.lenses[k] + '" data-lens="' + k + '"></label>').join('');
    $('#edit-issues').innerHTML = s.issues.map((it, i) =>
      '<div class="eissue"><input type="text" value="' + esc(it[0]) + '" data-issue-name="' + i + '" placeholder="쟁점"><input type="range" min="0" max="100" step="5" value="' + it[1] + '" data-issue-val="' + i + '"><output>' + it[1] + '%</output></div>').join('');
    box.querySelectorAll('[data-lens]').forEach(r => r.addEventListener('input', e => { s.lenses[e.target.dataset.lens] = +e.target.value; e.target.previousElementSibling.textContent = (+e.target.value).toFixed(2); renderLenses(); renderAdopt(); }));
    box.querySelectorAll('[data-issue-val]').forEach(r => r.addEventListener('input', e => { s.issues[+e.target.dataset.issueVal][1] = +e.target.value; e.target.nextElementSibling.textContent = e.target.value + '%'; renderIssues(); }));
    box.querySelectorAll('[data-issue-name]').forEach(r => r.addEventListener('input', e => { s.issues[+e.target.dataset.issueName][0] = e.target.value; renderIssues(); }));
    // 관계(엣지) 편집
    const ee = $('#edit-edges');
    if (ee) {
      ee.innerHTML = s.ties.length ? s.ties.map((t, i) => '<span class="eedge"><span class="tag ' + (t[2] === '공감' ? 'on' : 'mid') + '">' + t[2] + '</span> ' + esc(t[0]) + ' — ' + esc(t[1]) + ' <button class="ex" data-del="' + i + '" title="삭제">✕</button></span>').join('') : '<span class="muted" style="font-size:11px">연결이 없어요. 아래에서 추가하세요.</span>';
      const opts = s.subjects.map(x => '<option>' + esc(x) + '</option>').join('');
      $('#edit-addedge').innerHTML = '<select id="ae-a">' + opts + '</select><select id="ae-t"><option>공감</option><option>대립</option></select><select id="ae-b">' + opts + '</select><button id="ae-add" class="btn sm">연결 추가</button>';
      ee.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => delEdge(+b.dataset.del)));
      const aa = $('#ae-add'); if (aa) aa.addEventListener('click', addEdge);
    }
  }
  function applySubjects() {
    const s = L(), list = $('#soc-subjects').value.split(',').map(x => x.trim()).filter(Boolean).slice(0, 9);
    if (list.length < 3) { UI.toast('주체를 3개 이상 적어 주세요(쉼표로 구분).'); return; }
    s.subjects = list;
    s.perspectives = list.map((x, i) => [x, Math.round(100 / list.length)]);
    s.ties = s.ties.filter(t => list.includes(t[0]) && list.includes(t[1]));
    if (!s.ties.length) for (let i = 0; i < list.length - 1; i++) s.ties.push([list[i], list[i + 1], i % 2 ? '대립' : '공감', .5]);
    buildNetPos(); netHi = null; renderLocal();
    UI.toast('주체를 반영했어요 — 점을 끌어 관계를 배치해 보세요.');
  }
  function renderLocal() { renderLocalHead(); show('local'); buildNetPos(); netHi = null; drawNetwork(); renderStats(); renderPersp(); renderLenses(); renderIssues(); renderAdopt(); renderEdit(); }

  /* ============ 핸드오프(작업실로) ============ */
  function handoff() {
    let payload;
    if (type === 'sdg') {
      const d = SDG[current], snap = snapCache[current];
      if (!snap) { UI.toast('데이터 준비 중이에요. 잠시 후 다시.'); return; }
      payload = { name: '세계 데이터 · ' + d.title, issue: '🌍 ' + d.sdg + ' ' + d.label + ' — ' + d.rows + '개국 (' + d.latestYear + '). 색=대륙·크기=값으로 세계 격차를 작품으로.', csv: snap.csv, intent: '', omit: '' };
    } else {
      const s = L(), rows = [['항목', '분류', '값']];
      LENS.forEach(k => rows.push([k, '렌즈', Math.round(s.lenses[k] * 100)]));
      s.issues.forEach(([t, v]) => rows.push([String(t).replace(/,/g, ' '), '쟁점', v]));
      s.perspectives.forEach(([t, v]) => rows.push([String(t).replace(/,/g, ' '), '관점', v]));
      payload = { name: '사회 분석 · ' + s.title, issue: '🏙 ' + s.sdg + ' — ' + s.tag + ' (색=분류·크기=값으로 매핑)', csv: rows.map(r => r.join(',')).join('\n'), intent: '', omit: '' };
    }
    try { localStorage.setItem('dn_data_incoming', JSON.stringify(payload)); } catch (e) { UI.toast('전송 실패(용량).'); return; }
    UI.toast('데이터 점 스튜디오로 보냅니다…');
    setTimeout(() => location.href = 'studio-data.html', 600);
  }

  /* ============ 관계(엣지) 편집 ============ */
  function delEdge(i) { const s = L(); s.ties.splice(i, 1); buildNetPos(); netHi = null; drawNetwork(); renderStats(); renderEdit(); }
  function addEdge() {
    const s = L(), a = $('#ae-a').value, b = $('#ae-b').value, t = $('#ae-t').value;
    if (!a || !b || a === b) { UI.toast('서로 다른 두 주체를 고르세요.'); return; }
    if (s.ties.some(e => (e[0] === a && e[1] === b) || (e[0] === b && e[1] === a))) { UI.toast('이미 연결돼 있어요.'); return; }
    s.ties.push([a, b, t, 0.5]); drawNetwork(); renderStats(); renderEdit();
  }

  /* ============ 내 분석 저장/불러오기(계정) ============ */
  function scenarioState() { const s = L(); return { subjects: s.subjects, ties: s.ties, perspectives: s.perspectives, lenses: s.lenses, issues: s.issues, title: s.title, sdg: s.sdg, tag: s.tag }; }
  function applyState(st) { const c = LOCAL.custom; ['subjects', 'ties', 'perspectives', 'lenses', 'issues', 'title', 'sdg', 'tag'].forEach(k => { if (st[k]) c[k] = st[k]; }); }
  function curUser() { return (window.Auth && Auth.current) ? Auth.current() : null; }
  function setSaveInfo() { const u = curUser(), el = $('#soc-save-info'); if (el) el.textContent = u ? ('로그인: ' + (u.display || u.userId) + ' — 계정에 보관돼요') : '비로그인 — 이 기기에만 저장(로그인하면 계정에)'; }
  async function saveAnalysis() {
    const st = scenarioState();
    try { localStorage.setItem('dn_society_save', JSON.stringify(st)); } catch (e) {}
    const u = curUser();
    if (u && window.Store) {
      try { await Store.saveNote({ userId: u.userId, by: u.display || u.userId, kind: 'society', title: '사회분석 · ' + st.title, intent: st.tag, settings: st }); UI.toast('계정에 저장했어요(작업노트에서 확인).'); }
      catch (e) { UI.toast('계정 저장 실패 — 이 기기에만 저장됨.'); }
    } else UI.toast('이 기기에 저장했어요. (로그인하면 계정에 보관됩니다)');
    setSaveInfo();
  }
  async function loadAnalysis() {
    let st = null; const u = curUser();
    if (u && window.Store) { try { const notes = await Store.listNotes(u.userId); const n = (notes || []).find(x => x.kind === 'society'); if (n) st = n.settings; } catch (e) {} }
    if (!st) { try { st = JSON.parse(localStorage.getItem('dn_society_save') || 'null'); } catch (e) {} }
    if (!st) { UI.toast('저장된 분석이 없어요. 먼저 저장해 보세요.'); return; }
    applyState(st); current = 'custom'; type = 'local'; $('#soc-scenario').value = 'custom'; renderLocal();
    UI.toast('저장된 분석을 불러왔어요.');
  }

  /* ============ 전환·초기화 ============ */
  function selectScenario(val) {
    if (SDG && SDG[val]) { type = 'sdg'; current = val; renderSDG(val); }
    else if (LOCAL[val]) { type = 'local'; current = val; renderLocal(); }
  }
  document.addEventListener('DOMContentLoaded', async () => {
    try { SDG = await (await fetch('data/sdg-meta.json')).json(); } catch (e) { SDG = {}; }
    // 시나리오 picker 채우기
    const sel = $('#soc-scenario');
    let html = '<optgroup label="🌍 세계 데이터 (실제 빅데이터·OWID)">';
    const order = ['co2', 'gini', 'poverty', 'unemployment', 'life', 'literacy', 'women', 'plastic', 'redlist', 'forest'];
    Object.keys(SDG).sort((a, b) => (order.indexOf(a) + 99) - (order.indexOf(b) + 99)).forEach(k => {
      html += '<option value="' + k + '">' + esc(SDG[k].sdg + ' · ' + SDG[k].label) + '</option>';
    });
    html += '</optgroup><optgroup label="🏫 우리 이야기 (직접 분석·편집)">'
      + '<option value="village">🏙 우리 동네</option><option value="climate">🌍 우리 학교의 탄소</option>'
      + '<option value="digital">📱 스마트폰과 우리</option><option value="custom">✏️ 직접 분석(빈 시나리오)</option></optgroup>';
    sel.innerHTML = html;
    sel.addEventListener('change', e => selectScenario(e.target.value));
    // 로컬 컨트롤
    $('#soc-conf').addEventListener('input', () => { $('#soc-conf-o').textContent = $('#soc-conf').value; renderIssues(); });
    $('#soc-thr').addEventListener('input', renderAdopt);
    $('#sdg-thr').addEventListener('input', () => renderThr(current));
    const ap = $('#soc-apply-subjects'); if (ap) ap.addEventListener('click', applySubjects);
    const sv = $('#soc-save'); if (sv) sv.addEventListener('click', saveAnalysis);
    const ld = $('#soc-load'); if (ld) ld.addEventListener('click', loadAnalysis);
    document.querySelectorAll('[data-send]').forEach(b => b.addEventListener('click', handoff));
    // 저장된 내 분석을 custom에 복원(있으면)
    try { const st = JSON.parse(localStorage.getItem('dn_society_save') || 'null'); if (st) applyState(st); } catch (e) {}
    setSaveInfo();
    // 시작: 첫 SDG
    const first = Object.keys(SDG)[0] || 'village';
    sel.value = first; selectScenario(first);
  });
})();
