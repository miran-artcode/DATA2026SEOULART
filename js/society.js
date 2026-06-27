/*
 * society.js — 「사회 분석 · 비평 렌즈」 (관점·관계·맥락)
 * -----------------------------------------------------------------------------
 * 사회 이슈를 7가지 비평 렌즈·관점 분포·관계망·쟁점 입장으로 '읽고',
 * 따라해보기(임계값 채택) → 내 작품(데이터 점 스튜디오로 핸드오프).
 * 데이터=사회현상을 드러내는 시각자료, 미술=비판적 재구성(사회참여).
 */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => (window.UI ? UI.escapeHTML(s) : String(s));
  const LENS = ['공감', '대립', '형평', '참여', '책임', '연대', '지속가능'];
  const LENS_DESC = { 공감: '다른 입장을 헤아리는 정도', 대립: '갈등·반대의 팽팽함', 형평: '공정·기회의 균형', 참여: '시민이 목소리 내는 정도', 책임: '주체가 책임지는 정도', 연대: '함께 묶이는 힘', 지속가능: '미래까지 가는 힘' };

  // SDG로 카테고리화한 사회 분석 시나리오. 각 시나리오 = 주체(관계망)·관점 분포·7렌즈·쟁점.
  const SCENARIOS = {
    village: { sdg: 'SDG 11 · 지속가능한 도시·공동체', title: '우리 동네', tag: '관점·관계·맥락 — 우리가 사는 세계를 데이터로 비평합니다.',
      subjects: ['이웃', '학교', '상점', '청소년', '노인', '환경', '시청'],
      ties: [['청소년', '학교', '공감', .7], ['노인', '환경', '공감', .6], ['이웃', '환경', '공감', .6], ['학교', '시청', '공감', .5], ['상점', '시청', '대립', .5], ['청소년', '노인', '대립', .4], ['상점', '이웃', '대립', .45]],
      perspectives: [['주민 생활', '#182F49', 31], ['환경·녹지', '#8FC0B5', 22], ['청소년', '#E6F5A6', 17], ['상권·경제', '#3A4F7A', 12], ['행정', '#6E84B8', 10], ['노인 복지', '#CFE0D6', 8]],
      lenses: { 공감: .70, 대립: .50, 형평: .62, 참여: .55, 책임: .80, 연대: .58, 지속가능: .66 },
      issues: [['놀이터 이전', 55], ['야간 소음 규제', 30], ['벽화 사업', 70]] },
    climate: { sdg: 'SDG 13 · 기후행동', title: '우리 학교의 탄소', tag: '편리함과 지구 사이 — 학교 일상을 기후의 눈으로.',
      subjects: ['학생', '급식실', '교실', '통학', '매점', '선생님', '지구'],
      ties: [['급식실', '지구', '대립', .6], ['통학', '지구', '대립', .55], ['학생', '선생님', '공감', .5], ['교실', '지구', '대립', .45], ['학생', '지구', '공감', .5], ['매점', '학생', '공감', .4], ['선생님', '지구', '공감', .5]],
      perspectives: [['에너지·냉난방', '#182F49', 28], ['급식·잔반', '#8FC0B5', 24], ['통학·이동', '#E6F5A6', 18], ['소비·매점', '#3A4F7A', 14], ['인식·교육', '#6E84B8', 10], ['기타', '#CFE0D6', 6]],
      lenses: { 공감: .55, 대립: .62, 형평: .50, 참여: .60, 책임: .78, 연대: .52, 지속가능: .84 },
      issues: [['일회용품 금지', 62], ['교실 적정온도', 45], ['채식 급식의 날', 58]] },
    inequality: { sdg: 'SDG 10 · 불평등 완화', title: '용돈과 기회', tag: '같은 교실, 다른 출발선 — 보이지 않는 격차를 데이터로.',
      subjects: ['학생A', '학생B', '학원', '가정', '학교', '지역', '진로'],
      ties: [['가정', '학원', '공감', .6], ['학생A', '진로', '공감', .55], ['학생B', '진로', '대립', .5], ['학원', '학생B', '대립', .5], ['학교', '지역', '공감', .45], ['가정', '학생A', '공감', .6], ['지역', '진로', '대립', .4]],
      perspectives: [['경제 자본', '#182F49', 30], ['교육 기회', '#8FC0B5', 23], ['정보 격차', '#E6F5A6', 16], ['지역 차이', '#3A4F7A', 13], ['심리·자존', '#6E84B8', 11], ['기타', '#CFE0D6', 7]],
      lenses: { 공감: .60, 대립: .55, 형평: .40, 참여: .48, 책임: .66, 연대: .50, 지속가능: .58 },
      issues: [['무상 교육 확대', 72], ['성적 줄세우기', 28], ['지역 균형 선발', 60]] },
    gender: { sdg: 'SDG 5 · 성평등', title: '교실 속 역할', tag: '당연하게 여긴 것들 — 역할과 기대를 다시 묻기.',
      subjects: ['여학생', '남학생', '교사', '반장', '동아리', '부모', '미디어'],
      ties: [['미디어', '남학생', '대립', .5], ['미디어', '여학생', '대립', .5], ['교사', '반장', '공감', .5], ['여학생', '동아리', '공감', .5], ['부모', '여학생', '대립', .4], ['부모', '남학생', '대립', .4], ['교사', '동아리', '공감', .45]],
      perspectives: [['역할 기대', '#182F49', 29], ['발언·주도', '#8FC0B5', 22], ['진로·동아리', '#E6F5A6', 18], ['외모·평가', '#3A4F7A', 14], ['미디어 영향', '#6E84B8', 11], ['기타', '#CFE0D6', 6]],
      lenses: { 공감: .64, 대립: .58, 형평: .46, 참여: .60, 책임: .62, 연대: .56, 지속가능: .60 },
      issues: [['반장 성비 균형', 66], ['체육 종목 선택제', 58], ['외모 발언 규칙', 74]] },
    consumption: { sdg: 'SDG 12 · 책임 있는 소비', title: '잔반과 패스트패션', tag: '버려지는 것들 — 편한 소비 뒤의 그림자.',
      subjects: ['학생', '급식실', '옷', '쓰레기', 'SNS', '지구', '업체'],
      ties: [['SNS', '옷', '공감', .6], ['옷', '쓰레기', '대립', .6], ['급식실', '쓰레기', '대립', .55], ['업체', '옷', '공감', .5], ['학생', 'SNS', '공감', .55], ['쓰레기', '지구', '대립', .6], ['학생', '지구', '공감', .45]],
      perspectives: [['음식물 쓰레기', '#182F49', 30], ['의류 폐기', '#8FC0B5', 24], ['과시·SNS', '#E6F5A6', 17], ['편의·가격', '#3A4F7A', 13], ['재활용', '#6E84B8', 10], ['기타', '#CFE0D6', 6]],
      lenses: { 공감: .52, 대립: .60, 형평: .48, 참여: .54, 책임: .76, 연대: .50, 지속가능: .82 },
      issues: [['잔반 제로 캠페인', 64], ['교복 물려주기', 70], ['SNS 과소비 경계', 46]] },
    digital: { sdg: 'SDG 16 · 평화·디지털 시민', title: '스마트폰과 우리', tag: '연결과 외로움 사이 — 화면 너머의 관계.',
      subjects: ['나', '친구', 'SNS', '게임', '부모', '학교', '잠'],
      ties: [['SNS', '잠', '대립', .6], ['게임', '잠', '대립', .55], ['나', '친구', '공감', .6], ['SNS', '친구', '공감', .45], ['부모', '나', '대립', .5], ['학교', '나', '공감', .4], ['SNS', '나', '대립', .4]],
      perspectives: [['관계·소속', '#182F49', 27], ['수면·건강', '#8FC0B5', 23], ['집중·학습', '#E6F5A6', 18], ['비교·불안', '#3A4F7A', 15], ['표현·창작', '#6E84B8', 11], ['기타', '#CFE0D6', 6]],
      lenses: { 공감: .58, 대립: .54, 형평: .52, 참여: .56, 책임: .60, 연대: .62, 지속가능: .55 },
      issues: [['수업 중 폰 보관', 50], ['SNS 시간 합의', 56], ['디지털 디톡스 날', 62]] }
  };

  let current = 'village';
  const sc = () => SCENARIOS[current];
  const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  /* ----------------------------- 렌더 ----------------------------- */
  function renderHead() {
    const s = sc();
    $('#soc-sdg').textContent = s.sdg;
    $('#soc-title').textContent = '사회 분석 · 〈' + s.title + '〉';
    $('#soc-tag').textContent = s.tag;
  }
  function renderNetwork() {
    const s = sc(), W = 360, H = 250, cx = W / 2, cy = H / 2, R = 92, n = s.subjects.length, pos = {};
    s.subjects.forEach((sub, i) => { const a = -Math.PI / 2 + i / n * Math.PI * 2; pos[sub] = [cx + Math.cos(a) * R, cy + Math.sin(a) * R]; });
    let edges = '', nodes = '';
    s.ties.forEach(([a, b, type, w]) => {
      if (!pos[a] || !pos[b]) return;
      const col = type === '공감' ? '#2FB6A8' : '#d0566a';
      edges += '<line x1="' + pos[a][0] + '" y1="' + pos[a][1] + '" x2="' + pos[b][0] + '" y2="' + pos[b][1] + '" stroke="' + col + '" stroke-width="' + (1 + w * 4).toFixed(1) + '" stroke-opacity="0.55"/>';
    });
    s.subjects.forEach(sub => {
      const [x, y] = pos[sub];
      nodes += '<circle cx="' + x + '" cy="' + y + '" r="6.5" fill="#3A4F7A"/>'
        + '<text x="' + x + '" y="' + (y < cy ? y - 11 : y + 18) + '" text-anchor="middle" font-size="11.5" font-weight="600" fill="#0E1523">' + esc(sub) + '</text>';
    });
    $('#soc-network').innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="max-width:420px;display:block;margin:0 auto">'
      + '<g>' + edges + '</g>' + nodes + '</svg>'
      + '<div class="net-legend"><span><i style="background:#2FB6A8"></i>공감</span><span><i style="background:#d0566a"></i>대립</span></div>';
  }
  function renderStats() {
    const s = sc();
    const emp = avg(s.ties.filter(t => t[2] === '공감').map(t => t[3]));
    const con = avg(s.ties.filter(t => t[2] === '대립').map(t => t[3]));
    $('#soc-stats').innerHTML =
      stat(s.subjects.length, '주체 수') + stat(s.perspectives.length, '관점 수') +
      stat(emp.toFixed(2), '공감도') + stat(con.toFixed(2), '대립도');
  }
  function stat(v, l) { return '<div class="st"><b>' + v + '</b><span>' + l + '</span></div>'; }
  function renderPersp() {
    const s = sc();
    $('#soc-persp').innerHTML = s.perspectives.map(([name, col, pct]) =>
      '<div class="bar-row"><span class="bl"><i style="background:' + col + '"></i>' + esc(name) + '</span>'
      + '<span class="bt"><span class="bf" style="width:' + pct + '%;background:' + col + '"></span></span>'
      + '<b class="bv">' + pct + '%</b></div>').join('');
  }
  function renderLenses() {
    const s = sc();
    $('#soc-lenses').innerHTML = LENS.map(k => {
      const v = s.lenses[k], pct = Math.round(v * 100);
      return '<div class="bar-row" title="' + esc(LENS_DESC[k]) + '"><span class="bl">' + k + '</span>'
        + '<span class="bt"><span class="bf" style="width:' + pct + '%"></span></span>'
        + '<b class="bv">' + v.toFixed(2) + '</b></div>';
    }).join('');
  }
  function renderIssues() {
    const s = sc(), conf = +$('#soc-conf').value;
    $('#soc-issues').innerHTML = s.issues.map(([name, pct]) => {
      const clear = Math.max(pct, 100 - pct) >= conf;
      return '<div class="issue"><div class="ih"><b>' + esc(name) + '</b>'
        + '<span class="tag ' + (clear ? 'on' : 'mid') + '">' + (clear ? '뚜렷' : '팽팽') + '</span></div>'
        + '<div class="ibar"><span class="ifill" style="width:' + pct + '%"></span><span class="ipct">찬성 ' + pct + '%</span></div></div>';
    }).join('');
  }
  function renderAdopt() {
    const s = sc(), thr = +$('#soc-thr').value;
    $('#soc-thr-o').textContent = thr;
    let adopted = 0, rows = '';
    LENS.forEach(k => {
      const v = s.lenses[k], pct = Math.round(v * 100), ok = pct >= thr;
      if (ok) adopted++;
      rows += '<tr><td>' + k + '</td><td style="text-align:right">' + v.toFixed(2) + '</td><td><span class="tag ' + (ok ? 'on' : 'off') + '">' + (ok ? '채택' : '보류') + '</span></td></tr>';
    });
    $('#soc-adopt-status').innerHTML = '슬라이더를 움직여 보세요. 임계값 이상만 ‘채택’됩니다. 현재 <b>' + adopted + '/7</b>개 렌즈가 채택되었어요.';
    $('#soc-adopt-table').innerHTML = '<table class="data"><thead><tr><th>렌즈</th><th style="text-align:right">값</th><th>상태</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }
  function renderAll() { renderHead(); renderNetwork(); renderStats(); renderPersp(); renderLenses(); renderIssues(); renderAdopt(); }

  /* ----------------------------- 작업실로(핸드오프) ----------------------------- */
  function toCSV() {
    const s = sc(), rows = [['항목', '분류', '값']];
    LENS.forEach(k => rows.push([k, '렌즈', Math.round(s.lenses[k] * 100)]));
    s.issues.forEach(([t, v]) => rows.push([t.replace(/,/g, ' '), '쟁점', v]));
    s.perspectives.forEach(([t, , v]) => rows.push([t.replace(/,/g, ' '), '관점', v]));
    return rows.map(r => r.join(',')).join('\n');
  }
  function sendToStudio() {
    const s = sc();
    const payload = { name: '사회 분석 · ' + s.title, issue: '🏙 ' + s.sdg + ' — ' + s.tag + ' (색=분류·크기=값으로 매핑해 보세요)', csv: toCSV(), intent: '', omit: '' };
    try { localStorage.setItem('dn_data_incoming', JSON.stringify(payload)); } catch (e) { UI.toast('전송 실패(용량).'); return; }
    UI.toast('데이터 점 스튜디오로 보냅니다…');
    setTimeout(() => location.href = 'studio-data.html', 600);
  }
  function downloadCSV() {
    const blob = new Blob(['﻿' + toCSV()], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.download = 'society_' + current + '.csv'; a.href = URL.createObjectURL(blob); a.click();
    UI.toast('분석 데이터를 CSV로 받았어요.');
  }

  /* ----------------------------- 초기화 ----------------------------- */
  document.addEventListener('DOMContentLoaded', () => {
    const sel = $('#soc-scenario');
    if (sel) sel.addEventListener('change', e => { current = e.target.value; renderAll(); });
    $('#soc-thr').addEventListener('input', renderAdopt);
    $('#soc-conf').addEventListener('input', () => { $('#soc-conf-o').textContent = $('#soc-conf').value; renderIssues(); });
    const sendBtns = document.querySelectorAll('[data-send]');
    sendBtns.forEach(b => b.addEventListener('click', sendToStudio));
    const dl = $('#soc-download'); if (dl) dl.addEventListener('click', downloadCSV);
    renderAll();
  });
})();
